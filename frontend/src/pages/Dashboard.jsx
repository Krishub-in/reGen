import { useEffect, useState, useRef, useMemo, Suspense, lazy } from 'react';
import { useCustomAuth } from '../hooks/useCustomAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { 
  Users, Calendar, ClipboardList, MessageSquare, FileText, DollarSign, Building2, 
  LogOut, Home, Clock, Settings, Bell, Menu, ShieldCheck, User, Search,
  Phone, PhoneCall, PhoneOff, Video, Mic, Check, CheckCheck
} from 'lucide-react';
import DashboardHome from '../components/modules/DashboardHome';

// Lazy-loaded modules for optimized bundle splitting & faster page loads
const UsersModule = lazy(() => import('../components/modules/UsersModule'));
const AttendanceModule = lazy(() => import('../components/modules/AttendanceModule'));
const SchedulesModule = lazy(() => import('../components/modules/SchedulesModule'));
const MessengerModule = lazy(() => import('../components/modules/MessengerModule'));
const ScrumModule = lazy(() => import('../components/modules/ScrumModule'));
const CalendarModule = lazy(() => import('../components/modules/CalendarModule'));
const PaymentsModule = lazy(() => import('../components/modules/PaymentsModule'));
const CompanyModule = lazy(() => import('../components/modules/CompanyModule'));
const StaffProfileModule = lazy(() => import('../components/modules/StaffProfileModule'));
const NotificationsModule = lazy(() => import('../components/modules/NotificationsModule'));
const CallManager = lazy(() => import('../components/CallManager'));
import { useIsMobile } from '../hooks/use-mobile';
import { cn, hasUserRole, getUserRoleKey } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ModeToggle } from '@/components/mode-toggle';
import { 
  useGetUserNotifications, 
  useMarkNotificationRead, 
  useMarkAllNotificationsRead, 
  useUpdateNotificationAction,
  useGetCompanyInfo
} from '../hooks/useQueries';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Footer from '../components/Footer';

const getInitialModule = () => {
  if (typeof window === 'undefined') return 'home';

  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  if (pathname === '/settings' || pathname === '/profile') {
    return 'profile';
  }

  const params = new URLSearchParams(window.location.search);
  const tab = (params.get('tab') || params.get('module') || '').toLowerCase();
  if (tab === 'settings' || tab === 'profile') {
    return 'profile';
  }
  if (tab) {
    return tab;
  }

  const pathSegment = pathname.replace(/^\/+/, '');
  if (pathSegment && pathSegment !== 'superadmin') {
    return pathSegment;
  }

  return 'home';
};


