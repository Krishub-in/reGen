import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToUser } from '../socket.js';

const parseMonthDay = (dob) => {
  if (!dob) return null;
  const s = String(dob).trim();
  const m = s.match(/^(\d{4})\D(\d{2})\D(\d{2})/);
  if (m) return { month: Number(m[2]), day: Number(m[3]) };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return { month: d.getMonth() + 1, day: d.getDate() };
};

const isStaffUser = (u) => {
  if (!u?.role) return false;
  if (typeof u.role === 'string') return u.role === 'staff';
  return !!u.role?.staff;
};

const getUserDisplayName = (u) => {
  return (u?.name || u?.username || u?.userId || '').toString().trim();
};

const startOfTodayLocal = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const diffDays = (fromDate, toDate) => {
  const ms = toDate.getTime() - fromDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const computeNextBirthday = (dob, fromDate) => {
  const md = parseMonthDay(dob);
  if (!md) return null;
  const year = fromDate.getFullYear();
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const normalizeDay = (y, month, day) => {
    if (month === 2 && day === 29 && !isLeap(y)) return 28;
    return day;
  };
  const dayThisYear = normalizeDay(year, md.month, md.day);
  let candidate = new Date(year, md.month - 1, dayThisYear);
  candidate.setHours(0, 0, 0, 0);
  if (candidate < fromDate) {
    const nextYear = year + 1;
    const dayNextYear = normalizeDay(nextYear, md.month, md.day);
    candidate = new Date(nextYear, md.month - 1, dayNextYear);
    candidate.setHours(0, 0, 0, 0);
  }
  return candidate;
};

const buildReminderNotifications = (staffUser, birthdayDate, daysBefore, recipients) => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const birthdayIso = `${birthdayDate.getFullYear()}-${pad2(birthdayDate.getMonth() + 1)}-${pad2(birthdayDate.getDate())}`;
  const staffName = getUserDisplayName(staffUser);
  const createdAt = new Date().toISOString();
  const title = 'Birthday Reminder';
  const message = `Reminder: ${staffName}'s birthday is on ${birthdayIso}.`;
  return recipients.map((r) => {
    const recipientId = (r?.userId || '').toString();
    const staffId = (staffUser?.userId || '').toString();
    return {
      id: `bday-${staffId}-${birthdayIso}-d${daysBefore}-${recipientId}`,
      userId: recipientId,
      title,
      message,
      createdAt,
      read: false
    };
  });
};

export const runBirthdayReminderJob = async () => {
  const today = startOfTodayLocal();
  const allUsers = await User.find();

  // Group users by companyId for isolation
  const companyMap = new Map(); // companyId -> [users]
  for (const u of allUsers) {
    const cid = u.companyId ? u.companyId.toString() : '__global__';
    if (!companyMap.has(cid)) companyMap.set(cid, []);
    companyMap.get(cid).push(u);
  }

  const targetDays = new Set([7, 1]);
  const toInsert = [];

  for (const [companyIdStr, users] of companyMap) {
    const recipients = users.filter((u) => String(u.status || 'active') !== 'inactive');
    const staff = recipients.filter((u) => isStaffUser(u) && u.dateOfBirth);

    for (const s of staff) {
      const nextBday = computeNextBirthday(s.dateOfBirth, today);
      if (!nextBday) continue;
      const daysUntil = diffDays(today, nextBday);
      if (!targetDays.has(daysUntil)) continue;
      // Skip users without companyId — they can't receive scoped notifications
      if (!s.companyId) continue;
      const notifications = buildReminderNotifications(s, nextBday, daysUntil, recipients);
      // Stamp companyId on each notification
      for (const n of notifications) n.companyId = s.companyId;
      toInsert.push(...notifications);
    }
  }

  if (toInsert.length === 0) {
    return { created: 0, attempted: 0 };
  }

  const ops = toInsert.map((doc) => ({
    updateOne: {
      filter: { id: doc.id },
      update: { $setOnInsert: doc },
      upsert: true
    }
  }));
  const result = await Notification.bulkWrite(ops, { ordered: false });
  const created = result?.upsertedCount || 0;
  return { created, attempted: toInsert.length };
};

