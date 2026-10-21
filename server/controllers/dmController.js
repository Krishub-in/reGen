import Conversation from '../models/Conversation.js';
import DirectMessage from '../models/DirectMessage.js';
import User from '../models/User.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany } from '../socket.js';
import { createAndSendNotification } from './notificationController.js';
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
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp3') || m.includes('mpeg')) return 'mp3';
  if (m.includes('m4a')) return 'm4a';
  if (m.includes('aac')) return 'aac';
  return 'bin';
};
const sanitizeFileBase = (name) => {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'file';
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
  const prefix = isVideo ? 'dm-video' : (isVoice ? 'dm-voice' : `dm-${sanitizeFileBase(seed)}`);
  const filename = `${prefix}-${Date.now()}-${index}${ext}`;
  const filePath = path.join(assetsDir, filename);
  await fs.promises.writeFile(filePath, Buffer.from(parsed.data, 'base64'));
  return `/assets/${filename}`;
};
const normalizeAttachment = async (att, seed, index) => {
  if (!att) return null;
  const data = att.data || att.url || att.dataUrl;
  let finalPath = null;
  if (typeof data === 'string' && data.startsWith('data:')) {
    finalPath = await saveAttachmentDataUri(data, att.name, seed, index);
  } else if (att.path) {
    finalPath = att.path;
  }
  if (finalPath) {
    finalPath = finalPath.replace(/\\/g, '/');
    const marker = '/assets/';
    const idx = finalPath.lastIndexOf(marker);
    if (idx >= 0) finalPath = `/assets/${finalPath.slice(idx + marker.length)}`;
    const isVideo = (att.type && att.type.startsWith('video')) || finalPath.includes('video') || (att.name && att.name.includes('video')) || /\.(mp4|mov|mkv)$/i.test(finalPath);
    const isVoice = (att.type && att.type.startsWith('audio')) || finalPath.includes('voice') || (att.name && att.name.includes('voice'));
    const detectedType = att.type || (isVideo ? 'video/webm' : (isVoice ? 'audio/webm' : (finalPath.endsWith('.webm') ? 'video/webm' : (finalPath.endsWith('.wav') ? 'audio/wav' : (finalPath.endsWith('.mp3') ? 'audio/mp3' : undefined)))));
    return { path: finalPath, name: att.name || finalPath.split('/').pop(), type: detectedType, size: att.size };
  }
  return null;
};

const normalizeIdentifier = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  if (typeof value.userId === 'string') return value.userId.trim();
  if (typeof value.id === 'string') return value.id.trim();
  if (typeof value._text === 'string') return value._text.trim();
  if (typeof value.toString === 'function') {
    const text = String(value).trim();
    if (text && text !== '[object Object]') return text;
  }
  return '';
};

