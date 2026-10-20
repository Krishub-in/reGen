/**
 * Socket.IO server setup for real-time data synchronization.
 *
 * Channels (rooms) are company-scoped:
 *   company:<companyId> — all users in a company get events
 *   global              — SuperAdmin sees everything
 *
 * Events emitted from controllers:
 *   attendance:change   — attendance record created / updated
 *   task:change         — task created / updated / deleted (schedules)
 *   message:change      — messenger message created / deleted
 *   scrum:change        — scrum note created / updated
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import Notification from './models/Notification.js';

let io = null;

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
      const token = socket.handshake.auth?.token;
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
  io.on('connection', (socket) => {
    const { userId, role, companyId } = socket.user;

    // Join company room
    if (role === 'param') {
      socket.join('global');
    }
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // ── 1-to-1 WebRTC Call Signaling ──────────────────────────────────
    socket.on('call:initiate', async (data) => {
      try {
        const { callId, recipientId, mediaType, offer } = data || {};
        if (!recipientId || !callId) return;

        const callerName = socket.user?.username || 'Someone';
        const type = mediaType === 'video' ? 'video_call' : 'voice_call';

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
            metadata: { mediaType: mediaType || 'voice' },
            createdAt: new Date().toISOString(),
            read: false
          });
          await notif.save();
        }

        // Notify recipient with both call signal and notification event
        io.to(`user:${recipientId}`).emit('notification:new', notif);
        io.to(`user:${recipientId}`).emit('call:incoming', {
          callId,
          callerId: userId,
          callerName,
          mediaType: mediaType || 'voice',
          offer
        });
      } catch (err) {
        console.error('[Socket] call:initiate error:', err.message);
      }
    });

    socket.on('call:accept', async (data) => {
      try {
        const { callId, callerId, answer } = data || {};
        if (!callerId) return;

        if (callId) {
          await Notification.updateOne(
            { id: `call-notif-${callId}` },
            { $set: { actionStatus: 'accepted', read: true } }
          );
        }

        io.to(`user:${callerId}`).emit('call:accepted', {
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

        if (callId) {
          await Notification.updateOne(
            { id: `call-notif-${callId}` },
            { $set: { actionStatus: 'rejected', read: true } }
          );
        }

        io.to(`user:${callerId}`).emit('call:rejected', {
          callId,
          recipientId: userId,
          reason: reason || 'declined'
        });
      } catch (err) {
        console.error('[Socket] call:reject error:', err.message);
      }
    });

    socket.on('call:signal', (data) => {
      const { targetUserId, signal, callId } = data || {};
      if (!targetUserId) return;
      io.to(`user:${targetUserId}`).emit('call:signal', {
        senderId: userId,
        signal,
        callId
      });
    });

    socket.on('call:end', async (data) => {
      try {
        const { targetUserId, callId } = data || {};
        if (callId) {
          await Notification.updateOne(
            { id: `call-notif-${callId}` },
            { $set: { actionStatus: 'ended', read: true } }
          );
        }
        if (targetUserId) {
          io.to(`user:${targetUserId}`).emit('call:ended', {
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
        const companyId = socket.user?.companyId;

        if (companyId) {
          // Find all team members in this company
          const members = await User.find({
            companyId,
            userId: { $ne: userId },
            status: { $ne: 'inactive' }
          }).select('userId').lean();

          // Create notification for each team member
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
              metadata: { title: title || 'General Meeting', mediaType: mediaType || 'video' },
              createdAt: new Date().toISOString(),
              read: false
            });
            await notif.save().catch(() => {});
            io.to(`user:${m.userId}`).emit('notification:new', notif);
          }

          io.to(`company:${companyId}`).emit('meeting:started', {
            meetingId,
            title: title || 'General Meeting',
            hostId: userId,
            hostName,
            mediaType: mediaType || 'video'
          });
        }
      } catch (err) {
        console.error('[Socket] meeting:start error:', err.message);
      }
    });

    socket.on('meeting:join', (data) => {
      const { meetingId, userInfo } = data || {};
      if (!meetingId) return;
      socket.join(`meeting:${meetingId}`);
      socket.to(`meeting:${meetingId}`).emit('meeting:user-joined', {
        meetingId,
        userId,
        userInfo: userInfo || { userId, username: socket.user.username }
      });
    });

    socket.on('meeting:signal', (data) => {
      const { targetUserId, signal, meetingId } = data || {};
      if (!targetUserId) return;
      io.to(`user:${targetUserId}`).emit('meeting:signal', {
        fromUserId: userId,
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
      // cleanup handled automatically by socket.io
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
    io.to(`company:${companyId}`).emit(event, payload);
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
export function emitToUser(userId, event, payload = {}) {
  if (!io || !userId) return;
  const uid = typeof userId === 'string' ? userId : String(userId);
  io.to(`user:${uid}`).emit(event, payload);
}

