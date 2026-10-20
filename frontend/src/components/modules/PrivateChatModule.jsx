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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Send, Paperclip, X, ArrowLeft, Search, ShieldCheck, Lock, Pencil, Trash2, Check,
  MessageSquare, ChevronUp, ChevronDown, Users
} from 'lucide-react';
import { toast } from 'sonner';
import {
  generateKeyPair, hasKeyPair, deriveSharedKey,
  encryptMessage, decryptMessage, getStoredPrivateKey
} from '../../utils/e2e';

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
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [sharedKey, setSharedKey] = useState(null);
  const [e2eReady, setE2eReady] = useState(false);
  const bottomRef = useRef(null);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [msgSearchTerm, setMsgSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const matchRefs = useRef([]);

  const toIdText = useCallback((value) => {
    if (typeof value === 'string') return value;
    if (value?.toText) return value.toText();
    if (value && typeof value === 'object') {
      if (typeof value.userId === 'string') return value.userId;
      if (typeof value.id === 'string') return value.id;
      if (typeof value._text === 'string') return value._text;
    }
    return String(value || '');
  }, []);

  const myId = toIdText(userProfile.userId || userProfile.id);
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
    const peerId = convo.participants?.map(toIdText).find(p => p !== myId);
    return users.find(u => toIdText(u.userId || u.id) === peerId) || { userId: peerId, name: peerId };
  }, [users, myId, toIdText]);

  const normalizeAvatar = (avatar) => {
    if (!avatar) return '';
    const s = String(avatar).trim();
    if (!s) return '';
    if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/uploads/')) return s;
    return `/uploads/${s.replace(/^\/+/, '')}`;
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
        const peerId = activeConvo.participants?.map(toIdText).find(p => p !== myId);
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
  const openChat = async (userId) => {
    try {
      const convo = await getOrCreate.mutateAsync(userId);
      setActiveConvoId(convo._id);
      setContent('');
      setFiles([]);
      setContactSearch('');
      setEditingId(null);
    } catch (err) {
      toast.error(err.message || 'Failed to open conversation');
    }
  };

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
    if (!p) return p;
    if (p.startsWith('/assets/')) return p;
    const marker = '/assets/';
    const idx = p.lastIndexOf(marker);
    if (idx >= 0) return `/assets/${p.slice(idx + marker.length)}`;
    return p;
  };
  const isImageAtt = (att) => {
    if (!att?.path) return false;
    if (att.type?.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(att.path);
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
    return users
      .filter(u => {
        const uid = toIdText(u.userId || u.id);
        if (uid === myId) return false;
        if (contactSearch) {
          const term = contactSearch.toLowerCase();
          return (u.name || '').toLowerCase().includes(term) ||
                 (u.username || '').toLowerCase().includes(term);
        }
        return true;
      })
      .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
  }, [users, myId, contactSearch, toIdText]);

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
    <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden h-[calc(100vh-11rem)] min-h-[580px] flex flex-row w-full">
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
          {contactSearch.trim() ? (
            contactList.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <Users className="w-8 h-8 opacity-30 mx-auto mb-2" />
                <p>No colleagues match "{contactSearch}"</p>
              </div>
            ) : (
              contactList.map(u => {
                const uid = toIdText(u.userId || u.id);
                const avatar = normalizeAvatar(u.avatar);
                const uInitials = (u.name || u.username || '?').slice(0, 2).toUpperCase();
                return (
                  <button
                    key={uid}
                    onClick={() => {
                      openChat(uid);
                      setContactSearch('');
                      setSearchTerm('');
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/40 transition-colors text-left group"
                  >
                    <Avatar className="h-10 w-10 shrink-0 border border-border">
                      <AvatarImage src={avatar} />
                      <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{uInitials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">{u.name || u.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.designation || u.department || 'Team Member'}</p>
                    </div>
                  </button>
                );
              })
            )
          ) : convoList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-muted-foreground">
              <div className="p-3 rounded-2xl bg-muted/60 mb-3 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-40" />
              </div>
              <p className="text-sm font-semibold text-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                Search for any colleague above to start your first secure chat.
              </p>
            </div>
          ) : (
            convoList.map(c => {
              const cPeer = c.peer;
              const avatar = normalizeAvatar(cPeer?.avatar);
              const cInitials = (cPeer?.name || cPeer?.username || '?').slice(0, 2).toUpperCase();
              const lastMsg = c.lastMessage;
              const unread = c.unreadCount || 0;
              const isSelected = activeConvoId === c._id;

              return (
                <button
                  key={c._id}
                  onClick={() => { setActiveConvoId(c._id); setContactSearch(''); }}
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
            })
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
                            const publicPath = toPublicPath(att.path);
                            return (
                              <div key={idx} className={cn(
                                "rounded-xl border p-2 text-xs flex items-center gap-2",
                                own ? "bg-white/10 border-white/20 text-white" : "bg-muted/40 border-border text-foreground"
                              )}>
                                {isImageAtt(att) ? (
                                  <img src={publicPath} alt={att.name} className="max-h-36 rounded-lg object-contain mb-1" />
                                ) : (
                                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <a href={publicPath} download={att.name} className="underline truncate flex-1 hover:opacity-80">
                                  {att.name}
                                </a>
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
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <Label htmlFor="dm-files" className="h-10 w-10 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground flex items-center justify-center cursor-pointer shrink-0 transition-colors border border-border">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </Label>
                <Input id="dm-files" type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />

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

                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={e2eReady ? 'Type an encrypted message…' : 'Type a message…'}
                  disabled={sendDM.isPending}
                  className="flex-1 h-10 rounded-xl bg-background border-border text-xs sm:text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white shrink-0 shadow-xs"
                  disabled={sendDM.isPending || (!content.trim() && files.length === 0)}
                >
                  <Send className="h-4 w-4" />
                </Button>
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
    </Card>
  );
}
