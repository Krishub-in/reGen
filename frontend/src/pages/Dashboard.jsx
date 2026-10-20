import { useEffect, useState, useRef } from 'react';
import { useCustomAuth } from '../hooks/useCustomAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { 
  Users, Calendar, ClipboardList, MessageSquare, FileText, DollarSign, Building2, 
  LogOut, Home, Clock, Settings, Bell, Menu, ShieldCheck, User,
  Phone, PhoneCall, PhoneOff, Video, Mic, Check, CheckCheck
} from 'lucide-react';
import UsersModule from '../components/modules/UsersModule';
import AttendanceModule from '../components/modules/AttendanceModule';
import SchedulesModule from '../components/modules/SchedulesModule';
import MessengerModule from '../components/modules/MessengerModule';
import ScrumModule from '../components/modules/ScrumModule';
import CalendarModule from '../components/modules/CalendarModule';
import PaymentsModule from '../components/modules/PaymentsModule';
import CompanyModule from '../components/modules/CompanyModule';
import DashboardHome from '../components/modules/DashboardHome';
import StaffProfileModule from '../components/modules/StaffProfileModule';
import NotificationsModule from '../components/modules/NotificationsModule';
import CallManager from '../components/CallManager';
import { useIsMobile } from '../hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ModeToggle } from '@/components/mode-toggle';
import { 
  useGetUserNotifications, 
  useMarkNotificationRead, 
  useMarkAllNotificationsRead, 
  useUpdateNotificationAction 
} from '../hooks/useQueries';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Footer from '../components/Footer';

import { hasUserRole } from '../lib/utils';


