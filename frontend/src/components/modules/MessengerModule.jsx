import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGetAllMessages, useSendMessage, useGetAllUsers, useDeleteMessage, useEditMessage } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Principal } from '@dfinity/principal';
import { Send, Paperclip, X, Pencil, Trash2, Search, ChevronUp, ChevronDown, Check, Users, Lock, Video, Mic, Square, AlertCircle, RotateCw, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import PrivateChatModule from './PrivateChatModule';
import { getSocket } from '../../hooks/useSocket';
import EmojiPicker from '../EmojiPicker';
import VoiceConfirmDialog from '../VoiceConfirmDialog';
import { stopMediaStream, parseMediaError } from '../../lib/mediaUtils';
import { cn } from '../../lib/utils';


export default function MessengerModule({ userProfile }) {
  const [chatMode, setChatMode] = useState('private'); // 'team' | 'private'
  const { identity } = useCustomAuth();
  const { data: messages = [], isLoading } = useGetAllMessages();
  const sendMessage = useSendMessage();
  const deleteMessage = useDeleteMessage();
  const editMessage = useEditMessage();
  const { data: users = [] } = useGetAllUsers();

  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const selectionTimer = useRef(null);
  const bottomRef = useRef(null);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const matchRefs = useRef([]);
  const textInputRef = useRef(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [voiceError, setVoiceError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechRecognitionRef = useRef(null);
  const liveTranscriptRef = useRef('');
  const [recordedVoiceModal, setRecordedVoiceModal] = useState(null);

  // Voice-to-text (Speech dictation) state
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef(null);

  // Clean up recording and dictation on unmount
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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
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

  const startVoiceRecording = async () => {
    setVoiceError(null);
    liveTranscriptRef.current = '';
    try {
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
            console.warn('[MessengerModule] Live transcription notice:', e?.error);
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch (e) {
          console.warn('[MessengerModule] Speech recognition start notice:', e);
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
      console.error('[MessengerModule] startVoiceRecording error:', err);
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
    setIsRecording(false);
    setRecordDuration(0);
  };

  const handleConfirmSendVoice = async () => {
    if (!recordedVoiceModal?.base64Data) return;
    try {
      const message = {
        id: `msg-${Date.now()}`,
        senderId: userProfile?.userId || userProfile?.id,
        sender: userProfile?.name || userProfile?.username || 'Team Member',
        content: '🎤 Voice message',
        timestamp: BigInt(Date.now() * 1000000),
        attachments: [
          {
            name: `voice-${Date.now()}.webm`,
            type: 'audio/webm',
            size: recordedVoiceModal.audioBlob?.size,
            data: recordedVoiceModal.base64Data,
            path: recordedVoiceModal.base64Data,
          },
        ],
      };
      await sendMessage.mutateAsync(message);
      toast.success('Voice message sent to team');
    } catch {
      toast.error('Failed to send voice message');
    } finally {
      if (recordedVoiceModal.audioUrl) URL.revokeObjectURL(recordedVoiceModal.audioUrl);
      setRecordedVoiceModal(null);
    }
  };

  const handleConfirmSendText = async (convertedText) => {
    if (!convertedText || !convertedText.trim()) return;
    try {
      const message = {
        id: `msg-${Date.now()}`,
        senderId: userProfile?.userId || userProfile?.id,
        sender: userProfile?.name || userProfile?.username || 'Team Member',
        content: convertedText.trim(),
        timestamp: BigInt(Date.now() * 1000000),
        attachments: []
      };
      await sendMessage.mutateAsync(message);
      toast.success('Converted text sent to team');
    } catch {
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();

    if ((!content.trim() && files.length === 0) || !identity) return;

    try {
      // Convert selected files to data URLs
      const attachments = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) {
          toast.error(`File ${f.name} exceeds 5MB limit`);
          continue;
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        attachments.push({
          name: f.name,
          type: f.type,
          size: f.size,
          data: dataUrl
        });
      }

      const message = {
        id: `msg-${Date.now()}`,
        senderId: userProfile.userId || userProfile.id,
        sender: userProfile.name || userProfile.username,
        content: content.trim().length > 0 ? content.trim() : (attachments.length > 0 ? '[attachment]' : ''),
        timestamp: BigInt(Date.now() * 1000000),
        attachments
      };
     
      await sendMessage.mutateAsync(message);
      setContent('');
      setFiles([]);
    } catch (error) {
      toast.error('Failed to send message');
      console.error(error);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(typeof timestamp === 'string' ? timestamp : (Number(timestamp) ? Number(timestamp) / 1000000 : Date.now()));
    return date.toLocaleString();
  };
  const truncateName = (name, max = 10) => {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max)}...` : name;
  };

  const getSenderName = (senderId, fallbackName) => {
    const u = users.find(x => x.userId === senderId || x.id === senderId);
    return u ? (u.name || u.username) : fallbackName;
  };

  const toIdText = (val) => typeof val === 'string' ? val : (val?.toText ? val.toText() : String(val));
  const isOwnMessage = (senderId) => {
    const myId = toIdText(userProfile.userId || userProfile.id);
    return myId === toIdText(senderId);
  };
  const getRoleName = (role) => {
    if (!role) return '';
    if (typeof role === 'string') return role;
    const keys = Object.keys(role);
    return keys.length ? keys[0] : '';
  };
  const normalizeAttachment = (att) => {
    if (!att) return null;
    if (typeof att === 'string') {
      const name = att.split('/').pop() || 'attachment';
      return { path: att, name };
    }
    if (typeof att === 'object') {
      if (att.data) return { path: att.data, name: att.name || 'attachment', type: att.type, size: att.size };
      if (att.path) return { path: att.path, name: att.name || att.path.split('/').pop() || 'attachment' };
      if (att.url) return { path: att.url, name: att.name || att.url.split('/').pop() || 'attachment' };
    }
    return null;
  };
  const toPublicPath = (p) => {
    if (!p) return p;
    if (p.startsWith('/assets/')) return p;
    const marker = '/assets/';
    const idx = p.lastIndexOf(marker);
    if (idx >= 0) return `/assets/${p.slice(idx + marker.length)}`;
    return p;
  };
  const isImageAttachment = (att) => {
    if (!att?.path) return false;
    if (att.type?.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(att.path);
  };
  const isAdmin = ['admin', 'owner', 'param'].includes(getRoleName(userProfile.role));
  const isPrivileged = ['owner', 'param'].includes(getRoleName(userProfile.role));

  const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  const canModify = useCallback((message) => {
    // param and owner can modify any message anytime
    if (isPrivileged) return true;
    // Other users: own messages only, within 15 min
    if (!isOwnMessage(message.senderId)) return false;
    const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : null;
    if (!createdAt) return false;
    return (Date.now() - createdAt) <= EDIT_WINDOW_MS;
  }, [isPrivileged, userProfile]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    const matches = [];
    messages.forEach((msg, idx) => {
      if (msg.content && msg.content.toLowerCase().includes(term)) {
        matches.push(idx);
      }
    });
    return matches;
  }, [messages, searchTerm]);

  // Reset match index when matches change
  useEffect(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(0);
    }
  }, [searchMatches.length, searchTerm]);

  // Scroll to current match
  useEffect(() => {
    if (searchMatches.length > 0 && matchRefs.current[searchMatches[currentMatchIndex]]) {
      matchRefs.current[searchMatches[currentMatchIndex]]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, searchMatches]);

  const goToNextMatch = () => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex(prev => (prev + 1) % searchMatches.length);
  };
  const goToPrevMatch = () => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex(prev => (prev - 1 + searchMatches.length) % searchMatches.length);
  };

  // Highlight search term in text
  const highlightText = (text, msgIndex) => {
    if (!searchTerm.trim() || !text) return text;
    const term = searchTerm.trim();
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    const isCurrentMatch = searchMatches[currentMatchIndex] === msgIndex;
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className={`rounded px-0.5 ${isCurrentMatch ? 'bg-yellow-400 text-black' : 'bg-yellow-200 text-black'}`}>{part}</mark>
      ) : part
    );
  };

  // Edit handlers
  const startEdit = (message) => {
    const mid = message._id || message.messageId || message.id;
    setEditingId(mid);
    setEditContent(message.content || '');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };
  const confirmEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      await editMessage.mutateAsync({ id: editingId, content: editContent.trim() });
      toast.success('Message edited');
      cancelEdit();
    } catch (err) {
      toast.error(err?.message || 'Failed to edit message');
    }
  };

  // Single message delete
  const handleDeleteSingle = async (id) => {
    try {
      await deleteMessage.mutateAsync(id);
      toast.success('Message deleted');
    } catch (err) {
      toast.error(err?.message || 'Failed to delete message');
    }
  };
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const clearSelection = () => {
    setSelectedIds([]);
    setSelectionMode(false);
  };
  const onMessagePointerDown = (id) => {
    if (selectionTimer.current) clearTimeout(selectionTimer.current);
    selectionTimer.current = setTimeout(() => {
      setSelectionMode(true);
      toggleSelect(id);
    }, 600);
  };
  const onMessagePointerUp = () => {
    if (selectionTimer.current) {
      clearTimeout(selectionTimer.current);
      selectionTimer.current = null;
    }
  };
  const handleDeleteSelected = async () => {
    for (const id of selectedIds) {
      try {
        await deleteMessage.mutateAsync(id);
      } catch {}
    }
    clearSelection();
  };

  useEffect(() => {
    const onOpenConvo = () => {
      setChatMode('private');
    };
    window.addEventListener('open-conversation', onOpenConvo);
    return () => window.removeEventListener('open-conversation', onOpenConvo);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Messenger</h2>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={chatMode === 'private' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setChatMode('private')}
            className="h-8 px-3 text-xs gap-1.5"
          >
            <Lock className="h-3.5 w-3.5" /> Private
          </Button>
          <Button
            variant={chatMode === 'team' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setChatMode('team')}
            className="h-8 px-3 text-xs gap-1.5"
          >
            <Users className="h-3.5 w-3.5" /> Team
          </Button>
        </div>
      </div>

      {chatMode === 'private' ? (
        <PrivateChatModule userProfile={userProfile} />
      ) : (
      <>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const meetingId = `meeting-${Date.now()}`;
            const socket = getSocket();
            socket?.emit('meeting:start', { meetingId, title: 'Team Meeting', mediaType: 'video' });
            window.dispatchEvent(new CustomEvent('join-team-meeting', { detail: { meetingId, title: 'Team Meeting', mediaType: 'video' } }));
          }}
          className="h-8 gap-1.5 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
        >
          <Video className="h-3.5 w-3.5" /> Start Team Meeting
        </Button>
        <Button variant="ghost" size="icon" onClick={() => { setSearchOpen(o => !o); setSearchTerm(''); setCurrentMatchIndex(0); }}>
          <Search className="h-5 w-5" />
        </Button>
      </div>


      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/40">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search messages..."
            className="h-8"
            autoFocus
          />
          {searchTerm.trim() && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={goToPrevMatch} disabled={searchMatches.length === 0}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={goToNextMatch} disabled={searchMatches.length === 0}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setSearchOpen(false); setSearchTerm(''); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {selectionMode && (
        <div className="flex items-center justify-between rounded-md border p-2 bg-muted/40">
          <span className="text-sm">Selected: {selectedIds.length}</span>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={deleteMessage.isPending || selectedIds.length === 0}>
              Delete Selected
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>Cancel</Button>
          </div>
        </div>
      )}
      
      <Card className="h-[calc(100vh-16rem)] flex flex-col">
        <CardHeader>
          <CardTitle>Team Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto pr-4">
            <div className="space-y-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No messages yet. Start the conversation!</p>
              ) : (
                messages.map((message, msgIndex) => {
                  const mid = message._id || message.messageId || message.id;
                  const own = isOwnMessage(message.senderId);
                  const modifiable = canModify(message);
                  const isEditing = editingId === mid;
                  const isCurrentSearchMatch = searchMatches[currentMatchIndex] === msgIndex;

                  return (
                    <div
                      key={mid}
                      ref={(el) => { matchRefs.current[msgIndex] = el; }}
                      className={`group flex ${own ? 'justify-end' : 'justify-start'} ${isCurrentSearchMatch ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                      onMouseDown={() => onMessagePointerDown(mid)}
                      onMouseUp={onMessagePointerUp}
                      onTouchStart={() => onMessagePointerDown(mid)}
                      onTouchEnd={onMessagePointerUp}
                      onClick={() => selectionMode ? toggleSelect(mid) : null}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 relative ${
                          own
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        } ${selectionMode && selectedIds.includes(mid) ? 'ring-2 ring-destructive' : ''}`}
                      >
                        {/* Edit/Delete action buttons – shown on hover */}
                        {modifiable && !selectionMode && !isEditing && (
                          <div className={`absolute top-1 ${own ? 'left-1' : 'right-1'} hidden group-hover:flex gap-1`}>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(message); }}
                              className="rounded p-1 bg-background/80 hover:bg-background text-foreground shadow-sm"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteSingle(mid); }}
                              className="rounded p-1 bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-foreground shadow-sm"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="h-8 text-sm bg-background text-foreground"
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
                              <Button size="sm" className="h-6 px-2 text-xs" onClick={confirmEdit} disabled={editMessage.isPending || !editContent.trim()}>
                                <Check className="h-3 w-3 mr-1" /> Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm break-words">{highlightText(message.content, msgIndex)}</p>
                        )}

                        {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((att, idx) => {
                              const normalized = normalizeAttachment(att);
                              if (!normalized) return null;
                              const sizeText = typeof normalized.size === 'number' ? ` (${Math.round(normalized.size / 1024)} KB)` : '';
                              const publicPath = toPublicPath(normalized.path);
                              const isAudio = (
                                normalized.type?.startsWith('audio') ||
                                /\.(webm|wav|mp3|ogg|m4a|aac)$/i.test(normalized.name || normalized.path || '') ||
                                (normalized.path && String(normalized.path).includes('voice-'))
                              );

                              return (
                                <div key={`${message.id}-att-${idx}`} className="rounded-md border border-border p-2 bg-background/50 text-foreground">
                                  {isImageAttachment(normalized) && (
                                    <img src={publicPath} alt={normalized.name} className="max-h-40 rounded-md object-contain mb-2" />
                                  )}
                                  {isAudio ? (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between text-xs font-semibold px-0.5">
                                        <span className="flex items-center gap-1.5 text-primary">
                                          <Mic className="h-3.5 w-3.5" />
                                          Voice Note
                                        </span>
                                        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                          {normalized.name}
                                        </span>
                                      </div>
                                      <audio
                                        controls
                                        preload="metadata"
                                        src={publicPath}
                                        className="h-9 w-full max-w-[260px] rounded-md focus:outline-none"
                                      >
                                        Your browser does not support audio playback.
                                      </audio>
                                    </div>
                                  ) : (
                                    <a href={publicPath} download={normalized.name} className="text-xs underline flex items-center gap-2" title={normalized.name}>
                                      <Paperclip className="h-3 w-3" />
                                      {truncateName(normalized.name)}{sizeText}
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <p className="text-xs opacity-70">
                            {getSenderName(message.senderId, message.senderName || message.sender || 'Unknown')}
                          </p>
                          {message.editedAt && (
                            <span className="text-[10px] opacity-50 italic">(edited)</span>
                          )}
                        </div>
                        <p className="text-[11px] opacity-60">
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </div>

        </CardContent>
        <CardFooter className="sticky bottom-0 bg-background">
          <form onSubmit={handleSend} className="flex gap-2 w-full items-center">
            {!isRecording && (
              <div className="flex items-center">
                <Label htmlFor="chat-files" className="p-2 rounded-md bg-muted hover:bg-muted/80 cursor-pointer shrink-0">
                  <Paperclip className="h-4 w-4" />
                </Label>
                <Input
                  id="chat-files"
                  type="file"
                  multiple
                  accept="*/*"
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </div>
            )}
            {files.length > 0 && !isRecording && (
              <div className="flex items-center gap-2 max-w-[30%] overflow-x-auto">
                {files.map((f, idx) => (
                  <Badge key={`${f.name}-${idx}`} variant="secondary" className="flex items-center gap-2 whitespace-nowrap" title={f.name}>
                    <span className="text-xs">{truncateName(f.name)}</span>
                    <button
                      type="button"
                      className="rounded-md p-0.5 hover:bg-muted"
                      onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {isRecording ? (
              <div className="flex-1 flex items-center justify-between bg-destructive/10 text-destructive px-3 py-1.5 rounded-md border border-destructive/20 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-600 animate-ping" />
                  <span className="text-sm font-semibold">Recording voice message...</span>
                  <span className="text-xs font-mono ml-2 font-bold">{recordDuration}s</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={cancelVoiceRecording} className="h-7 text-xs text-destructive hover:bg-destructive/20">
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={stopVoiceRecording} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white font-medium">
                    <Square className="h-3 w-3 mr-1 fill-current" /> Send
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <EmojiPicker onSelectEmoji={handleSelectEmoji} disabled={sendMessage.isPending} />
                <Input
                  ref={textInputRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={isDictating ? '🎙️ Listening... Speak now to transcribe' : 'Type your message...'}
                  disabled={sendMessage.isPending}
                  className={cn("flex-1", isDictating && "border-primary ring-2 ring-primary/40 bg-primary/5")}
                />
                {/* Voice-to-Text (Speech dictation into text box) */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleVoiceToText}
                  title={isDictating ? 'Stop Voice Typing' : 'Voice Typing (Speech to Text)'}
                  className={cn(
                    "shrink-0 transition-colors",
                    isDictating ? "text-primary animate-pulse bg-primary/20 hover:bg-primary/30" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Volume2 className="h-4 w-4" />
                </Button>
                {/* Voice Note recording button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={startVoiceRecording}
                  title="Record Voice Message (Voice Note)"
                  className="shrink-0 text-muted-foreground hover:text-red-500"
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <Button type="submit" disabled={sendMessage.isPending || (!content.trim() && files.length === 0)}>
                  <Send className="h-4 w-4" />
                </Button>
              </>
            )}
          </form>
        </CardFooter>
      </Card>

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
        isPending={sendMessage.isPending}
      />
      </>
      )}
    </div>
  );
}