export default function Dashboard({ userProfile }) {
  const { logout } = useCustomAuth();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState(getInitialModule);
  const isMobile = useIsMobile();
  const [showNotif, setShowNotif] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const notifDropdownRef = useRef(null);

  const currentYear = new Date().getFullYear();
  const { data: companyInfo } = useGetCompanyInfo();

  const isCompanyLogin = Boolean(
    userProfile?.role === 'owner' ||
    userProfile?.role === 'admin' ||
    userProfile?.role === 'param' ||
    userProfile?.role?.owner ||
    userProfile?.role?.admin ||
    userProfile?.role?.param
  );

  const availableYears = useMemo(() => {
    let startYear = currentYear;
    if (isCompanyLogin) {
      const estYear = companyInfo?.establishmentYear ||
        (companyInfo?.establishmentDate ? new Date(companyInfo.establishmentDate).getFullYear() : null) ||
        (companyInfo?.createdAt ? new Date(companyInfo.createdAt).getFullYear() : null);
      startYear = estYear && !isNaN(estYear) ? Math.min(Number(estYear), currentYear) : 2025;
    } else {
      const joinYear = (userProfile?.joiningDate ? new Date(userProfile.joiningDate).getFullYear() : null) ||
        (userProfile?.createdAt ? new Date(userProfile.createdAt).getFullYear() : null);
      startYear = joinYear && !isNaN(joinYear) ? Math.min(Number(joinYear), currentYear) : currentYear;
    }

    const years = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
    }
    return years.length > 0 ? years : [currentYear];
  }, [isCompanyLogin, companyInfo, userProfile, currentYear]);

  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('regen_selected_year') : null;
    const parsed = saved ? parseInt(saved, 10) : currentYear;
    return !isNaN(parsed) ? parsed : currentYear;
  });

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (selectedYear) {
      localStorage.setItem('regen_selected_year', String(selectedYear));
    }
  }, [selectedYear]);

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

  const navigateToModule = (moduleId, replace = false) => {
    const targetModule = moduleId === 'settings' ? 'profile' : moduleId;
    setActiveModule(targetModule);

    let newUrl = '/';
    if (targetModule === 'profile' || targetModule === 'settings') {
      newUrl = '/settings';
    } else if (targetModule && targetModule !== 'home') {
      newUrl = `/?tab=${targetModule}`;
    }

    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      if (replace) {
        window.history.replaceState(null, '', newUrl);
      } else {
        window.history.pushState(null, '', newUrl);
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveModule(getInitialModule());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (userProfile?.mustChangePassword) {
      toast.info('You are using a default password. You can change it in Settings.');
    }
  }, [userProfile?.mustChangePassword]);

  useEffect(() => {
    const handleNewNotif = (e) => {
      const n = e.detail;
      if (!n) return;
      if (n.type === 'payment' || (n.title && n.title.toLowerCase().includes('payment'))) {
        toast.success(n.title || 'Payment Received', {
          description: n.message,
          duration: 6000,
          action: {
            label: 'View Payments',
            onClick: () => setActiveModule('payments'),
          },
        });
      } else if (n.type === 'bonus' || (n.title && n.title.toLowerCase().includes('bonus'))) {
        toast.success(n.title || 'Bonus Added', {
          description: n.message,
          duration: 6000,
          action: {
            label: 'View',
            onClick: () => setActiveModule('payments'),
          },
        });
      } else if (n.type === 'deduction' || (n.title && n.title.toLowerCase().includes('deduction'))) {
        toast.info(n.title || 'Salary Deduction', {
          description: n.message,
          duration: 6000,
          action: {
            label: 'View',
            onClick: () => setActiveModule('payments'),
          },
        });
      } else {
        toast.info(n.title || 'Notification', {
          description: n.message,
        });
      }
    };

    window.addEventListener('app-notification-new', handleNewNotif);
    return () => window.removeEventListener('app-notification-new', handleNewNotif);
  }, []);

  useEffect(() => {
    if (!myNotifications.length) return;
    const unseen = myNotifications.filter((n) => !seenNotifications[n.id] && !n.read);
    if (!unseen.length) return;
    if (unseen.length === 1) {
      toast(`${unseen[0].title}: ${unseen[0].message}`);
    }
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
    } else if (type.includes('pay') || type.includes('salary') || title.includes('payment') || title.includes('salary') || type.includes('bonus') || title.includes('bonus') || type.includes('deduction') || title.includes('deduction')) {
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

  const userRoleKey = getUserRoleKey(userProfile);
  const displayRole = (() => {
    if (userRoleKey === 'owner') return 'Owner';
    if (userRoleKey === 'admin') return 'Company Admin';
    if (userRoleKey === 'param') return 'Super Admin';
    if (userProfile?.designation) return userProfile.designation;
    if (userRoleKey === 'intern') return 'Intern';
    if (userRoleKey === 'freelancer') return 'Freelancer';
    return 'Staff';
  })();

  const handleLogout = async () => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/');
    }
    if (typeof window !== 'undefined' && (window.location.pathname === '/settings' || window.location.pathname === '/profile')) {
      window.history.replaceState(null, '', '/');
    }
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
    { id: 'payments', label: 'Payments', icon: DollarSign, show: true },
    { id: 'company', label: 'Company', icon: Building2, show: isAdmin || isOwner },
  ];

  const renderModule = () => {
    switch (activeModule) {
      case 'home':
        return <DashboardHome userProfile={userProfile} onNavigate={navigateToModule} selectedYear={selectedYear} setSelectedYear={setSelectedYear} />;
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
      case 'settings':
        return <StaffProfileModule userProfile={userProfile} />;
      case 'notifications':
        return <NotificationsModule userProfile={userProfile} onNavigate={setActiveModule} />;
      default:
        return <DashboardHome userProfile={userProfile} onNavigate={navigateToModule} selectedYear={selectedYear} setSelectedYear={setSelectedYear} />;
    }
  };

  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      {/* Desktop Left Sidebar (Matching Reference Image) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card shrink-0 sticky top-0 h-screen overflow-y-auto">
        {/* Brand Logo */}
        <div className="h-16 flex items-center gap-2 px-6 border-b border-border">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => navigateToModule('home')}>
            <span className="text-xl font-semibold tracking-normal text-foreground">ReGen</span>
            <span className="w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.filter(item => item.show).map((item) => {
            const isActive = activeModule === item.id || (item.id === 'profile' && activeModule === 'settings');
            return (
              <button
                key={item.id}
                onClick={() => navigateToModule(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 select-none cursor-pointer",
                  isActive
                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 font-semibold border border-teal-500/25 shadow-2xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground font-medium"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground")} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Superadmin button if param */}
        {userProfile?.role === 'param' && (
          <div className="p-3 border-t border-border">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.href = '/superadmin'}
              className="w-full text-xs font-semibold justify-start gap-2 border-primary/30 text-primary hover:bg-primary/10 rounded-xl"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Super Admin Console</span>
            </Button>
          </div>
        )}

      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Header */}
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-card/85 backdrop-blur-md px-3 sm:px-4 md:px-8 flex items-center justify-between gap-2 sm:gap-4">
          {/* Mobile hamburger + brand */}
          <div className="flex items-center gap-2 sm:gap-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 rounded-xl border border-border text-foreground hover:bg-secondary transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveModule('home')}>
              <span className="text-lg font-semibold tracking-normal text-foreground">ReGen</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>
          </div>

          {/* Right Action Icons: Year Selector, Notification, Theme Switcher, Profile Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 ml-auto">
            {/* Year Selector Dropdown near Notification Bell */}
            <div className="flex items-center gap-1.5 bg-secondary/80 hover:bg-secondary border border-border px-2.5 sm:px-3 py-1.5 rounded-xl transition-all shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">Year:</span>
              <select
                id="dashboard-year-selector"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer pr-1"
                aria-label="Select Year"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr} className="bg-card text-foreground font-semibold">
                    {yr}
                  </option>
                ))}
              </select>
            </div>
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotif(v => !v)}
                className="relative w-9 h-9 rounded-xl border border-border bg-card hover:bg-secondary text-foreground flex items-center justify-center transition-colors shadow-xs"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotif && (
                <div 
                  ref={notifDropdownRef}
                  className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] max-w-sm sm:w-96 border border-border bg-card text-foreground rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs uppercase tracking-wider text-foreground">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllRead.mutate(myUserId)}
                        className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
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
                            !n.read ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/40"
                          )}
                        >
                          <div className="shrink-0 mt-0.5">
                            {isCall ? (
                              <div className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center",
                                n.type === 'video_call' 
                                  ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                                  : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                              )}>
                                {n.type === 'video_call' ? <Video className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
                              </div>
                            ) : isMeeting ? (
                              <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center">
                                <Users className="h-4 w-4" />
                              </div>
                            ) : isVoice ? (
                              <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center">
                                <Mic className="h-4 w-4" />
                              </div>
                            ) : isText ? (
                              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center">
                                <MessageSquare className="h-4 w-4" />
                              </div>
                            ) : (n.type === 'payment' || n.type === 'bonus' || (n.title && (n.title.toLowerCase().includes('payment') || n.title.toLowerCase().includes('salary') || n.title.toLowerCase().includes('bonus')))) ? (
                              <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center">
                                <DollarSign className="h-4 w-4" />
                              </div>
                            ) : (n.type === 'deduction' || (n.title && n.title.toLowerCase().includes('deduction'))) ? (
                              <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center">
                                <DollarSign className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                                <Bell className="h-4 w-4" />
                              </div>
                            )}
                          </div>

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
                      <div className="px-4 py-8 text-center text-muted-foreground">
                        <Bell className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                        <p className="text-xs font-medium">No notifications yet</p>
                      </div>
                    )}
                  </div>

                  <div className="p-2 border-t border-border bg-secondary/30 text-center">
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
            </div>

            {/* Super Admin Console Button */}
            {userProfile?.role === 'param' && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => window.location.href = '/superadmin'}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 shadow-xs px-3 h-9 rounded-xl text-xs"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Super Admin Console</span>
              </Button>
            )}

            {/* Theme Toggle (Sun/Moon Switcher) */}
            <ModeToggle />

            {/* User Profile Badge & Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  type="button"
                  className="flex items-center gap-2.5 pl-1.5 sm:pl-2 py-1 pr-1.5 sm:pr-2.5 rounded-xl border border-transparent hover:border-border hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all cursor-pointer select-none text-left"
                  title="User Account"
                  aria-label="User account menu"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-border shrink-0 bg-muted">
                    <img 
                      src={userProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'user'}`} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-bold text-foreground leading-tight truncate max-w-[120px]">{userProfile?.name || 'User'}</p>
                    <p className="text-[10px] text-muted-foreground font-medium capitalize">
                      {displayRole}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent 
                align="end" 
                sideOffset={8}
                className="w-60 p-1.5 rounded-2xl border border-border bg-popover/95 backdrop-blur-md shadow-xl text-popover-foreground z-50 duration-150"
              >
                {/* Profile Header */}
                <div 
                  onClick={() => navigateToModule('profile')}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors group"
                  title="View Account / Settings"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigateToModule('profile');
                    }
                  }}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0 bg-muted shadow-2xs">
                    <img 
                      src={userProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'user'}`} 
                      alt={userProfile?.name || 'User profile'} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                      {userProfile?.name || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">
                      {displayRole}
                    </p>
                  </div>
                </div>

                {/* Subtle Divider */}
                <DropdownMenuSeparator className="my-1 bg-border/60" />

                {/* Logout Menu Row */}
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer transition-colors outline-none"
                >
                  <LogOut className="w-4 h-4 text-destructive shrink-0" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile Navigation Drawer Sheet */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-xs sm:w-72 bg-card border-r border-border p-0 flex flex-col">
            <SheetHeader className="p-6 border-b border-border">
              <SheetTitle className="flex items-center gap-2">
                <span className="text-xl font-semibold tracking-normal text-foreground">ReGen</span>
                <span className="w-2 h-2 rounded-full bg-primary" />
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {menuItems.filter(item => item.show).map((item) => {
                const isActive = activeModule === item.id || (item.id === 'profile' && activeModule === 'settings');
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigateToModule(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 select-none cursor-pointer",
                      isActive
                        ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 font-semibold border border-teal-500/25 shadow-2xs"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground font-medium"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-teal-600 dark:text-teal-400" : "text-muted-foreground")} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>

        {/* Main Body */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 w-full min-w-0">
          <ErrorBoundary key={activeModule}>
            <Suspense fallback={
              <div className="flex h-64 w-full flex-col items-center justify-center p-8 bg-card/50 rounded-2xl border border-border/50 animate-pulse">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
                <p className="text-xs font-semibold text-muted-foreground">Loading module...</p>
              </div>
            }>
              {renderModule()}
            </Suspense>
          </ErrorBoundary>
        </main>

        <Footer />
      </div>
      <Suspense fallback={null}>
        <CallManager userProfile={userProfile} />
      </Suspense>
    </div>
  );
}