export default function Dashboard({ userProfile }) {
  const { logout } = useCustomAuth();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || params.get('module') || 'home';
  });
  const isMobile = useIsMobile();
  const [logoError, setLogoError] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/logo.jpeg');
  const [showNotif, setShowNotif] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const notifDropdownRef = useRef(null);

  const myUserId = userProfile?.userId ? (userProfile.userId.toText ? userProfile.userId.toText() : String(userProfile.userId)) : (userProfile?.id ? (userProfile.id.toText ? userProfile.id.toText() : String(userProfile.id)) : '');
  const { data: myNotifications = [] } = useGetUserNotifications(myUserId);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const updateNotifAction = useUpdateNotificationAction();
  const [seenNotifications, setSeenNotifications] = useState({});

  const unreadCount = myNotifications.filter((n) => !n.read).length;

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target)) {
        setShowNotif(false);
      }
    };
    if (showNotif) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotif]);

  useEffect(() => {
    if (userProfile?.mustChangePassword) {
      toast.info('You are using a default password. You can change it in Settings.');
    }
  }, [userProfile?.mustChangePassword]);

  useEffect(() => {
    if (!myNotifications.length) return;
    const unseen = myNotifications.filter((n) => !seenNotifications[n.id] && !n.read);
    if (!unseen.length) return;
    unseen.forEach((n) => toast(`${n.title}: ${n.message}`));
    setSeenNotifications((prev) => {
      const next = { ...prev };
      unseen.forEach((n) => {
        next[n.id] = true;
      });
      return next;
    });
  }, [myNotifications]);

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
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleNotificationClick = (n) => {
    // 1. Mark as read immediately (optimistic update ensures bell badge & notification return to normal)
    if (!n.read) {
      markRead.mutate(n.id);
    }

    // 2. Close notification dropdown
    setShowNotif(false);

    // 3. Redirect to the target page / module
    const type = (n.type || '').toLowerCase();
    const title = (n.title || '').toLowerCase();
    const message = (n.message || '').toLowerCase();
    const targetModule = n.metadata?.module || n.metadata?.tab;

    if (targetModule) {
      setActiveModule(targetModule);
      return;
    }

    if (type === 'text_message' || type === 'voice_message' || type.includes('message') || type.includes('chat')) {
      setActiveModule('messenger');
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
      setActiveModule('schedules');
    } else if (type.includes('attendance') || type.includes('leave') || title.includes('attendance') || title.includes('leave') || message.includes('leave')) {
      setActiveModule('attendance');
    } else if (type.includes('scrum') || title.includes('scrum') || message.includes('scrum')) {
      setActiveModule('scrum');
    } else if (type.includes('pay') || type.includes('salary') || title.includes('payment') || title.includes('salary')) {
      setActiveModule('payments');
    } else if (type.includes('birthday') || title.includes('birthday') || message.includes('birthday') || type.includes('user')) {
      setActiveModule('users');
    } else if (type.includes('company') || title.includes('company')) {
      setActiveModule('company');
    } else if (type.includes('calendar') || title.includes('calendar') || message.includes('calendar') || type.includes('event')) {
      setActiveModule('calendar');
    } else if (type.includes('profile')) {
      setActiveModule('profile');
    } else {
      setActiveModule('notifications');
    }
  };

  const handleAcceptCallFromNotif = (e, n) => {
    e.stopPropagation();
    markRead.mutate(n.id);
    setShowNotif(false);
    window.dispatchEvent(new CustomEvent('accept-incoming-call', { detail: n }));
  };

  const handleRejectCallFromNotif = (e, n) => {
    e.stopPropagation();
    updateNotifAction.mutate({ id: n.id, actionStatus: 'rejected' });
  };

  const handleJoinMeetingFromNotif = (e, n) => {
    e.stopPropagation();
    markRead.mutate(n.id);
    setShowNotif(false);
    window.dispatchEvent(
      new CustomEvent('join-team-meeting', {
        detail: {
          meetingId: n.meetingId || n.metadata?.meetingId,
          title: n.metadata?.title || n.message,
          mediaType: n.metadata?.mediaType || 'video',
        },
      })
    );
  };


  const isAdmin = hasUserRole(userProfile, 'admin');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const isStaff = hasUserRole(userProfile, 'staff') || hasUserRole(userProfile, 'intern') || hasUserRole(userProfile, 'freelancer');

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
  };

  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: Home, show: true },
    { id: 'users', label: isOwner ? 'Staff / Employees' : 'Users', icon: Users, show: isAdmin || isOwner },
    { id: 'attendance', label: 'Attendance', icon: Clock, show: true },
    { id: 'schedules', label: 'Schedules', icon: ClipboardList, show: true },
    { id: 'messenger', label: 'Messenger', icon: MessageSquare, show: true },
    { id: 'scrum', label: 'Scrum', icon: FileText, show: true },
    { id: 'calendar', label: 'Calendar', icon: Calendar, show: true },
    { id: 'profile', label: 'Settings', icon: Settings, show: true },
    { id: 'payments', label: 'Payments', icon: DollarSign, show: isAdmin || isOwner },
    { id: 'company', label: 'Company', icon: Building2, show: isAdmin || isOwner },
  ];

  const renderModule = () => {
    switch (activeModule) {
      case 'home':
        return <DashboardHome userProfile={userProfile} onNavigate={setActiveModule} />;
      case 'users':
        return <UsersModule userProfile={userProfile} />;
      case 'attendance':
        return <AttendanceModule userProfile={userProfile} />;
      case 'schedules':
        return <SchedulesModule userProfile={userProfile} />;
      case 'messenger':
        return <MessengerModule userProfile={userProfile} />;
      case 'scrum':
        return <ScrumModule userProfile={userProfile} />;
      case 'calendar':
        return <CalendarModule userProfile={userProfile} />;
      case 'payments':
        return <PaymentsModule userProfile={userProfile} />;
      case 'company':
        return <CompanyModule userProfile={userProfile} />;
      case 'profile':
        return <StaffProfileModule userProfile={userProfile} />;
      case 'notifications':
        return <NotificationsModule userProfile={userProfile} onNavigate={setActiveModule} />;
      default:
        return <DashboardHome userProfile={userProfile} onNavigate={setActiveModule} />;
    }
  };

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-3 px-3 md:px-6 flex-wrap md:flex-nowrap">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden inline-flex items-center justify-center rounded-md p-2 hover:bg-accent"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {logoError ? (
              <div className="h-8 w-8 md:h-10 md:w-10" />
            ) : (
              <img
                src={logoSrc}
                alt="reGen"
                className="h-8 w-8 md:h-10 md:w-10"
                onError={() => {
                  if (logoSrc === '/logo.jpeg') {
                    setLogoSrc('/logo.png');
                  } else {
                    setLogoError(true);
                  }
                }}
              />
            )}
            <div className="hidden md:block">
              <h2 className="font-bold text-lg">reGen</h2>
              <p className="text-xs text-muted-foreground">{userProfile?.name}</p>
            </div>
            <div className="md:hidden">
              <h2 className="font-semibold text-base">reGen</h2>
            </div>
          </div>
          <nav className="hidden md:flex md:flex-1 md:overflow-x-auto md:no-scrollbar">
            <div className="flex items-center gap-1">
              {menuItems.filter(item => item.show).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveModule(item.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md transition-colors flex-shrink-0",
                    activeModule === item.id 
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="text-sm">{item.label}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="flex items-center gap-2 pl-2 relative ml-auto">
            <button
              className="relative rounded-md p-2 hover:bg-accent focus:outline-none"
              onClick={() => setShowNotif(v => !v)}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-in zoom-in-50">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotif && (
              <div 
                ref={notifDropdownRef}
                className="absolute right-0 sm:right-2 top-12 z-50 w-80 sm:w-96 max-w-[90vw] border border-border bg-popover text-popover-foreground rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllRead.mutate(myUserId)}
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
                  {myNotifications.map((n) => {
                    const isCall = n.type === 'voice_call' || n.type === 'video_call';
                    const isMeeting = n.type === 'team_meeting';
                    const isVoice = n.type === 'voice_message';
                    const isText = n.type === 'text_message';

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={cn(
                          "p-3.5 transition-colors cursor-pointer flex gap-3 text-sm relative group",
                          !n.read ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/40"
                        )}
                      >
                        {/* Icon */}
                        <div className="shrink-0 mt-0.5">
                          {isCall ? (
                            <div className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center",
                              n.type === 'video_call' 
                                ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                                : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                            )}>
                              {n.type === 'video_call' ? <Video className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
                            </div>
                          ) : isMeeting ? (
                            <div className="h-9 w-9 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center">
                              <Users className="h-4 w-4" />
                            </div>
                          ) : isVoice ? (
                            <div className="h-9 w-9 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center">
                              <Mic className="h-4 w-4" />
                            </div>
                          ) : isText ? (
                            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center">
                              <MessageSquare className="h-4 w-4" />
                            </div>
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                              <Bell className="h-4 w-4" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs truncate text-foreground">
                              {n.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                              {formatNotifTime(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {n.message}
                          </p>

                          {/* Action Buttons for Call */}
                          {isCall && n.actionStatus === 'pending' && (
                            <div className="flex items-center gap-2 pt-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1 shadow-sm"
                                onClick={(e) => handleAcceptCallFromNotif(e, n)}
                              >
                                <PhoneCall className="h-3 w-3" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-3 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                                onClick={(e) => handleRejectCallFromNotif(e, n)}
                              >
                                <PhoneOff className="h-3 w-3" />
                                Decline
                              </Button>
                            </div>
                          )}

                          {isCall && n.actionStatus !== 'pending' && n.actionStatus !== 'none' && (
                            <div className="pt-1">
                              <span className={cn(
                                "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full",
                                n.actionStatus === 'accepted' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                                n.actionStatus === 'rejected' ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {n.actionStatus}
                              </span>
                            </div>
                          )}

                          {/* Action Button for Team Meeting */}
                          {isMeeting && (
                            <div className="pt-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium flex items-center gap-1.5 shadow-sm"
                                onClick={(e) => handleJoinMeetingFromNotif(e, n)}
                              >
                                <Video className="h-3 w-3" />
                                Join Meeting
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Unread dot and individual mark read button */}
                        <div className="shrink-0 flex flex-col items-end justify-between self-stretch pl-1">
                          {!n.read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markRead.mutate(n.id);
                              }}
                              title="Mark as read"
                              className="text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 p-0.5 transition-opacity"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!n.read && (
                            <span className="h-2 w-2 rounded-full bg-primary mt-auto" />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {myNotifications.length === 0 && (
                    <div className="px-4 py-10 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No notifications yet</p>
                      <p className="text-xs text-muted-foreground/80 mt-0.5">
                        Messages, calls, and meetings will appear here
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-2 border-t bg-muted/20 text-center">
                  <button
                    onClick={() => {
                      setShowNotif(false);
                      setActiveModule('notifications');
                    }}
                    className="text-xs text-primary hover:underline font-semibold py-1 px-3 w-full"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
            {userProfile?.role === 'param' && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => window.location.href = '/superadmin'}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 shadow-sm px-3"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Super Admin Console</span>
              </Button>
            )}
            <ModeToggle />
            <Button variant="outline" onClick={handleLogout} className="hidden md:inline-flex">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-1">
            {menuItems.filter(item => item.show).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveModule(item.id);
                  setMobileNavOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  activeModule === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={async () => {
                  await handleLogout();
                  setMobileNavOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className={cn("flex-1 bg-background text-foreground", isMobile ? "p-4 pb-6" : "p-12")}>
        <ErrorBoundary key={activeModule}>
          {renderModule()}
        </ErrorBoundary>
      </main>
      <Footer />
      <CallManager userProfile={userProfile} />
    </div>
  );
}

