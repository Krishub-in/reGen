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
  io.on('connection', (socket) => {
    const { userId, role, companyId } = socket.user;

    // Join company room
    if (role === 'param') {
      socket.join('global');
    }
    if (companyId) {
      socket.join(`company:${companyId}`);
    }

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