export const createNotification = async (req, res) => {
  try {
    const body = { ...req.body };
    body.companyId = await resolveCompanyId(req, body);
    const notification = new Notification(body);
    await notification.save();
    emitToUser(notification.userId, 'notification:new', notification);
    res.status(201).json(notification);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getUserNotifications = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const userIds = new Set([targetUserId]);
    if (req.user?.userId) userIds.add(String(req.user.userId));
    if (req.user?.id) userIds.add(String(req.user.id));
    if (req.user?.StaffId) userIds.add(String(req.user.StaffId));

    try {
      const isOid = mongoose.isValidObjectId(targetUserId);
      const u = await User.findOne({
        $or: [
          { userId: targetUserId },
          { StaffId: targetUserId },
          { username: targetUserId },
          ...(isOid ? [{ _id: targetUserId }] : [])
        ]
      }).select('userId StaffId username _id').lean();

      if (u) {
        if (u.userId) userIds.add(String(u.userId));
        if (u.StaffId) userIds.add(String(u.StaffId));
        if (u.username) userIds.add(String(u.username));
        if (u._id) userIds.add(String(u._id));
      }
    } catch (_) {}

    const filter = { userId: { $in: Array.from(userIds) } };
    if (req.companyId) filter.companyId = req.companyId;
    const list = await Notification.find(filter).sort({ createdAt: -1 });
    res.status(200).json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const rawId = req.params.id;
    // Find notification by id or _id
    let notification = await Notification.findOneAndUpdate(
      { id: rawId },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) {
      notification = await Notification.findByIdAndUpdate(
        rawId,
        { $set: { read: true } },
        { new: true }
      );
    }
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    emitToUser(notification.userId, 'notification:read', { id: notification.id, read: true });
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const userIds = [targetUserId];
    if (req.user?.userId && !userIds.includes(req.user.userId)) {
      userIds.push(req.user.userId);
    }
    if (req.user?.id && !userIds.includes(req.user.id)) {
      userIds.push(req.user.id);
    }
    const filter = { userId: { $in: userIds }, read: false };
    const result = await Notification.updateMany(filter, { $set: { read: true } });
    
    userIds.forEach(uid => {
      emitToUser(uid, 'notification:read_all', { userId: uid });
    });
    res.status(200).json({ message: 'All notifications marked as read', modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateNotificationAction = async (req, res) => {
  try {
    const { actionStatus } = req.body;
    const filter = { id: req.params.id };
    if (req.companyId) filter.companyId = req.companyId;
    const notification = await Notification.findOneAndUpdate(
      filter,
      { $set: { actionStatus, read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    emitToUser(notification.userId, 'notification:change', notification);
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const filter = { id: req.params.id };
    if (req.companyId) filter.companyId = req.companyId;
    const n = await Notification.findOneAndDelete(filter);
    if (!n) return res.status(404).json({ message: 'Notification not found' });
    emitToUser(n.userId, 'notification:change', { id: n.id, deleted: true });
    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createAndSendNotification = async (payload) => {
  try {
    const doc = {
      id: payload.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      companyId: payload.companyId,
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      type: payload.type || 'general',
      senderId: payload.senderId,
      senderName: payload.senderName,
      conversationId: payload.conversationId,
      callId: payload.callId,
      meetingId: payload.meetingId,
      actionStatus: payload.actionStatus || 'none',
      metadata: payload.metadata || {},
      createdAt: payload.createdAt || new Date().toISOString(),
      read: false
    };

    // Prevent duplicate calls if pending call notification already exists
    if (doc.type === 'voice_call' || doc.type === 'video_call') {
      const existing = await Notification.findOne({
        userId: doc.userId,
        callId: doc.callId,
        actionStatus: 'pending'
      });
      if (existing) return existing;
    }

    const n = new Notification(doc);
    await n.save();

    const userIdsToNotify = new Set([String(doc.userId)]);
    try {
      const isOid = mongoose.isValidObjectId(doc.userId);
      const recipient = await User.findOne({
        $or: [
          { userId: doc.userId },
          { StaffId: doc.userId },
          { username: doc.userId },
          ...(isOid ? [{ _id: doc.userId }] : [])
        ]
      }).select('userId StaffId username _id').lean();
      if (recipient) {
        if (recipient.userId) userIdsToNotify.add(String(recipient.userId));
        if (recipient.StaffId) userIdsToNotify.add(String(recipient.StaffId));
        if (recipient.username) userIdsToNotify.add(String(recipient.username));
        if (recipient._id) userIdsToNotify.add(String(recipient._id));
      }
    } catch (_) {}

    userIdsToNotify.forEach(uid => {
      emitToUser(uid, 'notification:new', n);
    });

    return n;
  } catch (err) {
    console.error('[Notification] Failed to create notification:', err.message);
    return null;
  }
};

export const runBirthdayReminders = async (_req, res) => {
  try {
    const result = await runBirthdayReminderJob();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    const targetUserId = req.params.userId || req.user?.userId;
    const authUserId = req.user?.userId;
    const authId = req.user?.id;
    const authStaffId = req.user?.StaffId;

    const userIds = new Set([String(targetUserId)]);
    if (authUserId) userIds.add(String(authUserId));
    if (authId) userIds.add(String(authId));
    if (authStaffId) userIds.add(String(authStaffId));

    try {
      const isOid = mongoose.isValidObjectId(targetUserId);
      const u = await User.findOne({
        $or: [
          { userId: targetUserId },
          { StaffId: targetUserId },
          { username: targetUserId },
          ...(isOid ? [{ _id: targetUserId }] : [])
        ]
      }).select('userId StaffId username _id').lean();

      if (u) {
        if (u.userId) userIds.add(String(u.userId));
        if (u.StaffId) userIds.add(String(u.StaffId));
        if (u.username) userIds.add(String(u.username));
        if (u._id) userIds.add(String(u._id));
      }
    } catch (_) {}

    // Security check: non-param users can only clear their own notifications
    if (req.user?.role !== 'param') {
      const isSelf = userIds.has(String(authUserId)) || 
                     (authId && userIds.has(String(authId))) || 
                     (authStaffId && userIds.has(String(authStaffId))) ||
                     (req.user?.username && userIds.has(String(req.user.username)));
      if (!isSelf) {
        return res.status(403).json({ message: 'You can only clear your own notifications' });
      }
    }

    const filter = { userId: { $in: Array.from(userIds) } };
    if (req.companyId) filter.companyId = req.companyId;

    const result = await Notification.deleteMany(filter);

    userIds.forEach(uid => {
      emitToUser(uid, 'notification:clear_all', { userId: uid });
    });

    res.status(200).json({ message: 'All notifications cleared successfully', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


