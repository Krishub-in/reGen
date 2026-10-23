import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  useGetAllUsers,
  useGetMyConversations,
  useGetConversationMessages,
  useGetOrCreateConversation,
  useSendDirectMessage,
  useMarkConversationRead,
  useStorePublicKey,
  useDeleteDirectMessage,
  useEditDirectMessage,
} from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Send, Paperclip, X, ArrowLeft, Search, ShieldCheck, Lock, Pencil, Trash2, Check,
  MessageSquare, ChevronUp, ChevronDown, Users, Phone, Video, Mic, Square, AlertCircle, RotateCw, Volume2
} from 'lucide-react';

import { toast } from 'sonner';
import {
  generateKeyPair, hasKeyPair, deriveSharedKey,
  encryptMessage, decryptMessage, getStoredPrivateKey
} from '../../utils/e2e';
import { stopMediaStream, parseMediaError } from '../../lib/mediaUtils';
import EmojiPicker from '../EmojiPicker';
import VoiceConfirmDialog from '../VoiceConfirmDialog';
import VideoRecordDialog from '../VideoRecordDialog';

const EMPTY_ARRAY = [];

export default function PrivateChatModule({ userProfile }) {
  const { identity } = useCustomAuth();
  const { data: users = EMPTY_ARRAY } = useGetAllUsers();
  const { data: conversations = EMPTY_ARRAY, refetch: refetchConvos } = useGetMyConversations();
  const getOrCreate = useGetOrCreateConversation();
  const sendDM = useSendDirectMessage();
  const markRead = useMarkConversationRead();
  const storeKey = useStorePublicKey();
  const deleteDM = useDeleteDirectMessage();
  const editDM = useEditDirectMessage();

  const [activeConvoId, setActiveConvoId] = useState(null);
  const [isVideoRecordOpen, setIsVideoRecordOpen] = useState(false);
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [sharedKey, setSharedKey] = useState(null);
  const [e2eReady, setE2eReady] = useState(false);
  const bottomRef = useRef(null);
  const textInputRef = useRef(null);

  const handleSelectEmoji = (emoji) => {
    const input = textInputRef.current;
    if (!input) {
      setContent((prev) => prev + emoji);
      return;
    }
    const start = input.selectionStart ?? content.length;
    const end = input.selectionEnd ?? content.length;
    const updated = content.slice(0, start) + emoji + content.slice(end);
    setContent(updated);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [msgSearchTerm, setMsgSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const matchRefs = useRef([]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const isRecordingVoice = isRecording;
  const voiceDuration = recordDuration;
  const formatVoiceDuration = useCallback((secs) => {
    const s = Number(secs) || 0;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }, []);
  const [voiceError, setVoiceError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechRecognitionRef = useRef(null);
  const liveTranscriptRef = useRef('');
  const [recordedVoiceModal, setRecordedVoiceModal] = useState(null);

  // Voice-to-text (Speech dictation) state
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoiceToText = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice typing is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }

    if (isDictating) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsDictating(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsDictating(true);
        toast.info('Listening... Speak into your microphone');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setContent((prev) => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${transcript.trim()}` : transcript.trim();
        });
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsDictating(false);
        if (event.error !== 'no-speech') {
          toast.error(`Speech recognition: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsDictating(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Speech recognition initiation error:', err);
      setIsDictating(false);
      toast.error('Could not start speech recognition');
    }
  };

  // Clean up any ongoing recording when component unmounts
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.stream) {
          stopMediaStream(mediaRecorderRef.current.stream);
        }
        try {
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch {}
      }
    };
  }, []);


  // Voice record timer
  useEffect(() => {
    let t = null;
    if (isRecording) {
      t = setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } else {
      setRecordDuration(0);
    }
    return () => clearInterval(t);
  }, [isRecording]);

  const startVoiceRecording = async () => {
    setVoiceError(null);
    liveTranscriptRef.current = '';
    try {
      // Audio-only constraint for voice messages without hardcoded device IDs
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      // Start speech recognition in background to transcribe live
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = navigator.language || 'en-US';
          rec.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript + ' ';
            }
            liveTranscriptRef.current = transcript.trim();
          };
          rec.onerror = (e) => {
            console.warn('[PrivateChatModule] Live transcription notice:', e?.error);
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch (e) {
          console.warn('[PrivateChatModule] Speech recognition start notice:', e);
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopMediaStream(stream);
        if (speechRecognitionRef.current) {
          try { speechRecognitionRef.current.stop(); } catch {}
          speechRecognitionRef.current = null;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = reader.result;
          const audioUrl = URL.createObjectURL(audioBlob);
          // Ask the user: Send as voice note, convert to normal text, or edit
          setRecordedVoiceModal({
            audioBlob,
            base64Data,
            audioUrl,
            duration: recordDuration,
            transcript: liveTranscriptRef.current.trim()
          });
        };
      };

      recorder.start();
      setIsRecording(true);
      setRecordDuration(0);
    } catch (err) {
      console.error('[PrivateChatModule] startVoiceRecording error:', err);
      const parsed = parseMediaError(err, 'voice');
      setVoiceError({
        ...parsed,
        onRetry: () => {
          setVoiceError(null);
          startVoiceRecording();
        },
        onCancel: () => {
          setVoiceError(null);
          cancelVoiceRecording();
        },
      });
    }
  };

  const stopVoiceRecording = () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelVoiceRecording = () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.stream) {
        stopMediaStream(mediaRecorderRef.current.stream);
      }
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordDuration(0);
  };

  const handleConfirmSendVoice = async () => {
    if (!recordedVoiceModal?.base64Data || !activeConvoId) return;
    try {
      await sendDM.mutateAsync({
        conversationId: activeConvoId,
        message: {
          senderName: userProfile?.name || userProfile?.username || 'Me',
          content: '🎤 Voice message',
          isVoice: true,
          attachments: [
            {
              name: `voice-${Date.now()}.webm`,
              type: 'audio/webm',
              data: recordedVoiceModal.base64Data,
              path: recordedVoiceModal.base64Data,
            },
          ],
        },
      });
      toast.success('Voice message sent');
    } catch (err) {
      toast.error('Failed to send voice message');
    } finally {
      if (recordedVoiceModal.audioUrl) URL.revokeObjectURL(recordedVoiceModal.audioUrl);
      setRecordedVoiceModal(null);
    }
  };

  const handleSendRecordedVideo = async ({ videoBlob, base64Data, duration, caption }) => {
    if (!base64Data || !activeConvoId) return;
    try {
      await sendDM.mutateAsync({
        conversationId: activeConvoId,
        message: {
          senderName: userProfile?.name || userProfile?.username || 'Me',
          content: caption ? caption.trim() : '🎥 Video message',
          isVideo: true,
          attachments: [
            {
              name: `video-${Date.now()}.webm`,
              type: 'video/webm',
              size: videoBlob?.size,
              data: base64Data,
              path: base64Data,
            },
          ],
        },
      });
      refetchMessages();
      toast.success('Video message sent');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send video message');
    }
  };

  const handleConfirmSendText = async (convertedText) => {
    if (!convertedText || !convertedText.trim() || !activeConvoId) return;
    try {
      await sendDM.mutateAsync({
        conversationId: activeConvoId,
        message: {
          senderName: userProfile?.name || userProfile?.username || 'Me',
          content: convertedText.trim(),
          isVoice: false,
          attachments: [],
        },
      });
      toast.success('Converted text sent');
    } catch (err) {
      toast.error('Failed to send text message');
    } finally {
      if (recordedVoiceModal?.audioUrl) URL.revokeObjectURL(recordedVoiceModal.audioUrl);
      setRecordedVoiceModal(null);
    }
  };

  const handleConfirmEditText = (convertedText) => {
    setContent(convertedText || '');
    if (recordedVoiceModal?.audioUrl) URL.revokeObjectURL(recordedVoiceModal.audioUrl);
    setRecordedVoiceModal(null);
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);
  };

  const handleCancelVoiceModal = () => {
    if (recordedVoiceModal?.audioUrl) URL.revokeObjectURL(recordedVoiceModal.audioUrl);
    setRecordedVoiceModal(null);
  };


  const toIdText = useCallback((value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (value?.toText) return value.toText();
    if (value && typeof value === 'object') {
      if (typeof value.userId === 'string') return value.userId.trim();
      if (typeof value.id === 'string') return value.id.trim();
      if (typeof value._id === 'string') return value._id.trim();
      if (typeof value._text === 'string') return value._text.trim();
    }
    return String(value || '').trim();
  }, []);

  const getConvoPeerId = useCallback((convo, currentUserId) => {
    if (!convo || !Array.isArray(convo.participants)) return '';
    return convo.participants.map(toIdText).find(p => p && p !== currentUserId) || '';
  }, [toIdText]);

  const formatRoleText = useCallback((role) => {
    if (!role) return 'Colleague';
    if (typeof role === 'string') return role.charAt(0).toUpperCase() + role.slice(1);
    if (typeof role === 'object') {
      const key = Object.keys(role)[0];
      if (key) return key.charAt(0).toUpperCase() + key.slice(1);
    }
    return String(role || 'Colleague');
  }, []);

  const myId = toIdText(userProfile?.userId || userProfile?.id || userProfile?.username || '');
  const markedReadRef = useRef(null);

  const { data: rawMessages = EMPTY_ARRAY, refetch: refetchMessages } = useGetConversationMessages(activeConvoId);

  // Decrypt messages when sharedKey changes
  const [decryptedMessages, setDecryptedMessages] = useState(EMPTY_ARRAY);
  useEffect(() => {
    let cancelled = false;
    if (!rawMessages || rawMessages.length === 0) {
      setDecryptedMessages((prev) => (prev.length === 0 ? prev : EMPTY_ARRAY));
      return;
    }
    const decrypt = async () => {
      const results = await Promise.all(rawMessages.map(async (msg) => {
        if (!msg.encrypted || !sharedKey) return msg;
        const plaintext = await decryptMessage(sharedKey, msg.content, msg.iv);
        return { ...msg, _decrypted: plaintext };
      }));
      if (!cancelled) setDecryptedMessages(results);
    };
    decrypt();
    return () => { cancelled = true; };
  }, [rawMessages, sharedKey]);

  const messages = decryptedMessages;

  // Active conversation object
  const activeConvo = useMemo(() =>
    conversations.find(c => c._id === activeConvoId),
    [conversations, activeConvoId]
  );

  // Resolve peer user from a conversation
  const getPeer = useCallback((convo) => {
    if (!convo) return null;
    const peerId = getConvoPeerId(convo, myId);
    if (!peerId) return null;
    return users.find(u => toIdText(u?.userId || u?.id) === peerId) || { userId: peerId, name: peerId };
  }, [users, myId, getConvoPeerId, toIdText]);

  const normalizeAvatar = (avatar) => {
    if (!avatar) return '';
    const s = String(avatar).trim();
    if (!s) return '';
    if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/uploads/') || s.startsWith('/assets/')) {
      return s.replace(/^\/uploads\/assets\//, '/assets/');
    }
    return `/assets/profiles/${s.replace(/^\/+/, '')}`;
  };

  // ─── E2E Key Exchange ──────────────────────────────────────────
  useEffect(() => {
    if (!activeConvoId || !activeConvo) {
      setSharedKey((prev) => (prev === null ? prev : null));
      setE2eReady((prev) => (prev === false ? prev : false));
      return;
    }

    const setupE2E = async () => {
      try {
        // 1. Generate our key pair if we don't have one
        if (!hasKeyPair(activeConvoId)) {
          const pubKey = await generateKeyPair(activeConvoId);
          // storeKey mutation automatically invalidates dm-conversations, so no need to refetch manually
          await storeKey.mutateAsync({ conversationId: activeConvoId, publicKey: pubKey });
        }

        // 2. Check if peer has published their key
        const peerId = getConvoPeerId(activeConvo, myId);
        const peerKeyStr = activeConvo.publicKeys?.[peerId];
        if (peerKeyStr) {
          const peerPubJwk = JSON.parse(peerKeyStr);
          const derived = await deriveSharedKey(activeConvoId, peerPubJwk);
          setSharedKey(derived);
          setE2eReady(true);
        } else {
          // Peer hasn't published yet — we can still send unencrypted or wait
          setSharedKey(null);
          setE2eReady(false);
        }
      } catch (err) {
        console.error('[E2E] Setup error:', err);
        setSharedKey(null);
        setE2eReady(false);
      }
    };
    setupE2E();
  }, [activeConvoId, activeConvo?.publicKeys]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Mark as read when opening conversation (once per activeConvoId)
  useEffect(() => {
    if (activeConvoId && markedReadRef.current !== activeConvoId) {
      markedReadRef.current = activeConvoId;
      markRead.mutate(activeConvoId);
    }
  }, [activeConvoId]);

  // ─── Open conversation with a user ─────────────────────────────
  const openChat = useCallback(async (userId) => {
    try {
      const targetId = toIdText(userId);
      if (!targetId) return;

      // 1. Instant open if conversation already exists in cached list
      const existing = Array.isArray(conversations)
        ? conversations.find(c => getConvoPeerId(c, myId) === targetId)
        : null;
      if (existing) {
        setActiveConvoId(existing._id);
        setContent('');
        setFiles([]);
        setContactSearch('');
        setEditingId(null);
        return;
      }

      // 2. Otherwise get or create on server
      const convo = await getOrCreate.mutateAsync(targetId);
      if (convo?._id) {
        setActiveConvoId(convo._id);
      }
      setContent('');
      setFiles([]);
      setContactSearch('');
      setEditingId(null);
    } catch (err) {
      console.error('[PrivateChat] openChat error:', err);
      toast.error(err.message || 'Failed to open conversation');
    }
  }, [conversations, getOrCreate, myId, toIdText]);

  // Listen to open-conversation event and check pending storage from notifications
  useEffect(() => {
    const handleOpen = (convId, recId) => {
      if (convId) {
        setActiveConvoId(convId);
      } else if (recId) {
        openChat(recId);
      }
    };

    const pending = localStorage.getItem('pending_open_conversation');
    if (pending) {
      localStorage.removeItem('pending_open_conversation');
      try {
        const parsed = JSON.parse(pending);
        handleOpen(parsed.conversationId, parsed.recipientId);
      } catch {}
    }

    const onOpenConvo = (e) => {
      handleOpen(e.detail?.conversationId, e.detail?.recipientId);
    };
    window.addEventListener('open-conversation', onOpenConvo);
    return () => window.removeEventListener('open-conversation', onOpenConvo);
  }, [openChat]);

  // ─── Send message ──────────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault();
    if ((!content.trim() && files.length === 0) || !activeConvoId) return;

    try {
      // Handle attachments
      const attachments = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) { toast.error(`File ${f.name} exceeds 5MB`); continue; }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        attachments.push({ name: f.name, type: f.type, size: f.size, data: dataUrl });
      }

      let payload = {
        senderName: userProfile.name || userProfile.username,
        content: content.trim() || (attachments.length > 0 ? '[attachment]' : ''),
        attachments,
        encrypted: false,
      };

      // Encrypt if E2E is ready
      if (e2eReady && sharedKey && content.trim()) {
        const { ciphertext, iv } = await encryptMessage(sharedKey, content.trim());
        payload.content = ciphertext;
        payload.iv = iv;
        payload.encrypted = true;
      }

      await sendDM.mutateAsync({ conversationId: activeConvoId, message: payload });
      setContent('');
      setFiles([]);
    } catch (error) {
      toast.error('Failed to send message');
      console.error(error);
    }
  };

  // ─── Edit / Delete ─────────────────────────────────────────────
  const startEdit = (msg) => {
    setEditingId(msg._id);
    setEditContent(msg._decrypted || msg.content || '');
  };
  const cancelEdit = () => { setEditingId(null); setEditContent(''); };
  const confirmEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      let payload = { content: editContent.trim() };
      if (e2eReady && sharedKey) {
        const { ciphertext, iv } = await encryptMessage(sharedKey, editContent.trim());
        payload = { content: ciphertext, iv, encrypted: true };
      }
      await editDM.mutateAsync({ messageId: editingId, payload });
      toast.success('Message edited');
      cancelEdit();
      refetchMessages();
    } catch (err) {
      toast.error(err?.message || 'Failed to edit');
    }
  };
  const handleDelete = async (id) => {
    try {
      await deleteDM.mutateAsync(id);
      toast.success('Message deleted');
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────
  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  const isOwnMessage = (senderId) => myId === toIdText(senderId);

  const toPublicPath = (p) => {
    if (!p) return '';
    if (typeof p !== 'string') return '';
    if (p.startsWith('data:') || p.startsWith('blob:') || p.startsWith('http://') || p.startsWith('https://')) return p;
    if (p.startsWith('/assets/')) return p;
    const marker = '/assets/';
    const idx = p.lastIndexOf(marker);
    if (idx >= 0) return `/assets/${p.slice(idx + marker.length)}`;
    return p;
  };

  const getAttachmentSrc = (att) => {
    if (!att) return '';
    if (typeof att === 'string') return toPublicPath(att);
    if (att.data) return att.data;
    if (att.url) return toPublicPath(att.url);
    if (att.path) return toPublicPath(att.path);
    return '';
  };

  const isImageAtt = (att) => {
    if (!att) return false;
    const type = typeof att === 'object' ? (att.type || '') : '';
    const src = getAttachmentSrc(att);
    if (type.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(src) || (typeof att === 'object' && /\.(png|jpe?g|gif|webp|svg)$/i.test(att.name || ''));
  };

  const isVideoAtt = (att) => {
    if (!att) return false;
    const type = typeof att === 'object' ? (att.type || att.mimetype || '') : '';
    const name = typeof att === 'object' ? (att.name || '') : String(att);
    const path = typeof att === 'object' ? (att.path || '') : '';
    const src = getAttachmentSrc(att);
    if (type.startsWith('video')) return true;
    if (src.startsWith('data:video')) return true;
    if (name.includes('video') || path.includes('video')) return true;
    if (/\.(mp4|mov|mkv)$/i.test(name) || /\.(mp4|mov|mkv)$/i.test(src) || /\.(mp4|mov|mkv)$/i.test(path)) return true;
    if (/\.webm$/i.test(name) && !name.includes('voice') && !path.includes('voice')) return true;
    if (/\.webm$/i.test(path) && !path.includes('voice') && !name.includes('voice')) return true;
    return false;
  };

  const isAudioAtt = (att) => {
    if (!att || isVideoAtt(att)) return false;
    const type = typeof att === 'object' ? (att.type || att.mimetype || '') : '';
    const name = typeof att === 'object' ? (att.name || '') : String(att);
    const path = typeof att === 'object' ? (att.path || '') : '';
    const src = getAttachmentSrc(att);
    if (type.startsWith('audio')) return true;
    if (src.startsWith('data:audio')) return true;
    if (name.includes('voice') || path.includes('voice')) return true;
    return /\.(wav|mp3|ogg|m4a|aac)$/i.test(name) || /\.(wav|mp3|ogg|m4a|aac)$/i.test(src) || /\.(wav|mp3|ogg|m4a|aac)$/i.test(path);
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDate = '';
    messages.forEach(msg => {
      const date = formatDate(msg.createdAt);
      if (date !== currentDate) {
        groups.push({ type: 'date', date });
        currentDate = date;
      }
      groups.push({ type: 'message', msg });
    });
    return groups;
  }, [messages]);

  // Search in messages
  const searchMatches = useMemo(() => {
    if (!msgSearchTerm.trim()) return [];
    const term = msgSearchTerm.toLowerCase();
    const matches = [];
    messages.forEach((msg, idx) => {
      const text = msg._decrypted || msg.content || '';
      if (text.toLowerCase().includes(term)) matches.push(idx);
    });
    return matches;
  }, [messages, msgSearchTerm]);

  useEffect(() => { if (searchMatches.length > 0) setCurrentMatchIndex(0); }, [searchMatches.length, msgSearchTerm]);
  useEffect(() => {
    if (searchMatches.length > 0 && matchRefs.current[searchMatches[currentMatchIndex]]) {
      matchRefs.current[searchMatches[currentMatchIndex]]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, searchMatches]);

  // Contact list — company users excluding self
  const contactList = useMemo(() => {
    const myCompanyId = String(userProfile?.companyId?._id || userProfile?.companyId || '');
    return users
      .filter(u => {
        const uid = toIdText(u.userId || u.id);
        if (uid === myId) return false;
        if (myCompanyId) {
          const uCoId = String(u.companyId?._id || u.companyId || '');
          if (uCoId && uCoId !== myCompanyId) return false;
        }
        if (contactSearch) {
          const term = contactSearch.toLowerCase();
          return (u.name || '').toLowerCase().includes(term) ||
                 (u.username || '').toLowerCase().includes(term);
        }
        return true;
      })
      .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
  }, [users, myId, contactSearch, toIdText, userProfile]);

  // Conversation list with peer info
  const convoList = useMemo(() => {
    return conversations.map(c => ({
      ...c,
      peer: getPeer(c),
    })).filter(c => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (c.peer?.name || '').toLowerCase().includes(term) ||
             (c.peer?.username || '').toLowerCase().includes(term);
    });
  }, [conversations, getPeer, searchTerm]);

  // Highlight search term in message text
  const highlightText = (text, msgIndex) => {
    if (!msgSearchTerm.trim() || !text) return text;
    const term = msgSearchTerm.trim();
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    const isCurrentMatch = searchMatches[currentMatchIndex] === msgIndex;
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className={`rounded px-0.5 ${isCurrentMatch ? 'bg-amber-400 text-black' : 'bg-amber-200 text-black'}`}>{part}</mark>
      ) : part
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────
  const peer = activeConvo ? getPeer(activeConvo) : null;
  const peerAvatar = peer ? normalizeAvatar(peer?.avatar) : '';
  const initials = (peer?.name || peer?.username || '?').slice(0, 2).toUpperCase();

  return (
    <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden h-[calc(100svh-9.5rem)] sm:h-[calc(100vh-11rem)] min-h-[460px] sm:min-h-[580px] max-h-[calc(100dvh-5rem)] flex flex-row w-full">
      {/* Left Column: Conversations & People Search */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card shrink-0",
        activeConvoId ? "hidden md:flex" : "flex"
      )}>
        {/* Top Search Toolbar */}
        <div className="p-3.5 border-b border-border/70 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={contactSearch || searchTerm}
              onChange={(e) => {
                setContactSearch(e.target.value);
                setSearchTerm(e.target.value);
              }}
              placeholder="Search conversations or colleagues..."
              className="pl-9 h-9.5 text-xs rounded-xl bg-background border-border"
            />
          </div>
          {contactSearch.trim() && (
            <div className="text-[11px] text-muted-foreground font-medium px-1 flex items-center justify-between">
              <span>All Company Members ({contactList.length})</span>
              <button onClick={() => { setContactSearch(''); setSearchTerm(''); }} className="text-primary hover:underline">Clear</button>
            </div>
          )}
        </div>

        {/* Contacts or Conversation Threads list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {(contactSearch || searchTerm) ? (
            /* Search Mode: Show matching conversations and matching colleagues */
            <div>
              {convoList.length > 0 && (
                <div>
                  <div className="px-3.5 py-1.5 bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Matching Conversations ({convoList.length})
                  </div>
                  {convoList.map(c => {
                    const cPeer = c.peer;
                    const avatar = normalizeAvatar(cPeer?.avatar);
                    const cInitials = (cPeer?.name || cPeer?.username || '?').slice(0, 2).toUpperCase();
                    const isSelected = activeConvoId === c._id;
                    return (
                      <button
                        key={c._id}
                        onClick={() => { setActiveConvoId(c._id); }}
                        className={cn(
                          "flex items-center gap-3 w-full px-4 py-3 transition-all text-left relative",
                          isSelected ? "bg-secondary/70 border-l-4 border-l-primary" : "hover:bg-secondary/30"
                        )}
                      >
                        <Avatar className="h-10 w-10 shrink-0 border border-border">
                          <AvatarImage src={avatar} />
                          <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{cInitials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate text-foreground">{cPeer?.name || cPeer?.username}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.lastMessage?.content || 'No messages yet'}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {contactList.length > 0 && (
                <div>
                  <div className="px-3.5 py-1.5 bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Colleagues ({contactList.length})
                  </div>
                  {contactList.map(u => {
                    const uid = toIdText(u.userId || u.id);
                    const avatar = normalizeAvatar(u.avatar);
                    const uInitials = (u.name || u.username || '?').slice(0, 2).toUpperCase();
                    return (
                      <button
                        key={uid}
                        onClick={() => openChat(uid)}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/40 transition-colors text-left group"
                      >
                        <Avatar className="h-10 w-10 shrink-0 border border-border">
                          <AvatarImage src={avatar} />
                          <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{uInitials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">{u.name || u.username}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.designation || u.department || formatRoleText(u.role)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {convoList.length === 0 && contactList.length === 0 && (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Users className="w-8 h-8 opacity-30 mx-auto mb-2" />
                  <p>No conversations or colleagues match "{contactSearch || searchTerm}"</p>
                </div>
              )}
            </div>
          ) : (
            /* Normal Mode: Show Recent Conversations first, and ALL company employees below */
            <div>
              {/* 1. Recent Conversations */}
              {convoList.length > 0 && (
                <div className="border-b border-border/40">
                  <div className="px-3.5 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Recent Chats</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">{convoList.length}</Badge>
                  </div>
                  {convoList.map(c => {
                    const cPeer = c.peer;
                    const avatar = normalizeAvatar(cPeer?.avatar);
                    const cInitials = (cPeer?.name || cPeer?.username || '?').slice(0, 2).toUpperCase();
                    const lastMsg = c.lastMessage;
                    const unread = c.unreadCount || 0;
                    const isSelected = activeConvoId === c._id;

                    return (
                      <button
                        key={c._id}
                        onClick={() => { setActiveConvoId(c._id); }}
                        className={cn(
                          "flex items-center gap-3 w-full px-4 py-3.5 transition-all text-left relative",
                          isSelected
                            ? "bg-secondary/70 border-l-4 border-l-primary"
                            : "hover:bg-secondary/30"
                        )}
                      >
                        <Avatar className="h-11 w-11 shrink-0 border border-border">
                          <AvatarImage src={avatar} />
                          <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{cInitials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={cn("text-sm truncate", isSelected ? "font-bold text-foreground" : "font-semibold text-foreground")}>
                              {cPeer?.name || cPeer?.username}
                            </p>
                            {lastMsg?.timestamp && (
                              <span className="text-[10px] text-muted-foreground shrink-0 ml-2 font-mono">
                                {formatDate(lastMsg.timestamp) === 'Today' ? formatTime(lastMsg.timestamp) : formatDate(lastMsg.timestamp)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-muted-foreground truncate pr-2">
                              {toIdText(lastMsg?.senderId) === myId && <span className="text-muted-foreground/80 font-medium">You: </span>}
                              {lastMsg?.content || 'No messages yet'}
                            </p>
                            {unread > 0 && (
                              <span className="shrink-0 flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-white text-[10px] font-bold">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 2. All Company Employees Listed Below */}
              <div>
                <div className="px-3.5 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between sticky top-0 z-10 backdrop-blur-xs border-b border-border/40">
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Company Team Members</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{contactList.length}</Badge>
                </div>
                {contactList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    <p>No colleagues found in your company</p>
                  </div>
                ) : (
                  contactList.map(u => {
                    const uid = toIdText(u.userId || u.id);
                    const avatar = normalizeAvatar(u.avatar);
                    const uInitials = (u.name || u.username || '?').slice(0, 2).toUpperCase();
                    const existingConvo = Array.isArray(conversations)
                      ? conversations.find(c => getConvoPeerId(c, myId) === uid)
                      : null;
                    const isSelected = activeConvoId && existingConvo && activeConvoId === existingConvo._id;

                    return (
                      <button
                        key={uid}
                        onClick={() => openChat(uid)}
                        className={cn(
                          "flex items-center gap-3 w-full px-4 py-3 transition-colors text-left group",
                          isSelected ? "bg-secondary/70 border-l-4 border-l-primary" : "hover:bg-secondary/40"
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarImage src={avatar} />
                            <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{uInitials}</AvatarFallback>
                          </Avatar>
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                              {u.name || u.username}
                            </p>
                            {existingConvo && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">
                                Active chat
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {u.designation || u.department || formatRoleText(u.role)}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Active Conversation or Welcome State */}
      <div className={cn(
        "flex-1 flex flex-col bg-background/50 min-w-0 relative",
        !activeConvoId ? "hidden md:flex" : "flex"
      )}>
        {activeConvoId && activeConvo ? (
          <>
            {/* Active Chat Header */}
            <div className="h-16 px-4 md:px-6 border-b border-border bg-card/80 backdrop-blur-xs flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-8 w-8 -ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => { setActiveConvoId(null); setSharedKey(null); setE2eReady(false); }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-10 w-10 shrink-0 border border-border">
                  <AvatarImage src={peerAvatar} />
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-foreground truncate leading-tight">{peer?.name || peer?.username}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {peer?.designation || peer?.department || 'Colleague'}
                    </span>
                    <span className="text-muted-foreground/40">•</span>
                    {e2eReady ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Lock className="h-3 w-3" /> Encrypted
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500">
                        <ShieldCheck className="h-3 w-3" /> Securing channel…
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-emerald-500"
                  title="Voice Call"
                  onClick={() => {
                    const peerId = (peer?._id || peer?.id || peer?.userId || '')?.toString();
                    if (!peerId) return;
                    window.dispatchEvent(
                      new CustomEvent('start-direct-call', {
                        detail: {
                          recipientId: peerId,
                          recipientName: peer?.name || peer?.username,
                          mediaType: 'voice',
                        },
                      })
                    );
                  }}
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-indigo-500"
                  title="Video Call"
                  onClick={() => {
                    const peerId = (peer?._id || peer?.id || peer?.userId || '')?.toString();
                    if (!peerId) return;
                    window.dispatchEvent(
                      new CustomEvent('start-direct-call', {
                        detail: {
                          recipientId: peerId,
                          recipientName: peer?.name || peer?.username,
                          mediaType: 'video',
                        },
                      })
                    );
                  }}
                >
                  <Video className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => { setSearchOpen(o => !o); setMsgSearchTerm(''); }}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* In-Message Search Bar */}
            {searchOpen && (
              <div className="flex items-center gap-2 border-b border-border p-2.5 bg-secondary/30 shrink-0 animate-in fade-in duration-150">
                <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
                <Input
                  value={msgSearchTerm}
                  onChange={(e) => setMsgSearchTerm(e.target.value)}
                  placeholder="Find in this chat..."
                  className="h-8 text-xs bg-background"
                  autoFocus
                />
                {msgSearchTerm.trim() && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                    {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
                  </span>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCurrentMatchIndex(i => (i - 1 + searchMatches.length) % searchMatches.length)} disabled={searchMatches.length === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCurrentMatchIndex(i => (i + 1) % searchMatches.length)} disabled={searchMatches.length === 0}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setSearchOpen(false); setMsgSearchTerm(''); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {groupedMessages.map((item, i) => {
                if (item.type === 'date') {
                  return (
                    <div key={`date-${i}`} className="flex justify-center my-4">
                      <span className="text-[11px] font-semibold text-muted-foreground bg-secondary/80 border border-border/60 px-3 py-1 rounded-full shadow-2xs">
                        {item.date}
                      </span>
                    </div>
                  );
                }
                const msg = item.msg;
                const own = isOwnMessage(msg.senderId);
                const isEditing = editingId === msg._id;
                const msgIdx = messages.indexOf(msg);
                const isCurrentSearch = searchMatches[currentMatchIndex] === msgIdx;

                return (
                  <div
                    key={msg._id}
                    ref={el => { matchRefs.current[msgIdx] = el; }}
                    className={`group flex ${own ? 'justify-end' : 'justify-start'} ${isCurrentSearch ? 'ring-2 ring-amber-400 rounded-2xl' : ''}`}
                  >
                    <div className={`max-w-[78%] sm:max-w-[68%] rounded-2xl p-3.5 relative shadow-xs transition-all ${
                      own
                        ? 'bg-[#0D9488] text-white rounded-br-xs'
                        : 'bg-card border border-border text-foreground rounded-bl-xs'
                    }`}>
                      {/* Hover Actions */}
                      {own && !isEditing && (
                        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1 bg-card/90 border border-border/60 rounded-lg p-0.5 shadow-xs">
                          <button onClick={() => startEdit(msg)} className="rounded p-1 hover:bg-secondary text-muted-foreground hover:text-foreground">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleDelete(msg._id)} className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <Input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="h-8 text-xs bg-background text-foreground"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={cancelEdit}>
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" className="h-6 px-2 text-xs bg-white text-emerald-800" onClick={confirmEdit} disabled={editDM.isPending}>
                              <Check className="h-3 w-3 mr-1" /> Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm break-words whitespace-pre-wrap leading-relaxed">
                          {highlightText(msg._decrypted || msg.content || '', msgIdx)}
                        </p>
                      )}

                      {/* Attachments */}
                      {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {msg.attachments.map((att, idx) => {
                            const publicPath = toPublicPath(att.path) || getAttachmentSrc(att);
                            const isAudio = isAudioAtt(att);
                            const isVideo = isVideoAtt(att);
                            return (
                              <div key={idx} className={cn(
                                "rounded-xl border p-2 text-xs flex flex-col gap-1.5",
                                own ? "bg-white/10 border-white/20 text-white" : "bg-muted/40 border-border text-foreground"
                              )}>
                                {isImageAtt(att) ? (
                                  <img src={publicPath} alt={att.name} className="max-h-48 rounded-lg object-contain mb-1" />
                                ) : isVideo ? (
                                  <div className="w-full">
                                    <video controls playsInline className="w-full max-h-64 rounded-xl object-contain bg-black/80 border border-black/20" src={publicPath} />
                                  </div>
                                ) : isAudio ? (
                                  <div className="w-full">
                                    <audio controls className="w-full h-8" src={publicPath} />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                    <a href={publicPath} download={att.name} className="underline truncate flex-1 hover:opacity-80">
                                      {att.name}
                                    </a>
                                  </div>
                                )}
                                {(isAudio || isVideo || isImageAtt(att)) && (
                                  <a href={publicPath} download={att.name} className="underline truncate text-[11px] hover:opacity-80 flex items-center gap-1 opacity-90">
                                    <Paperclip className="h-3 w-3 shrink-0" />
                                    <span>{att.name}</span>
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Timestamp & Encrypted badge */}
                      <div className={cn(
                        "flex items-center justify-end gap-1.5 mt-1.5 text-[10px]",
                        own ? "text-white/80" : "text-muted-foreground"
                      )}>
                        {msg.encrypted && <Lock className="h-2.5 w-2.5 opacity-70" />}
                        {msg.editedAt && <span className="opacity-70 italic">(edited)</span>}
                        <span>{formatTime(msg.createdAt)}</span>
                        {own && (
                          <span className="font-semibold text-emerald-200">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Empty Chat State */}
              {messages.length === 0 && (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-14 h-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">
                    Direct conversation with {peer?.name || peer?.username}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                    This discussion is secured by client-side end-to-end encryption. Say hello to get started!
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-xl border-border hover:border-primary/50 text-foreground"
                      onClick={() => setContent(`👋 Hi ${peer?.name ? peer.name.split(' ')[0] : 'there'}!`)}
                    >
                      👋 Say Hello
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-xl border-border hover:border-primary/50 text-foreground"
                      onClick={() => setContent("Could we quickly sync on today's tasks?")}
                    >
                      📋 Quick sync
                    </Button>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Anchored Composer */}
            <div className="p-3 md:p-4 border-t border-border bg-card/90 backdrop-blur-xs shrink-0">
              <form onSubmit={handleSend} className="flex items-center gap-2 w-full">
                <Label htmlFor="dm-files" className="h-10 w-10 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground flex items-center justify-center cursor-pointer shrink-0 transition-colors border border-border">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </Label>
                <input id="dm-files" type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />

                {files.length > 0 && (
                  <div className="flex items-center gap-1.5 max-w-[30%] overflow-x-auto">
                    {files.map((f, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1 whitespace-nowrap text-xs py-1 px-2 rounded-lg">
                        {f.name.length > 10 ? f.name.slice(0, 10) + '…' : f.name}
                        <button type="button" onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {isRecordingVoice ? (
                  <div className="flex-1 flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-1.5 animate-pulse">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                      <span className="text-xs font-mono font-medium text-red-500">
                        Recording {formatVoiceDuration(voiceDuration)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={cancelVoiceRecording} className="h-7 text-xs text-muted-foreground hover:text-foreground">
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={stopVoiceRecording} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">
                        <Square className="h-3 w-3 mr-1 fill-current" /> Finish
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <EmojiPicker onSelectEmoji={handleSelectEmoji} disabled={sendDM.isPending} />
                    <Input
                      ref={textInputRef}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={isDictating ? '🎙️ Listening... Speak now to transcribe' : (e2eReady ? '🔒 Type an encrypted message…' : 'Type a message…')}
                      disabled={sendDM.isPending}
                      className={cn("flex-1 h-10 rounded-xl bg-background border-border text-xs sm:text-sm", isDictating && "border-primary ring-2 ring-primary/40 bg-primary/5")}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                      }}
                    />
                    {/* Voice Typing (Speech to Text) */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={toggleVoiceToText}
                      title={isDictating ? 'Stop Voice Typing' : 'Voice Typing (Speech to Text)'}
                      className={cn(
                        "h-10 w-10 rounded-xl shrink-0 transition-colors",
                        isDictating ? "text-primary animate-pulse bg-primary/20 hover:bg-primary/30" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                    {/* Voice Note Recording button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={startVoiceRecording}
                      title="Record Voice Message (Voice Note)"
                      className="h-10 w-10 rounded-xl shrink-0 hover:text-red-500 text-muted-foreground"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    {/* Video Recording button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsVideoRecordOpen(true)}
                      title="Record Video Message"
                      className="h-10 w-10 rounded-xl shrink-0 hover:text-teal-600 dark:hover:text-teal-400 text-muted-foreground cursor-pointer"
                    >
                      <Video className="h-4 w-4" />
                    </Button>
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white shrink-0 shadow-xs"
                      disabled={sendDM.isPending || (!content.trim() && files.length === 0)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </form>
            </div>
          </>
        ) : (
          /* Desktop Welcome / No Active Conversation Placeholder */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-xs">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Your Workplace Messenger</h3>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
              Select a colleague from the left panel to continue an ongoing conversation, or search for any team member to start a new private discussion.
            </p>
          </div>
        )}
      </div>
      {/* Device & Permission Error Dialog with Retry for Voice Recording */}
      <Dialog
        open={Boolean(voiceError)}
        onOpenChange={(open) => {
          if (!open) {
            const cancelFn = voiceError?.onCancel;
            setVoiceError(null);
            if (cancelFn) cancelFn();
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-zinc-950 border border-red-500/30 text-white shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-semibold text-white">
                  {voiceError?.title || 'Microphone Error'}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">Microphone Hardware & Permissions</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm text-zinc-300">
            <p className="leading-relaxed">{voiceError?.message}</p>

            {voiceError?.troubleshooting && voiceError.troubleshooting.length > 0 && (
              <div className="bg-zinc-900/90 rounded-lg p-3 border border-white/10 space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">How to resolve:</p>
                <ul className="text-xs text-zinc-300 space-y-1.5 list-disc pl-4">
                  {voiceError.troubleshooting.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="flex sm:justify-between items-center gap-2 pt-3 border-t border-white/10">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const cancelFn = voiceError?.onCancel;
                setVoiceError(null);
                if (cancelFn) cancelFn();
              }}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const retryFn = voiceError?.onRetry;
                setVoiceError(null);
                if (retryFn) retryFn();
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voice Recording Choice Dialog: Send Voice Note or Normal Text */}
      <VoiceConfirmDialog
        isOpen={Boolean(recordedVoiceModal)}
        audioUrl={recordedVoiceModal?.audioUrl}
        duration={recordedVoiceModal?.duration || 0}
        initialText={recordedVoiceModal?.transcript || ''}
        onSendVoice={handleConfirmSendVoice}
        onSendText={handleConfirmSendText}
        onEditText={handleConfirmEditText}
        onCancel={handleCancelVoiceModal}
        isPending={sendDM.isPending}
      />

      {/* Video Recording Dialog */}
      <VideoRecordDialog
        isOpen={isVideoRecordOpen}
        onClose={() => setIsVideoRecordOpen(false)}
        onSendVideo={handleSendRecordedVideo}
        title="Record Video Message"
        isPending={sendDM.isPending}
      />
    </Card>
  );
}
