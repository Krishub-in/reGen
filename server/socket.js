/**
 * Socket.IO server setup for real-time data synchronization.
 *
 * Channels (rooms) are company-scoped:
 *   company:<companyId> — all users in a company get events
 *   global              — SuperAdmin sees everything
 *   user:<userId>       — targeted direct messages, calls, notifications
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from './models/User.js';
import Notification from './models/Notification.js';

let io = null;

// In-memory active calls cache for reliable WebRTC offer delivery across tabs & notification clicks
const activeCalls = new Map(); // callId -> { callId, callerId, callerName, recipientId, mediaType, offer, actionStatus, startedAt }

/**
 * Resolve all socket room aliases for a given user identifier.
 * Matches userId, username, and Mongo _id so calls and signals
 * reach the recipient regardless of which identifier was used.
 */
async function resolveUserRooms(identifier) {
  const rooms = new Set();
  if (!identifier) return rooms;
  const strId = String(identifier).trim();
  rooms.add(`user:${strId}`);
  try {
    const isOid = mongoose.isValidObjectId(strId);
    const u = await User.findOne({
      $or: [
        { userId: strId },
        { username: strId },
        ...(isOid ? [{ _id: new mongoose.Types.ObjectId(strId) }] : [])
      ]
    }).select('_id userId username companyId').lean();
    if (u) {
      if (u.userId) rooms.add(`user:${u.userId}`);
      if (u._id) rooms.add(`user:${u._id.toString()}`);
      if (u.username) rooms.add(`user:${u.username}`);
    }
  } catch {}
  return rooms;
}

/**
 * Broadcast an event to multiple candidate rooms with automatic Socket.IO deduplication.
 * Ensures that sockets subscribed to multiple alias rooms (e.g. userId and _id)
 * receive the event exactly ONCE without duplicate packets.
 */
function broadcastToRooms(roomSet, event, payload) {
  if (!io || !roomSet || roomSet.size === 0) return;
  let broadcaster = io;
  for (const r of roomSet) {
    broadcaster = broadcaster.to(r);
  }
  broadcaster.emit(event, payload);
}

/**
 * Initialise Socket.IO on an existing HTTP server.
 * Call once from index.js after `app.listen()`.
 */
