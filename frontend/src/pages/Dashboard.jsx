import { useEffect, useState } from 'react';
import { useCustomAuth } from '../hooks/useCustomAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { 
  Users, Calendar, ClipboardList, MessageSquare, FileText, DollarSign, 
  Building2, LogOut, Home, Clock, Settings, Bell, Menu, ShieldCheck, User, Search 
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
import { useIsMobile } from '../hooks/use-mobile';
import { cn, hasUserRole } from '@/lib/utils';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ModeToggle } from '@/components/mode-toggle';
import { useGetUserNotifications } from '../hooks/useQueries';
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
  const { data: myNotifications = [] } = useGetUserNotifications(userProfile?.id);
  const [seenNotifications, setSeenNotifications] = useState({});

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
    if (!myNotifications.length) return;
    const unseen = myNotifications.filter(n => !seenNotifications[n.id]);
    if (!unseen.length) return;
    unseen.forEach(n => toast(`${n.title}: ${n.message}`));
    setSeenNotifications(prev => {
      const next = { ...prev };
      unseen.forEach(n => { next[n.id] = true; });
      return next;
    });
  }, [myNotifications]);

  const isAdmin = hasUserRole(userProfile, 'admin');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const isStaff = hasUserRole(userProfile, 'staff') || hasUserRole(userProfile, 'intern') || hasUserRole(userProfile, 'freelancer');

  const handleLogout = async () => {
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
    { id: 'payments', label: 'Payments', icon: DollarSign, show: isAdmin || isOwner },
    { id: 'company', label: 'Company', icon: Building2, show: isAdmin || isOwner },
  ];

  const renderModule = () => {
    switch (activeModule) {
      case 'home':
        return <DashboardHome userProfile={userProfile} onNavigate={navigateToModule} />;
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
      default:
        return <DashboardHome userProfile={userProfile} onNavigate={navigateToModule} />;
    }
  };

  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      {/* Desktop Left Sidebar (Matching Reference Image) */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card shrink-0 sticky top-0 h-screen overflow-y-auto">
        {/* Brand Logo */}
        <div className="h-16 flex items-center gap-2 px-6 border-b border-border">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => navigateToModule('home')}>
            <span className="text-xl font-bold tracking-tight text-foreground">reGen</span>
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

        {/* Sidebar Logout */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Header (Matching Reference Image) */}
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-card/85 backdrop-blur-md px-4 md:px-8 flex items-center justify-between gap-4">
          {/* Mobile hamburger + brand */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 rounded-xl border border-border text-foreground hover:bg-secondary transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5" onClick={() => setActiveModule('home')}>
              <span className="text-lg font-bold tracking-tight text-foreground">reGen</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>
          </div>

          {/* Search Box (Matching Reference Image) */}
          <div className="hidden sm:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search employees, departments..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Right Action Icons: Notification, Theme Switcher, Profile Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 ml-auto">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotif(v => !v)}
                className="relative w-9 h-9 rounded-xl border border-border bg-card hover:bg-secondary text-foreground flex items-center justify-center transition-colors shadow-xs"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {myNotifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {Math.min(9, myNotifications.length)}
                  </span>
                )}
              </button>

              {showNotif && (
                <div className="absolute right-0 top-12 z-50 w-80 border border-border bg-card text-foreground rounded-2xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b border-border bg-secondary/50 flex items-center justify-between">
                    <span>Notifications</span>
                    {myNotifications.length > 0 && (
                      <span className="text-[10px] font-semibold text-primary">{myNotifications.length} New</span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {myNotifications.slice(0, 6).map(n => (
                      <div key={n.id} className="p-3.5 hover:bg-secondary/40 transition-colors">
                        <div className="font-semibold text-xs text-foreground">{n.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.message}</div>
                      </div>
                    ))}
                    {myNotifications.length === 0 && (
                      <div className="py-8 text-center text-xs text-muted-foreground">No new notifications</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle (Sun/Moon Switcher) */}
            <ModeToggle />

            {/* User Profile Badge (Rightmost Topbar matching Reference Image) */}
            <div 
              onClick={() => navigateToModule('profile')}
              className="hidden sm:flex items-center gap-2.5 pl-2 py-1 pr-2 rounded-xl border border-transparent hover:border-border hover:bg-secondary/40 transition-all cursor-pointer"
              title="View Account / Settings"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden border border-border shrink-0 bg-muted">
                <img 
                  src={userProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || 'user'}`} 
                  alt="" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-foreground leading-tight truncate max-w-[120px]">{userProfile?.name || 'User'}</p>
                <p className="text-[10px] text-muted-foreground font-medium capitalize">
                  {isAdmin ? 'Admin' : (isOwner ? 'Owner' : 'Staff')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer Sheet */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-72 bg-card border-r border-border p-0 flex flex-col">
            <SheetHeader className="p-6 border-b border-border">
              <SheetTitle className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-foreground">reGen</span>
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
            <div className="p-4 border-t border-border">
              <button
                onClick={async () => {
                  await handleLogout();
                  setMobileNavOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Main Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full min-w-0">
          <ErrorBoundary key={activeModule}>
            {renderModule()}
          </ErrorBoundary>
        </main>

        <Footer />
      </div>
    </div>
  );
}
