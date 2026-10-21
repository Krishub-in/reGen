import { useState, useMemo } from 'react';
import { 
  Bell, CheckCheck, Trash2, Check, Video, PhoneCall, Mic, MessageSquare, 
  Users, Calendar, Clock, DollarSign, Building2, ClipboardList, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  useGetUserNotifications, 
  useMarkNotificationRead, 
  useMarkAllNotificationsRead, 
  useDeleteNotification 
} from '../../hooks/useQueries';
import { cn } from '../../lib/utils';
import PageHeader from '../PageHeader';

export default function NotificationsModule({ userProfile, onNavigate }) {
  const myUserId = userProfile?.userId ? (userProfile.userId.toText ? userProfile.userId.toText() : String(userProfile.userId)) : (userProfile?.id ? (userProfile.id.toText ? userProfile.id.toText() : String(userProfile.id)) : '');
  const { data: notifications = [], isLoading } = useGetUserNotifications(myUserId);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();

  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'read'

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'read') return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, filter]);

  const formatNotifTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleNotificationClick = (n) => {
    // 1. Mark as read immediately to reduce count
    if (!n.read) {
      markRead.mutate(n.id);
    }

    // 2. Redirect to the target page / module
    const type = (n.type || '').toLowerCase();
    const title = (n.title || '').toLowerCase();
    const message = (n.message || '').toLowerCase();
    const targetModule = n.metadata?.module || n.metadata?.tab;

    if (targetModule && onNavigate) {
      onNavigate(targetModule);
      return;
    }

    if (type === 'text_message' || type === 'voice_message' || type.includes('message') || type.includes('chat')) {
      if (onNavigate) onNavigate('messenger');
      const convId = n.conversationId || n.metadata?.conversationId;
      const recId = n.senderId || n.metadata?.senderId;
      if (convId || recId) {
        localStorage.setItem('pending_open_conversation', JSON.stringify({ conversationId: convId, recipientId: recId }));
        [50, 150, 300, 600].forEach((delay) => {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('open-conversation', {
                detail: { conversationId: convId, recipientId: recId },
              })
            );
          }, delay);
        });
      }
    } else if (type === 'voice_call' || type === 'video_call') {
      if (n.actionStatus === 'pending') {
        window.dispatchEvent(new CustomEvent('accept-incoming-call', { detail: n }));
      }
    } else if (type === 'team_meeting' || type.includes('meeting')) {
      window.dispatchEvent(
        new CustomEvent('join-team-meeting', {
          detail: {
            meetingId: n.meetingId || n.metadata?.meetingId,
            title: n.metadata?.title || n.message,
            mediaType: n.metadata?.mediaType || 'video',
          },
        })
      );
    } else if (type.includes('task') || title.includes('task') || message.includes('task') || type.includes('schedule')) {
      if (onNavigate) onNavigate('schedules');
    } else if (type.includes('attendance') || type.includes('leave') || title.includes('attendance') || title.includes('leave') || message.includes('leave')) {
      if (onNavigate) onNavigate('attendance');
    } else if (type.includes('scrum') || title.includes('scrum') || message.includes('scrum')) {
      if (onNavigate) onNavigate('scrum');
    } else if (type.includes('pay') || type.includes('salary') || title.includes('payment') || title.includes('salary')) {
      if (onNavigate) onNavigate('payments');
    } else if (type.includes('birthday') || title.includes('birthday') || message.includes('birthday') || type.includes('user')) {
      if (onNavigate) onNavigate('users');
    } else if (type.includes('company') || title.includes('company')) {
      if (onNavigate) onNavigate('company');
    } else if (type.includes('calendar') || title.includes('calendar') || message.includes('calendar') || type.includes('event')) {
      if (onNavigate) onNavigate('calendar');
    } else if (type.includes('profile')) {
      if (onNavigate) onNavigate('profile');
    }
  };

  const getNotifIcon = (n) => {
    const isCall = n.type === 'voice_call' || n.type === 'video_call';
    const isMeeting = n.type === 'team_meeting';
    const isVoice = n.type === 'voice_message';
    const isText = n.type === 'text_message';
    const title = (n.title || '').toLowerCase();
    const type = (n.type || '').toLowerCase();

    if (isCall) {
      return (
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
          n.type === 'video_call' 
            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
            : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
        )}>
          {n.type === 'video_call' ? <Video className="h-5 w-5" /> : <PhoneCall className="h-5 w-5" />}
        </div>
      );
    }
    if (isMeeting) {
      return (
        <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Users className="h-5 w-5" />
        </div>
      );
    }
    if (isVoice) {
      return (
        <div className="h-10 w-10 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center shrink-0">
          <Mic className="h-5 w-5" />
        </div>
      );
    }
    if (isText) {
      return (
        <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5" />
        </div>
      );
    }
    if (type.includes('task') || title.includes('task')) {
      return (
        <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
          <ClipboardList className="h-5 w-5" />
        </div>
      );
    }
    if (type.includes('attendance') || title.includes('attendance')) {
      return (
        <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <Clock className="h-5 w-5" />
        </div>
      );
    }
    if (type.includes('pay') || type.includes('salary') || title.includes('payment') || title.includes('salary') || type.includes('bonus') || title.includes('bonus')) {
      return (
        <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <DollarSign className="h-5 w-5" />
        </div>
      );
    }
    if (type.includes('deduction') || title.includes('deduction')) {
      return (
        <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
          <DollarSign className="h-5 w-5" />
        </div>
      );
    }
    return (
      <div className="h-10 w-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Bell className="h-5 w-5" />
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        icon={Bell}
        title={
          <span className="flex items-center gap-2">
            <span>Notifications</span>
            {unreadCount > 0 ? (
              <Badge variant="default" className="text-xs bg-[#15966A] text-white">
                {unreadCount} unread
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs text-muted-foreground font-normal">
                All caught up
              </Badge>
            )}
          </span>
        }
        subtitle="View and manage all your notifications, calls, alerts and updates."
        actions={
          unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate(myUserId)}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 text-xs font-medium"
            >
              <CheckCheck className="h-4 w-4 text-[#15966A]" />
              <span>Mark all read</span>
            </Button>
          )
        }
      />

      {/* Filter and Content Card */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className="text-xs h-8"
            >
              All ({notifications.length})
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('unread')}
              className="text-xs h-8"
            >
              Unread ({unreadCount})
            </Button>
            <Button
              variant={filter === 'read' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('read')}
              className="text-xs h-8"
            >
              Read ({notifications.length - unreadCount})
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="divide-y divide-border/60">
            {filteredNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={cn(
                  "p-4 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 my-1.5 group border border-transparent",
                  !n.read 
                    ? "bg-primary/5 hover:bg-primary/10 border-primary/10 shadow-xs" 
                    : "hover:bg-accent/40"
                )}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {getNotifIcon(n)}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                      <span className="text-[11px] text-muted-foreground ml-auto sm:ml-0 font-medium">
                        {formatNotifTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markRead.mutate(n.id)}
                      title="Mark as read"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Mark read
                    </Button>
                  )}
                  {deleteNotif && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteNotif.mutate(n.id)}
                      title="Delete notification"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {filteredNotifications.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <h3 className="font-semibold text-base text-foreground">No notifications found</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  {filter === 'unread' 
                    ? "You've read all your notifications. No unread items!" 
                    : "You're completely up to date. Messages, reminders, and updates will appear here."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