// ─── Get or create a 1:1 conversation ───────────────────────────
export const getOrCreateConversation = async (req, res) => {
  try {
    let companyId = await resolveCompanyId(req, req.body);
    const myId = normalizeIdentifier(req.user?.userId);
    const recipientId = normalizeIdentifier(req.body?.recipientId);
    if (!recipientId) return res.status(400).json({ message: 'recipientId is required' });
    if (recipientId === myId) return res.status(400).json({ message: 'Cannot create conversation with yourself' });

    // Fallback companyId from recipient or sender if SuperAdmin or missing
    if (!companyId && recipientId) {
      const recipientUser = await User.findOne({ userId: recipientId }).select('companyId').lean();
      if (recipientUser?.companyId) companyId = recipientUser.companyId;
    }
    if (!companyId && myId) {
      const meUser = await User.findOne({ userId: myId }).select('companyId').lean();
      if (meUser?.companyId) companyId = meUser.companyId;
    }

    const participants = [myId, recipientId].sort();

    const query = {
      participants: { $all: participants, $size: 2 }
    };
    if (companyId) {
      query.companyId = companyId;
    }

    let convo = await Conversation.findOne(query);

    if (!convo) {
      convo = new Conversation({
        ...(companyId ? { companyId } : {}),
        participants
      });
      await convo.save();
    }
    res.status(200).json(convo);
  } catch (error) {
    console.error('[DM] getOrCreateConversation error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─── List all conversations for the current user ────────────────
export const getMyConversations = async (req, res) => {
  try {
    const companyId = req.companyId;
    const myId = req.user.userId;
    const filter = { participants: myId };
    if (companyId) filter.companyId = companyId;

    const convos = await Conversation.find(filter).sort({ updatedAt: -1 }).lean();

    // Attach unread counts
    const result = await Promise.all(convos.map(async (c) => {
      const unread = await DirectMessage.countDocuments({
        conversationId: c._id,
        senderId: { $ne: myId },
        readBy: { $ne: myId }
      });
      return { ...c, unreadCount: unread };
    }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Get messages for a conversation ────────────────────────────
export const getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const myId = req.user.userId;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.includes(myId)) return res.status(403).json({ message: 'Not a participant' });

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const before = req.query.before; // cursor: createdAt ISO string

    const filter = { conversationId: convo._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const msgs = await DirectMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json(msgs.reverse()); // return in chronological order
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Send a direct message ──────────────────────────────────────
export const sendDirectMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const myId = req.user.userId;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.includes(myId)) return res.status(403).json({ message: 'Not a participant' });

    const body = { ...req.body };
    body.conversationId = convo._id;
    body.companyId = convo.companyId;
    body.senderId = myId;
    body.readBy = [myId]; // sender has "read" it

    // Handle attachments
    if (Array.isArray(body.attachments)) {
      const seed = `dm-${conversationId}-${myId}`;
      const normalized = [];
      for (let i = 0; i < body.attachments.length; i++) {
        const saved = await normalizeAttachment(body.attachments[i], seed, i);
        if (saved) normalized.push(saved);
      }
      body.attachments = normalized;
    }

    const msg = new DirectMessage(body);
    await msg.save();

    // Update conversation lastMessage
    const preview = body.encrypted ? '🔒 Encrypted message' : (body.content || '[attachment]');
    convo.lastMessage = { content: preview, senderId: myId, timestamp: msg.createdAt };
    await convo.save();

    // Emit to all participants in the company room
    emitToCompany('dm:change', convo.companyId, {
      action: 'create',
      conversationId: convo._id.toString(),
      senderId: myId
    });

    // Send persistent & real-time notification to the recipient
    const recipientId = convo.participants.find(p => p !== myId);
    if (recipientId) {
      const isVoice = body.isVoice || (Array.isArray(body.attachments) && body.attachments.some(a => a.type?.startsWith('audio') || a.isVoice));
      const senderUser = await User.findOne({ userId: myId }).select('name username').lean();
      const senderName = senderUser?.name || senderUser?.username || req.user?.username || myId;

      await createAndSendNotification({
        companyId: convo.companyId,
        userId: recipientId,
        type: isVoice ? 'voice_message' : 'text_message',
        title: senderName,
        message: isVoice ? 'Sent a voice message' : (body.encrypted ? '🔒 Encrypted message' : (body.content || 'Sent an attachment')),
        senderId: myId,
        senderName,
        conversationId: convo._id.toString(),
        metadata: {
          messageId: msg._id.toString(),
          isVoice: !!isVoice,
          encrypted: !!body.encrypted
        }
      });
    }

    res.status(201).json(msg);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ─── Mark messages as read ──────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const myId = req.user.userId;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.includes(myId)) return res.status(403).json({ message: 'Not a participant' });

    await DirectMessage.updateMany(
      { conversationId: convo._id, readBy: { $ne: myId } },
      { $addToSet: { readBy: myId } }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Store E2E public key ───────────────────────────────────────
export const storePublicKey = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const myId = req.user.userId;
    const { publicKey } = req.body; // JWK JSON string

    if (!publicKey) return res.status(400).json({ message: 'publicKey is required' });

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.includes(myId)) return res.status(403).json({ message: 'Not a participant' });

    convo.publicKeys.set(myId, publicKey);
    await convo.save();

    // Notify the other participant that a key was stored
    emitToCompany('dm:key-exchange', convo.companyId, {
      conversationId: convo._id.toString(),
      userId: myId
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Edit a direct message ──────────────────────────────────────
export const editDirectMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const myId = req.user.userId;

    const msg = await DirectMessage.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.senderId !== myId) return res.status(403).json({ message: 'You can only edit your own messages' });

    const { content, iv, encrypted } = req.body;
    msg.content = content;
    if (iv !== undefined) msg.iv = iv;
    if (encrypted !== undefined) msg.encrypted = encrypted;
    msg.editedAt = new Date();
    await msg.save();

    const convo = await Conversation.findById(msg.conversationId);
    if (convo) {
      emitToCompany('dm:change', convo.companyId, {
        action: 'update',
        conversationId: msg.conversationId.toString(),
        messageId: msg._id.toString()
      });
    }

    res.status(200).json(msg);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Delete a direct message ────────────────────────────────────
export const deleteDirectMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const myId = req.user.userId;
    const role = (req.user.role || '').toLowerCase();

    const msg = await DirectMessage.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    if (msg.senderId !== myId && !['param', 'owner'].includes(role)) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    const convoId = msg.conversationId;
    await DirectMessage.deleteOne({ _id: msg._id });

    const convo = await Conversation.findById(convoId);
    if (convo) {
      emitToCompany('dm:change', convo.companyId, {
        action: 'delete',
        conversationId: convoId.toString(),
        messageId: msg._id.toString()
      });
    }

    res.status(200).json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
