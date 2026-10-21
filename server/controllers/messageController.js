import Message from '../models/Message.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany } from '../socket.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, '..', '..', 'assets');

const ensureAssetsDir = async () => {
  await fs.promises.mkdir(assetsDir, { recursive: true });
};

const parseDataUri = (value) => {
  if (!value || typeof value !== 'string') return null;
  const marker = ';base64,';
  const markerIdx = value.indexOf(marker);
  if (markerIdx === -1) return null;
  const prefix = value.slice(0, markerIdx);
  const data = value.slice(markerIdx + marker.length);
  const match = prefix.match(/^data:([^;]+)/);
  if (!match) return null;
  return { mime: match[1], data };
};

const extFromMime = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'application/pdf') return 'pdf';
  if (m === 'text/plain') return 'txt';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp3') || m.includes('mpeg')) return 'mp3';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  return 'bin';
};

const sanitizeFileBase = (name) => {
  const base = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const trimmed = base.replace(/^_+|_+$/g, '').slice(0, 64);
  return trimmed || 'file';
};

const saveAttachmentDataUri = async (dataUri, name, seed, index) => {
  const parsed = parseDataUri(dataUri);
  if (!parsed) return null;
  await ensureAssetsDir();
  const base = sanitizeFileBase(name);
  const extFromName = path.extname(base);
  const ext = extFromName || `.${extFromMime(parsed.mime)}`;
  const isVideo = parsed.mime.startsWith('video') || base.includes('video') || (ext === '.mp4' || ext === '.mov');
  const isVoice = parsed.mime.startsWith('audio') || base.includes('voice');
  const prefix = isVideo ? 'msg-video' : (isVoice ? 'msg-voice' : `msg-${sanitizeFileBase(seed || 'message')}`);
  const filename = `${prefix}-${Date.now()}-${index}${ext}`;
  const filePath = path.join(assetsDir, filename);
  await fs.promises.writeFile(filePath, Buffer.from(parsed.data, 'base64'));
  return `/assets/${filename}`;
};

const normalizeAttachment = async (att, seed, index) => {
  if (!att) return null;
  if (typeof att === 'string') {
    const normalized = att.startsWith('/assets/data:') ? att.replace(/^\/assets\//, '') : att;
    if (normalized.startsWith('data:')) {
      const p = await saveAttachmentDataUri(normalized, undefined, seed, index);
      return { path: p, name: path.basename(p) };
    }
    return { path: normalized, name: normalized.split('/').pop() };
  }

  const data = att.data || att.url || att.dataUrl;
  let finalPath = null;
  if (typeof data === 'string' && data.startsWith('data:')) {
    finalPath = await saveAttachmentDataUri(data, att.name, seed, index);
  } else if (typeof att.path === 'string') {
    finalPath = att.path;
  } else if (typeof att.url === 'string') {
    finalPath = att.url;
  }

  if (finalPath) {
    // Make sure we store forward-slash based paths for frontend compatibility
    finalPath = finalPath.replace(/\\/g, '/');
    const marker = '/assets/';
    const idx = finalPath.lastIndexOf(marker);
    if (idx >= 0) finalPath = `/assets/${finalPath.slice(idx + marker.length)}`;

    const isVideo = (att.type && att.type.startsWith('video')) || finalPath.includes('video') || (att.name && att.name.includes('video')) || /\.(mp4|mov|mkv)$/i.test(finalPath);
    const isVoice = (att.type && att.type.startsWith('audio')) || finalPath.includes('voice') || (att.name && att.name.includes('voice'));
    const detectedType = att.type || (isVideo ? 'video/webm' : (isVoice ? 'audio/webm' : (finalPath.endsWith('.webm') ? 'video/webm' : (finalPath.endsWith('.wav') ? 'audio/wav' : (finalPath.endsWith('.mp3') ? 'audio/mp3' : undefined)))));

    return {
      path: finalPath,
      name: att.name || finalPath.split('/').pop(),
      type: detectedType,
      size: att.size
    };
  }
  return null;
};

export const createMessage = async (req, res) => {
  try {
    const body = { ...req.body };
    body.companyId = await resolveCompanyId(req, body);
    body.messageId = body.messageId || body.id;
    if (Array.isArray(body.attachments)) {
      const seed = body.messageId || body.id || body.senderId || 'message';
      const normalized = [];
      for (let i = 0; i < body.attachments.length; i += 1) {
        const att = body.attachments[i];
        const saved = await normalizeAttachment(att, seed, i);
        if (saved) normalized.push(saved);
      }
      body.attachments = normalized;
    }
    const msg = new Message(body);
    await msg.save();
    emitToCompany('message:change', msg.companyId, { action: 'create', id: msg.messageId || msg.id });
    res.status(201).json(msg);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllMessages = async (req, res) => {
  try {
    const filter = req.companyId ? { companyId: req.companyId } : {};
    const msgs = await Message.find(filter).sort({ createdAt: 1 });
    res.status(200).json(msgs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const EDIT_DELETE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const PRIVILEGED_ROLES = ['param', 'owner'];

const canModifyMessage = (user, message) => {
  const role = (user.role || '').toLowerCase();
  // param and owner can modify any message anytime
  if (PRIVILEGED_ROLES.includes(role)) return { allowed: true };
  // Other users can only modify their own messages
  const userId = user.userId || '';
  const senderId = message.senderId || '';
  if (userId !== senderId) return { allowed: false, reason: 'You can only modify your own messages' };
  // Check 15-minute window from message creation
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  if (!createdAt) return { allowed: false, reason: 'Cannot determine message creation time' };
  const elapsed = Date.now() - createdAt.getTime();
  if (elapsed > EDIT_DELETE_WINDOW_MS) {
    return { allowed: false, reason: 'Edit/delete window (15 minutes) has expired' };
  }
  return { allowed: true };
};

export const updateMessage = async (req, res) => {
  try {
    const id = req.params.id;
    const baseQuery = { $or: [{ messageId: id }, { id }, { _id: id }] };
    const query = req.companyId ? { ...baseQuery, companyId: req.companyId } : baseQuery;
    const msg = await Message.findOne(query);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    const check = canModifyMessage(req.user, msg);
    if (!check.allowed) return res.status(403).json({ message: check.reason });

    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    msg.content = content.trim();
    msg.editedAt = new Date();
    await msg.save();
    emitToCompany('message:change', msg.companyId, { action: 'update', id: msg.messageId || msg.id });
    res.status(200).json(msg);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const id = req.params.id;
    const baseQuery = { $or: [{ messageId: id }, { id }, { _id: id }] };
    const query = req.companyId ? { ...baseQuery, companyId: req.companyId } : baseQuery;
    const msg = await Message.findOne(query);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    const check = canModifyMessage(req.user, msg);
    if (!check.allowed) return res.status(403).json({ message: check.reason });

    await Message.deleteOne({ _id: msg._id });
    emitToCompany('message:change', msg.companyId, { action: 'delete', id: msg.messageId || msg.id });
    res.status(200).json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
