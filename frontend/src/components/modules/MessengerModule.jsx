import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGetAllMessages, useSendMessage, useGetAllUsers, useDeleteMessage, useEditMessage } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Principal } from '@dfinity/principal';
import { Send, Paperclip, X, Pencil, Trash2, Search, ChevronUp, ChevronDown, Check, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';
import PrivateChatModule from './PrivateChatModule';

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
      <div className="flex items-center justify-end">
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
      
      <Card className="border border-border bg-card text-foreground rounded-2xl shadow-xs overflow-hidden h-[calc(100vh-11rem)] min-h-[580px] flex flex-col w-full">
        <CardHeader className="h-16 px-4 md:px-6 border-b border-border bg-card/80 backdrop-blur-xs flex flex-row items-center justify-between gap-3 shrink-0 py-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-border">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-foreground">Company Team Channel</CardTitle>
              <p className="text-xs text-muted-foreground">General workspace collaboration</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => { setSearchOpen(o => !o); setSearchTerm(''); setCurrentMatchIndex(0); }}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0 p-0 relative bg-background/50">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {isLoading ? (
              <div className="h-full flex items-center justify-center py-16 text-muted-foreground text-sm">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center">
                <div className="w-14 h-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-foreground">Welcome to Team Chat</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                  Post company-wide announcements, share updates, or collaborate with all teammates right here.
                </p>
              </div>
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
                    className={`group flex ${own ? 'justify-end' : 'justify-start'} ${isCurrentSearchMatch ? 'ring-2 ring-amber-400 rounded-2xl' : ''}`}
                    onMouseDown={() => onMessagePointerDown(mid)}
                    onMouseUp={onMessagePointerUp}
                    onTouchStart={() => onMessagePointerDown(mid)}
                    onTouchEnd={onMessagePointerUp}
                    onClick={() => selectionMode ? toggleSelect(mid) : null}
                  >
                    <div
                      className={`max-w-[78%] sm:max-w-[68%] rounded-2xl p-3.5 relative shadow-xs transition-all ${
                        own
                          ? 'bg-[#0D9488] text-white rounded-br-xs'
                          : 'bg-card border border-border text-foreground rounded-bl-xs'
                      } ${selectionMode && selectedIds.includes(mid) ? 'ring-2 ring-destructive' : ''}`}
                    >
                      {/* Edit/Delete action buttons – shown on hover */}
                      {modifiable && !selectionMode && !isEditing && (
                        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1 bg-card/90 border border-border/60 rounded-lg p-0.5 shadow-xs">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(message); }}
                            className="rounded p-1 hover:bg-secondary text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSingle(mid); }}
                            className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
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
                            <Button size="sm" className="h-6 px-2 text-xs bg-white text-emerald-800" onClick={confirmEdit} disabled={editMessage.isPending || !editContent.trim()}>
                              <Check className="h-3 w-3 mr-1" /> Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm break-words leading-relaxed whitespace-pre-wrap">{highlightText(message.content, msgIndex)}</p>
                      )}

                      {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {message.attachments.map((att, idx) => {
                            const normalized = normalizeAttachment(att);
                            if (!normalized) return null;
                            const sizeText = typeof normalized.size === 'number' ? ` (${Math.round(normalized.size / 1024)} KB)` : '';
                            const publicPath = toPublicPath(normalized.path);
                            return (
                              <div key={`${message.id}-att-${idx}`} className={`rounded-xl border p-2 text-xs flex items-center gap-2 ${
                                own ? 'bg-white/10 border-white/20 text-white' : 'bg-muted/40 border-border text-foreground'
                              }`}>
                                {isImageAttachment(normalized) ? (
                                  <img src={publicPath} alt={normalized.name} className="max-h-36 rounded-lg object-contain mb-1" />
                                ) : (
                                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <a href={publicPath} download={normalized.name} className="underline truncate flex-1 hover:opacity-80" title={normalized.name}>
                                  {truncateName(normalized.name)}{sizeText}
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      <div className={`flex items-center justify-between gap-3 mt-1.5 text-[10px] ${own ? 'text-white/80' : 'text-muted-foreground'}`}>
                        <span className="font-semibold truncate">
                          {own ? 'You' : getSenderName(message.senderId, message.senderName || message.sender || 'Unknown')}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {message.editedAt && (
                            <span className="italic opacity-80">(edited)</span>
                          )}
                          <span>{formatTime(message.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </CardContent>

        <CardFooter className="p-3 md:p-4 border-t border-border bg-card/90 backdrop-blur-xs shrink-0">
          <form onSubmit={handleSend} className="flex items-center gap-2 w-full">
            <Label htmlFor="chat-files" className="h-10 w-10 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground flex items-center justify-center cursor-pointer shrink-0 transition-colors border border-border">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </Label>
            <Input
              id="chat-files"
              type="file"
              multiple
              accept="*/*"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            {files.length > 0 && (
              <div className="flex items-center gap-1.5 max-w-[30%] overflow-x-auto">
                {files.map((f, idx) => (
                  <Badge key={`${f.name}-${idx}`} variant="secondary" className="flex items-center gap-1 whitespace-nowrap text-xs py-1 px-2 rounded-lg" title={f.name}>
                    <span>{truncateName(f.name)}</span>
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
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Post a message to team..."
              disabled={sendMessage.isPending}
              className="flex-1 h-10 rounded-xl bg-background border-border text-xs sm:text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white shrink-0 shadow-xs"
              disabled={sendMessage.isPending || (!content.trim() && files.length === 0)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardFooter>
      </Card>
      </>
      )}
    </div>
  );
}