export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/ws',                 // avoids colliding with /socket.io default
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new Error('Server misconfigured'));

      const decoded = jwt.verify(token, secret);
      socket.user = decoded; // { userId, username, role, companyId }

      // Resolve companyId if not in JWT (legacy tokens)
      if (!decoded.companyId && decoded.role !== 'param') {
        const user = await User.findOne({ userId: decoded.userId }).select('companyId').lean();
        if (user?.companyId) socket.user.companyId = user.companyId.toString();
      }

      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────
  io.on('connection', async (socket) => {
    const { userId, role } = socket.user;

    // Join company room / global room
    if (role === 'param') {
      socket.join('global');
    }

    // Join all user identifier rooms for this connection
    const myRooms = await resolveUserRooms(userId);
    myRooms.forEach(room => socket.join(room));

    // Resolve company room
    let companyId = socket.user.companyId;
    if (!companyId && role !== 'param') {
      try {
        const u = await User.findOne({ userId }).select('companyId').lean();
        if (u?.companyId) companyId = u.companyId.toString();
      } catch {}
    }
    if (companyId) {
      const coStr = companyId.toString();
      socket.join(`company:${coStr}`);
      socket.user.companyId = coStr;
    }

    // ── 1-to-1 WebRTC Call Signaling ──────────────────────────────────
    socket.on('call:initiate', async (data) => {
      try {
        const { callId, recipientId, mediaType, offer } = data || {};
        if (!recipientId || !callId) return;

        const callerName = socket.user?.username || 'Someone';
        const type = mediaType === 'video' ? 'video_call' : 'voice_call';

        // Cache active call offer in memory for notification clicks / tab transitions
        activeCalls.set(callId, {
          callId,
          callerId: userId,
          callerName,
          recipientId,
          mediaType: mediaType || 'voice',
          offer,
          actionStatus: 'pending',
          startedAt: Date.now()
        });

        // Auto-clean active call after 60s if not answered
        setTimeout(() => {
          const call = activeCalls.get(callId);
          if (call && call.actionStatus !== 'accepted') {
            activeCalls.delete(callId);
          }
        }, 60000);

        const targetRooms = await resolveUserRooms(recipientId);

        // Persist notification for recipient
        const notifId = `call-notif-${callId}`;
        const existing = await Notification.findOne({ id: notifId });
        let notif = existing;
        if (!existing) {
          notif = new Notification({
            id: notifId,
            companyId: socket.user.companyId || null,
            userId: recipientId,
            title: mediaType === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call',
            message: `${callerName} is calling you...`,
            type,
            senderId: userId,
            senderName: callerName,
            callId,
            actionStatus: 'pending',
            metadata: { mediaType: mediaType || 'voice', callerName, callerId: userId },
            createdAt: new Date().toISOString(),
            read: false
          });
          await notif.save().catch(() => {});
        }

        const incomingPayload = {
          callId,
          callerId: userId,
          callerName,
          mediaType: mediaType || 'voice',
          offer
        };

        // Broadcast to recipient with automatic deduplication across alias rooms
        broadcastToRooms(targetRooms, 'notification:new', notif);
        broadcastToRooms(targetRooms, 'call:incoming', incomingPayload);
      } catch (err) {
        console.error('[Socket] call:initiate error:', err.message);
      }
    });

    // Client requests offer for active call (e.g. when opening from notification)
    socket.on('call:get-active', (data, callback) => {
      const call = activeCalls.get(data?.callId);
      if (typeof callback === 'function') {
        callback(call || null);
      }
    });

    socket.on('call:accept', async (data) => {
      try {
        const { callId, callerId, answer } = data || {};
        if (!callerId) return;

        if (callId) {
          const call = activeCalls.get(callId);
          if (call) {
            call.actionStatus = 'accepted';
            call.acceptedAt = Date.now();
          }
          await Notification.updateOne(
            { id: `call-notif-${callId}` },
            { $set: { actionStatus: 'accepted', read: true } }
          ).catch(() => {});
        }

        const targetRooms = await resolveUserRooms(callerId);
        broadcastToRooms(targetRooms, 'call:accepted', {
          callId,
          recipientId: userId,
          answer
        });
      } catch (err) {
        console.error('[Socket] call:accept error:', err.message);
      }
    });

    socket.on('call:reject', async (data) => {
      try {
        const { callId, callerId, reason } = data || {};
        if (!callerId) return;

        // CRITICAL GUARD: If call is already connected / accepted, never terminate it from duplicate reject packets!
        const existingCall = activeCalls.get(callId);
        if (existingCall?.actionStatus === 'accepted') {
          return;
        }

        if (callId) {
          activeCalls.delete(callId);
          await Notification.updateOne(
            { id: `call-notif-${callId}` },
            { $set: { actionStatus: 'rejected', read: true } }
          ).catch(() => {});
        }

        const targetRooms = await resolveUserRooms(callerId);
        broadcastToRooms(targetRooms, 'call:rejected', {
          callId,
          recipientId: userId,
          reason: reason || 'declined'
        });
      } catch (err) {
        console.error('[Socket] call:reject error:', err.message);
      }
    });

    socket.on('call:signal', async (data) => {
      const { targetUserId, signal, callId } = data || {};
      if (!targetUserId) return;
      const targetRooms = await resolveUserRooms(targetUserId);
      broadcastToRooms(targetRooms, 'call:signal', {
        senderId: userId,
        signal,
        callId
      });
    });

    socket.on('call:end', async (data) => {
      try {
        const { targetUserId, callId } = data || {};
        if (callId) {
          activeCalls.delete(callId);
          await Notification.updateOne(
            { id: `call-notif-${callId}` },
            { $set: { actionStatus: 'ended', read: true } }
          ).catch(() => {});
        }
        if (targetUserId) {
          const targetRooms = await resolveUserRooms(targetUserId);
          broadcastToRooms(targetRooms, 'call:ended', {
            callId,
            endedBy: userId
          });
        }
      } catch (err) {
        console.error('[Socket] call:end error:', err.message);
      }
    });

    // ── Team Voice/Video Meeting Signaling ───────────────────────────
    socket.on('meeting:start', async (data) => {
      try {
        const { meetingId, title, mediaType } = data || {};
        if (!meetingId) return;

        const hostName = socket.user?.username || 'Team Lead';
        let companyId = socket.user?.companyId;

        if (!companyId) {
          const u = await User.findOne({ userId }).select('companyId').lean();
          if (u?.companyId) companyId = u.companyId.toString();
        }

        if (companyId) {
          const isOid = mongoose.isValidObjectId(companyId);
          const companyFilter = isOid
            ? { $in: [companyId, new mongoose.Types.ObjectId(companyId)] }
            : companyId;

          // Find all active members in this company
          const members = await User.find({
            companyId: companyFilter,
            userId: { $ne: userId },
            status: { $ne: 'inactive' }
          }).select('userId _id username').lean();

          const meetingPayload = {
            meetingId,
            title: title || 'Team Meeting',
            hostId: userId,
            hostName,
            mediaType: mediaType || 'video',
            companyId: companyId.toString()
          };

          // Create notification and emit instant meeting invitation to each team member
          for (const m of members) {
            const notif = new Notification({
              id: `meeting-notif-${meetingId}-${m.userId}`,
              companyId,
              userId: m.userId,
              title: 'Team Meeting Started',
              message: `${hostName} started a meeting: "${title || 'General Meeting'}"`,
              type: 'team_meeting',
              senderId: userId,
              senderName: hostName,
              meetingId,
              actionStatus: 'pending',
              metadata: { title: title || 'General Meeting', mediaType: mediaType || 'video', hostName, hostId: userId },
              createdAt: new Date().toISOString(),
              read: false
            });
            await notif.save().catch(() => {});
            io.to(`user:${m.userId}`).emit('notification:new', notif);
            io.to(`user:${m.userId}`).emit('meeting:started', meetingPayload);
          }

          io.to(`company:${companyId.toString()}`).emit('meeting:started', meetingPayload);
        }
      } catch (err) {
        console.error('[Socket] meeting:start error:', err.message);
      }
    });

    socket.on('meeting:join', async (data) => {
      try {
        const { meetingId, userInfo } = data || {};
        if (!meetingId) return;
        socket.join(`meeting:${meetingId}`);

        // Notify other participants already in room that someone joined
        socket.to(`meeting:${meetingId}`).emit('meeting:user-joined', {
          meetingId,
          userId,
          userInfo: userInfo || { userId, username: socket.user.username }
        });

        // Query existing sockets in room to send list of current participants to new joiner
        const socketsInRoom = await io.in(`meeting:${meetingId}`).fetchSockets();
        const existingUsers = [];
        for (const s of socketsInRoom) {
          if (s.id !== socket.id && s.user?.userId) {
            existingUsers.push({
              userId: s.user.userId,
              username: s.user.username || 'Colleague',
            });
          }
        }
        socket.emit('meeting:existing-users', {
          meetingId,
          users: existingUsers
        });
      } catch (err) {
        console.error('[Socket] meeting:join error:', err.message);
      }
    });

    socket.on('meeting:signal', async (data) => {
      const { targetUserId, signal, meetingId } = data || {};
      if (!targetUserId) return;
      const targetRooms = await resolveUserRooms(targetUserId);
      broadcastToRooms(targetRooms, 'meeting:signal', {
        fromUserId: userId,
        fromUsername: socket.user?.username || 'Colleague',
        signal,
        meetingId
      });
    });

    socket.on('meeting:leave', (data) => {
      const { meetingId } = data || {};
      if (!meetingId) return;
      socket.leave(`meeting:${meetingId}`);
      socket.to(`meeting:${meetingId}`).emit('meeting:user-left', {
        meetingId,
        userId
      });
    });

    socket.on('disconnect', () => {
      // Clean up any pending calls initiated by this socket user that never connected
      for (const [cId, cInfo] of activeCalls.entries()) {
        if (cInfo.callerId === userId && cInfo.actionStatus !== 'accepted') {
          activeCalls.delete(cId);
        }
      }
    });
  });

  return io;
}

/**
 * Get the current Socket.IO server instance.
 */
export function getIO() {
  return io;
}

/**
 * Emit a real-time event to all users in a company.
 *
 * @param {string}                     event     - Event name, e.g. 'task:change'
 * @param {import('mongoose').ObjectId|string|null} companyId - Company scope (null = global broadcast)
 * @param {object}                     payload   - Data payload
 */
export function emitToCompany(event, companyId, payload = {}) {
  if (!io) return;
  if (companyId) {
    io.to(`company:${companyId.toString()}`).emit(event, payload);
  }
  // SuperAdmin always gets everything
  io.to('global').emit(event, payload);
}

/**
 * Emit a real-time event directly to a specific user.
 *
 * @param {string} userId  - Target user identifier
 * @param {string} event   - Event name
 * @param {object} payload - Data payload
 */
export async function emitToUser(userId, event, payload = {}) {
  if (!io || !userId) return;
  const targetRooms = await resolveUserRooms(userId);
  broadcastToRooms(targetRooms, event, payload);
}
