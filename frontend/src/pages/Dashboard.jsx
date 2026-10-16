import { useEffect, useState } from 'react';
import { useCustomAuth } from '../hooks/useCustomAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Users, Calendar, ClipboardList, MessageSquare, FileText, DollarSign, Building2, LogOut, Home, Clock, Settings, Bell, Menu, ShieldCheck } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ModeToggle } from '@/components/mode-toggle';
import { useGetUserNotifications } from '../hooks/useQueries';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Footer from '../components/Footer';

export default function Dashboard({ userProfile }) {
  const { logout } = useCustomAuth();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState(userProfile?.mustChangePassword ? 'profile' : 'home');
  const isMobile = useIsMobile();
  const [logoError, setLogoError] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/logo.jpeg');
  const [showNotif, setShowNotif] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { data: myNotifications = [] } = useGetUserNotifications(userProfile.id);
  const [seenNotifications, setSeenNotifications] = useState({});

  useEffect(() => {
    if (userProfile?.mustChangePassword) {
      setActiveModule('profile');
      toast.error('Please change your default password');
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

  const isAdmin = userProfile.role.hasOwnProperty('admin');
  const isOwner = userProfile.role.hasOwnProperty('owner') || userProfile.role.hasOwnProperty('param');
  const isStaff = userProfile.role.hasOwnProperty('staff') || userProfile.role.hasOwnProperty('intern') || userProfile.role.hasOwnProperty('freelancer');

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
  };

  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: Home, show: true },
    { id: 'users', label: 'Users', icon: Users, show: isAdmin || isOwner },
    { id: 'attendance', label: 'Attendance', icon: Clock, show: true },
    { id: 'schedules', label: 'Schedules', icon: ClipboardList, show: true },
    { id: 'messenger', label: 'Messenger', icon: MessageSquare, show: true },
    { id: 'scrum', label: 'Scrum', icon: FileText, show: true },
    { id: 'calendar', label: 'Calendar', icon: Calendar, show: true },
    { id: 'payments', label: 'Payments', icon: DollarSign, show: isAdmin || isOwner },
    { id: 'company', label: 'Company', icon: Building2, show: isAdmin || isOwner },
    { id: 'profile', label: 'Settings', icon: Settings, show: true },
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
              className="relative rounded-md p-2 hover:bg-accent"
              onClick={() => setShowNotif(v => !v)}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {myNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                  {Math.min(9, myNotifications.length)}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-2 md:right-20 top-12 z-20 w-72 border border-border bg-popover text-popover-foreground rounded-md shadow-md">
                <div className="px-3 py-2 text-sm font-medium border-b">Notifications</div>
                <div className="max-h-64 overflow-y-auto">
                  {(myNotifications.slice(0,5)).map(n => (
                    <div key={n.id} className="px-3 py-2 text-sm border-b last:border-b-0">
                      <div className="font-semibold">{n.title}</div>
                      <div className="text-muted-foreground">{n.message}</div>
                    </div>
                  ))}
                  {myNotifications.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground">No notifications</div>
                  )}
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
    </div>
  );
}
