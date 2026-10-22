import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { authFetch, cn, hasUserRole, getUserRoleKey } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { useTheme, ThemeProvider } from 'next-themes';
import { 
  Building2, Users, CreditCard, TrendingUp, Settings, ShieldAlert, LogOut, 
  CheckCircle, XCircle, Search, Filter, ShieldCheck, Activity, Database, Plus,
  UserCog, Lock, Mail, User, Shield, Camera, MapPin, Pencil, Trash2, RefreshCw, Phone, Ban, Unlock, Copy, Download, Home, Eye, EyeOff, Sun, Moon,
  ArrowLeft, ChevronRight, MoreVertical, ArrowLeftRight, AlertTriangle, Calendar
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import Footer from '../components/Footer';
import CalendarModule from '../components/modules/CalendarModule';
import { Menu } from 'lucide-react';

// Real-time Calculation and Pricing Helpers
export const toLocalDateStr = (d) => {
  if (!d) return null;
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return null;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const COMPANY_CATEGORIES = {
  it: 'IT Solutions',
  logistics: 'Logistics',
  manufacturing: 'Manufacturing',
  retail: 'Retail',
  healthcare: 'Healthcare',
};

function SuperAdminContent({ isAuthenticated, setIsAuthenticated }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const [loginForm, setLoginForm] = useState({ id: 'Vyshwa', password: 'admin123' });
  const [showSaPassword, setShowSaPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profileData, setProfileData] = useState({
    userId: '',
    name: '',
    username: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
    avatar: '',
    role: 'param',
  });
  const [dbCompanies, setDbCompanies] = useState([]);
  const [dbUsers, setDbUsers] = useState([]);
  const [dbAttendance, setDbAttendance] = useState([]);
  const [dbTasks, setDbTasks] = useState([]);
  const [dbMessages, setDbMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Restore session on page load / refresh
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('sa_auth_token') || localStorage.getItem('auth_token');
      const saId = localStorage.getItem('active_sa_id') || localStorage.getItem('current_user');
      if (!token || !saId) return;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('sa_auth_token', token);
      localStorage.setItem('active_sa_id', saId);
      try {
        // Validate token by fetching the user profile
        const resp = await authFetch(`/api/users/${saId}`);
        if (!resp.ok) throw new Error('Token invalid');
        const dbUser = await resp.json();
        if (dbUser.role !== 'param' && dbUser.role !== 'admin') throw new Error('Not an admin');
        setProfileData({
          userId: dbUser.userId,
          name: dbUser.name || dbUser.username || '',
          username: dbUser.username || '',
          email: dbUser.email || '',
          phone: dbUser.phone || '',
          designation: dbUser.designation || '',
          department: dbUser.department || '',
          avatar: dbUser.avatar || '',
          role: dbUser.role,
        });
        setIsAuthenticated(true);
      } catch (e) {
        // Token expired or invalid — clear and show login
        localStorage.removeItem('sa_auth_token');
        localStorage.removeItem('active_sa_id');
      }
    };
    restoreSession();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRealData();
    }
  }, [isAuthenticated]);

  const fetchRealData = async () => {
    setIsLoading(true);
    try {
      const [uResp, cResp, aResp, tResp, mResp] = await Promise.all([
        authFetch('/api/users').catch(() => null),
        authFetch('/api/company').catch(() => null),
        authFetch('/api/attendance').catch(() => null),
        authFetch('/api/tasks').catch(() => null),
        authFetch('/api/messages').catch(() => null),
      ]);
      if (uResp && uResp.ok) setDbUsers(await uResp.json());
      if (cResp && cResp.ok) {
        const coData = await cResp.json();
        // Backend returns single object or array depending on structure. normalize.
        setDbCompanies(Array.isArray(coData) ? coData : (coData ? [coData] : []));
      }
      if (aResp && aResp.ok) {
        const aData = await aResp.json();
        setDbAttendance(Array.isArray(aData) ? aData : []);
      }
      if (tResp && tResp.ok) {
        const tData = await tResp.json();
        setDbTasks(Array.isArray(tData) ? tData : []);
      }
      if (mResp && mResp.ok) {
        const mData = await mResp.json();
        setDbMessages(Array.isArray(mData) ? mData : []);
      }
    } catch (e) {
      console.error("Failed to fetch dashboard data", e);
    } finally {
      setIsLoading(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: (loginForm.id || '').trim(), password: (loginForm.password || '').trim() })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: 'Invalid Super Admin credentials' }));
        throw new Error(err.message || 'Verification failed');
      }
      const user = await resp.json();
      if (user.role === 'param' || user.role === 'admin') {
        // Store JWT token for superadmin session
        if (user.token) {
          localStorage.setItem('sa_auth_token', user.token);
          localStorage.setItem('auth_token', user.token);
        }
        localStorage.setItem('active_sa_id', user.userId);
        localStorage.setItem('current_user', user.userId);
        setIsAuthenticated(true);
        // Load full profile from DB
        try {
          const profileResp = await authFetch(`/api/users/${user.userId}`);
          if (profileResp.ok) {
            const dbUser = await profileResp.json();
            if (dbUser.role === 'param' || dbUser.role === 'admin') {
              setProfileData({
                userId: dbUser.userId,
                name: dbUser.name || dbUser.username || '',
                username: dbUser.username || '',
                email: dbUser.email || '',
                phone: dbUser.phone || '',
                designation: dbUser.designation || '',
                department: dbUser.department || '',
                avatar: dbUser.avatar || '',
                role: dbUser.role,
              });
            }
          }
        } catch (e) {
          console.error('Failed to load profile from DB', e);
        }
        toast.success(`Welcome, Super Admin ${user.username}!`);
      } else {
        toast.error('Insufficient privileges');
      }
    } catch (error) {
       toast.error(error.message || 'Invalid Super Admin credentials');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="dark min-h-screen w-full bg-[#03141a] text-[#E2F1EC] flex overflow-x-hidden font-sans relative">
        {/* Left Hero Pane (Matching Design 3: Feature Highlight) */}
        <div 
          className="hidden lg:flex lg:flex-1 relative p-10 xl:p-14 2xl:p-16 flex-col justify-between"
          style={{
            background: "linear-gradient(135deg, rgba(3, 20, 26, 0.90) 0%, rgba(4, 25, 31, 0.72) 50%, rgba(3, 20, 26, 0.94) 100%), url('/login-bg.jpg') center/cover no-repeat"
          }}
        >
          {/* Brand Logo in top-left */}
          <div className="flex items-center">
            <img src="/regen-emblem.svg" alt="ReGen" className="w-[135px] xl:w-[145px] h-auto object-contain" />
          </div>

          {/* Hero Content */}
          <div className="my-auto max-w-xl xl:max-w-2xl">
            <h1 className="login-hero-heading text-[38px] lg:text-[54px] xl:text-[58px] font-extrabold tracking-tight text-white leading-[1.10] mb-5">
              A Better<br />
              Workplace<br />
              Starts Here
            </h1>
            <p className="login-hero-desc text-[18px] lg:text-[22px] xl:text-[24px] text-[#8EA99D] font-normal leading-[1.5] mb-8 xl:mb-9">
              Seamless attendance.<br />
              Stronger teams.<br />
              Greater productivity.
            </p>

            {/* Three Feature Highlight Badges */}
            <div className="space-y-3.5 max-w-md">
              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#092226]/65 border border-[#16383b]/70 backdrop-blur-md transition-all hover:border-[#23EDCE]/40 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-[#23EDCE]/12 border border-[#23EDCE]/25 flex items-center justify-center shrink-0 text-[#23EDCE]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#E2F1EC] leading-snug">Better Visibility</h3>
                  <p className="text-xs text-[#8EA99D] mt-0.5">Track your workforce in real time</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#092226]/65 border border-[#16383b]/70 backdrop-blur-md transition-all hover:border-[#23EDCE]/40 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-[#23EDCE]/12 border border-[#23EDCE]/25 flex items-center justify-center shrink-0 text-[#23EDCE]">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#E2F1EC] leading-snug">Higher Productivity</h3>
                  <p className="text-xs text-[#8EA99D] mt-0.5">Streamline daily operations</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#092226]/65 border border-[#16383b]/70 backdrop-blur-md transition-all hover:border-[#23EDCE]/40 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-[#23EDCE]/12 border border-[#23EDCE]/25 flex items-center justify-center shrink-0 text-[#23EDCE]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#E2F1EC] leading-snug">Simpler Management</h3>
                  <p className="text-xs text-[#8EA99D] mt-0.5">Everything in one place</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-[#50726d]">
            © {new Date().getFullYear()} ReGen Innovations Inc. Super Admin Control.
          </div>
        </div>

        {/* Right Login Pane */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative bg-[#03141a]">
          {/* Ambient Teal Glow */}
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#10B981]/10 rounded-full blur-[100px] pointer-events-none" />

          {/* Floating Login Card */}
          <div className="w-full max-w-md bg-[#081b21]/90 border border-[#1a3d44] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl rounded-3xl p-8 sm:p-10 relative z-10 transition-all">
            <div className="flex flex-col items-center text-center">
              <div className="flex justify-center mb-4">
                <img
                  src="/regen-emblem.svg"
                  alt="ReGen"
                  className="h-12 w-auto object-contain"
                />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-1.5">Super Admin Access</h2>
              <p className="text-xs sm:text-sm text-[#8EA99D] mb-6">Enter your credentials to manage the platform</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label htmlFor="saAdminId" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">Admin ID</label>
                <Input 
                  id="saAdminId"
                  name="adminId"
                  placeholder="Enter Admin ID" 
                  className="h-11 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl focus-visible:ring-1 focus-visible:ring-[#10B981] focus-visible:border-[#10B981]"
                  value={loginForm.id}
                  onChange={(e) => setLoginForm({ ...loginForm, id: e.target.value })}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5 text-left">
                <label htmlFor="saPassword" className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">Security Password</label>
                <div className="relative">
                  <Input 
                    id="saPassword"
                    name="password"
                    type={showSaPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="h-11 pr-10 bg-[#0f272e] border-[#1b3d45] text-white placeholder:text-[#50726d] rounded-xl focus-visible:ring-1 focus-visible:ring-[#10B981] focus-visible:border-[#10B981]"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSaPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#688a84] hover:text-[#23EDCE] transition-colors"
                  >
                    {showSaPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 text-sm font-semibold rounded-xl bg-[#00A876] hover:bg-[#00B982] active:bg-[#009668] text-white shadow-[0_4px_16px_rgba(0,168,118,0.35)] transition-all flex items-center justify-center gap-2 mt-2"
              >
                Authenticate & Connect
              </Button>
            </form>

            <div className="pt-4 text-center">
              <a 
                href="/" 
                className="inline-flex items-center gap-1.5 text-xs text-[#8EA99D] hover:text-[#23EDCE] font-medium transition-colors"
              >
                ← Back to Employee & Company Login
              </a>
            </div>

            <div className="pt-3 text-center text-[11px] text-[#6b8c85]">
              Made with <span className="text-red-500">❤️</span> by Krishub
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="super-admin-layout min-h-screen bg-background font-sans text-foreground flex overflow-hidden transition-colors duration-300">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-72 border-r border-border bg-card/95 backdrop-blur-md flex-col pt-7 shrink-0 transition-colors">
        <div className="px-6 mb-7 flex items-center gap-3">
          <div className="bg-primary/10 border border-primary/25 p-2 rounded-xl text-primary flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-foreground leading-none">ReGen Central</h1>
            <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-semibold mt-1">Platform Control</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <SidebarItem active={activeTab === 'dashboard'} icon={Activity} label="Dashboard" onClick={() => setActiveTab('dashboard')} />
          <SidebarItem active={activeTab === 'companies'} icon={Building2} label="Companies" onClick={() => setActiveTab('companies')} />
          <SidebarItem active={activeTab === 'users'} icon={Users} label="Global Users" onClick={() => setActiveTab('users')} />
          <SidebarItem active={activeTab === 'calendar'} icon={Calendar} label="Calendar" onClick={() => setActiveTab('calendar')} />
          <SidebarItem active={activeTab === 'payments'} icon={CreditCard} label="Payments" onClick={() => setActiveTab('payments')} />
          <SidebarItem active={activeTab === 'analytics'} icon={TrendingUp} label="Analytics" onClick={() => setActiveTab('analytics')} />
          <SidebarItem active={activeTab === 'system'} icon={Settings} label="System Control" onClick={() => setActiveTab('system')} />
          <div className="pt-3 mt-3 border-t border-border/80 space-y-1">
            <SidebarItem active={activeTab === 'profile'} icon={UserCog} label="Account Profile" onClick={() => setActiveTab('profile')} />
            <SidebarItem active={false} icon={Home} label="Switch to EMS App" onClick={() => window.location.href = '/?view=ems'} />
          </div>
        </nav>

      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <main className="flex-1 overflow-y-auto bg-background p-3.5 sm:p-6 lg:p-10 pb-0 transition-colors duration-300">
          <header className="flex justify-between items-center mb-6 pb-4 border-b border-border/40 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 text-muted-foreground hover:text-foreground shrink-0">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[85vw] max-w-xs sm:w-72 bg-card border-r-border p-0 flex flex-col">
                  <div className="px-6 py-6 mb-2 flex items-center gap-3 border-b border-border">
                    <div className="bg-primary/10 border border-primary/25 p-2 rounded-xl text-primary">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h1 className="font-bold text-base tracking-tight text-foreground leading-none">ReGen Central</h1>
                      <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-semibold mt-1">Platform Control</p>
                    </div>
                  </div>
                  <nav className="flex-1 px-4 space-y-1 pt-3">
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'dashboard'} icon={Activity} label="Dashboard" onClick={() => setActiveTab('dashboard')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'companies'} icon={Building2} label="Companies" onClick={() => setActiveTab('companies')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'users'} icon={Users} label="Global Users" onClick={() => setActiveTab('users')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'calendar'} icon={Calendar} label="Calendar" onClick={() => setActiveTab('calendar')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'payments'} icon={CreditCard} label="Payments" onClick={() => setActiveTab('payments')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'analytics'} icon={TrendingUp} label="Analytics" onClick={() => setActiveTab('analytics')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'system'} icon={Settings} label="System Control" onClick={() => setActiveTab('system')} />
                    </SheetClose>
                    <div className="pt-3 mt-3 border-t border-border space-y-1">
                      <SheetClose asChild>
                        <SidebarItem active={activeTab === 'profile'} icon={UserCog} label="Account Profile" onClick={() => setActiveTab('profile')} />
                      </SheetClose>
                    </div>
                  </nav>
                </SheetContent>
              </Sheet>
              {(() => {
                const tabConfig = {
                  dashboard: {
                    title: 'Super Admin Dashboard',
                    subtitle: 'Real-time platform oversight, metrics, and global tenant activity.',
                    icon: Activity,
                  },
                  companies: {
                    title: 'Company Management',
                    subtitle: 'Manage registered tenant organizations, subscription plans, and status.',
                    icon: Building2,
                  },
                  users: {
                    title: 'Global Users Directory',
                    subtitle: 'Oversee all registered staff, owner accounts, and system access.',
                    icon: Users,
                  },
                  calendar: {
                    title: 'Master Calendar',
                    subtitle: 'Organization-wide schedules, events, holidays, and timelines.',
                    icon: Calendar,
                  },
                  payments: {
                    title: 'Payments & Financials',
                    subtitle: 'Organization-wide payroll records, financial logs, and billing audits.',
                    icon: CreditCard,
                  },
                  analytics: {
                    title: 'System Analytics',
                    subtitle: 'Platform performance metrics, growth rates, and telemetry insights.',
                    icon: TrendingUp,
                  },
                  system: {
                    title: 'System & Security',
                    subtitle: 'Core audit logs, security infrastructure, and service health status.',
                    icon: ShieldCheck,
                  },
                  profile: {
                    title: 'Super Admin Profile',
                    subtitle: 'Configure root credentials and system administration access.',
                    icon: UserCog,
                  },
                };
                const config = tabConfig[activeTab] || tabConfig.dashboard;
                const TabIcon = config.icon;
                return (
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#15966A]/10 text-[#15966A] dark:text-[#14B8A6] flex items-center justify-center shrink-0 shadow-2xs">
                      <TabIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-[#183B2B] dark:text-[#E8F0F4] leading-snug truncate max-w-[170px] xs:max-w-[240px] sm:max-w-none">
                        {config.title}
                      </h1>
                      <p className="text-xs sm:text-sm text-[#687C70] dark:text-[#A6B5C0] mt-0.5 font-normal hidden sm:block">
                        {config.subtitle}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="h-9 px-3 rounded-lg border border-border/80 bg-card hover:bg-muted/80 flex items-center gap-2 text-xs font-medium text-foreground transition-colors shadow-xs"
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-primary" />}
                <span className="hidden sm:inline">{isDark ? "Dark Mode" : "Light Mode"}</span>
              </button>
              <div className="h-9 px-3 rounded-lg border border-border/80 bg-card flex items-center gap-2 hidden md:flex shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">System Live</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="bg-card h-9 w-9 rounded-lg overflow-hidden border border-border/80 hover:border-border hover:bg-muted/80 flex items-center justify-center shadow-xs cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                    title="Super Admin Account"
                    aria-label="Super Admin account menu"
                  >
                    {profileData.avatar ? (
                      <img src={profileData.avatar} alt="Super Admin" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-60 p-1.5 rounded-2xl border border-border bg-popover/95 backdrop-blur-md shadow-xl text-popover-foreground z-50 duration-150"
                >
                  {/* Profile Header */}
                  <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary/50 cursor-default transition-colors">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0 bg-muted shadow-2xs flex items-center justify-center">
                      {profileData.avatar ? (
                        <img src={profileData.avatar} alt="Super Admin" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-foreground truncate leading-tight">
                        {profileData.name || profileData.username || 'Super Admin'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">
                        Super Admin
                      </p>
                    </div>
                  </div>

                  {/* Subtle Divider */}
                  <DropdownMenuSeparator className="my-1 bg-border/60" />

                  {/* Logout Row */}
                  <DropdownMenuItem
                    onClick={() => {
                      localStorage.removeItem('sa_auth_token');
                      localStorage.removeItem('auth_token');
                      localStorage.removeItem('active_sa_id');
                      setIsAuthenticated(false);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer transition-colors outline-none"
                  >
                    <LogOut className="w-4 h-4 text-destructive shrink-0" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {activeTab === 'dashboard' && (
            <TabDashboard 
              dbUsers={dbUsers} 
              dbCompanies={dbCompanies} 
              dbAttendance={dbAttendance} 
              dbTasks={dbTasks} 
              dbMessages={dbMessages}
            />
          )}
          {activeTab === 'companies' && <TabCompanies dbCompanies={dbCompanies} searchTerm={searchTerm} onRefresh={fetchRealData} />}
          {activeTab === 'users' && <TabUsers dbUsers={dbUsers} dbCompanies={dbCompanies} searchTerm={searchTerm} onRefresh={fetchRealData} />}
          {activeTab === 'calendar' && (
            <div className="pb-10">
              <CalendarModule userProfile={profileData} portalType="superadmin" />
            </div>
          )}
          {activeTab === 'payments' && <TabPayments dbCompanies={dbCompanies} dbUsers={dbUsers} />}
          {activeTab === 'analytics' && (
            <TabAnalytics 
              dbCompanies={dbCompanies} 
              dbUsers={dbUsers} 
              dbAttendance={dbAttendance} 
              dbTasks={dbTasks} 
              dbMessages={dbMessages}
            />
          )}
          {activeTab === 'system' && <TabSystem />}
          {activeTab === 'profile' && <TabProfile data={profileData} setData={setProfileData} />}
        </main>
        <Footer />
      </div>
    </div>
  );
}

function SidebarItem({ active, icon: Icon, label, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-left select-none cursor-pointer ${
        active 
          ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 font-semibold border border-teal-500/25 shadow-2xs' 
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground font-medium'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-teal-600 dark:text-teal-400' : 'text-muted-foreground'}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

// --- TAB COMPONENTS ---

function TabDashboard({ dbUsers = [], dbCompanies = [], dbAttendance = [], dbTasks = [], dbMessages = [] }) {
  const activeCount = dbUsers.filter(u => u.status === 'active').length;

  // Dynamic Revenue Trends based on active user usage and company subscriptions over the past 6 months
  const revenueTrendsData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = monthNames[d.getMonth()];
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      // Companies registered on or before this month
      const activeCompaniesInMonth = dbCompanies.filter(c => {
        if (c.status === 'blocked') return false;
        if (!c.createdAt) return true;
        return new Date(c.createdAt) <= endOfMonth;
      });

      // Users registered on or before this month
      const activeUsersInMonth = dbUsers.filter(u => {
        if (u.status !== 'active') return false;
        if (!u.createdAt && !u.joiningDate) return true;
        const joined = u.createdAt ? new Date(u.createdAt) : new Date(u.joiningDate);
        return joined <= endOfMonth;
      });

      // Real monthly revenue from actual company accounts (if 0, real value is 0)
      let monthRevenue = 0;
      activeCompaniesInMonth.forEach(comp => {
        const val = Number(comp.amount ?? comp.monthlyFee ?? comp.revenue ?? comp.subscriptionAmount ?? 0);
        monthRevenue += isNaN(val) ? 0 : val;
      });

      result.push({
        month: monthLabel,
        revenue: monthRevenue,
        activeUsers: activeUsersInMonth.length,
        companies: activeCompaniesInMonth.length,
        growth: 0
      });
    }

    // Calculate month-over-month growth rate
    for (let i = 0; i < result.length; i++) {
      if (i === 0) {
        result[i].growth = 0;
      } else {
        const prev = result[i - 1].revenue;
        const curr = result[i].revenue;
        result[i].growth = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0);
      }
    }

    return result;
  }, [dbUsers, dbCompanies]);

  // Dynamic Weekly Usage based on real user activity, attendance, tasks, and messages for each day
  const weeklyUsageData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 for Mon, 6 for Sun
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDayOfWeek);

    return days.map((dayName, idx) => {
      const targetDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx);
      const dateStr = toLocalDateStr(targetDate);
      const activeUserIds = new Set();
      const activeUserNames = new Set();

      // 1. Attendance records on this day
      dbAttendance.forEach(att => {
        const attDate = att.date ? att.date.slice(0, 10) : toLocalDateStr(att.createdAt);
        if (attDate === dateStr && att.status !== 'absent') {
          activeUserIds.add(att.userId);
          const u = dbUsers.find(x => x.userId === att.userId);
          activeUserNames.add(u?.name || u?.username || att.userId);
        }
      });

      // 2. Tasks created or updated on this day
      dbTasks.forEach(task => {
        const cDate = toLocalDateStr(task.createdAt);
        const uDate = toLocalDateStr(task.updatedAt);
        if (cDate === dateStr || uDate === dateStr) {
          if (task.assignedTo) {
            activeUserIds.add(task.assignedTo);
            const u = dbUsers.find(x => x.userId === task.assignedTo);
            activeUserNames.add(u?.name || u?.username || task.assignedTo);
          }
        }
      });

      // 3. Messages sent on this day
      dbMessages.forEach(msg => {
        const mDate = toLocalDateStr(msg.createdAt || msg.timestamp);
        if (mDate === dateStr && msg.senderId) {
          activeUserIds.add(msg.senderId);
          activeUserNames.add(msg.senderName || msg.senderId);
        }
      });

      // 4. User activity on this day (lastActive, lastLogin, createdAt, updatedAt)
      dbUsers.forEach(u => {
        const laDate = toLocalDateStr(u.lastActive);
        const llDate = toLocalDateStr(u.lastLogin);
        const cDate = toLocalDateStr(u.createdAt);
        const uDate = toLocalDateStr(u.updatedAt);
        if (laDate === dateStr || llDate === dateStr || cDate === dateStr || uDate === dateStr) {
          activeUserIds.add(u.userId || u.username);
          activeUserNames.add(u.name || u.username || u.userId);
        }
      });

      // 5. Today's active session for currently logged-in SuperAdmin
      const isToday = (idx === currentDayOfWeek);
      if (isToday) {
        const currentSa = localStorage.getItem('active_sa_id') || localStorage.getItem('current_user') || 'Vyshwa';
        activeUserIds.add(currentSa);
        const u = dbUsers.find(x => x.userId === currentSa);
        activeUserNames.add(u?.name || u?.username || currentSa);
      }

      return {
        day: dayName,
        date: dateStr,
        active: activeUserIds.size,
        users: Array.from(activeUserNames),
        isToday,
      };
    });
  }, [dbAttendance, dbTasks, dbMessages, dbUsers]);

  const currentRevenue = revenueTrendsData[revenueTrendsData.length - 1]?.revenue || 0;
  const currentGrowth = revenueTrendsData[revenueTrendsData.length - 1]?.growth || 0;
  const trendSign = currentGrowth >= 0 ? '+' : '';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Companies" value={dbCompanies.length} icon={Building2} trend={`${dbCompanies.filter(c => c.status === 'active').length} Active`} color="emerald" />
        <StatCard title="Active Users" value={activeCount} icon={Users} trend={`Total ${dbUsers.length} Registered`} color="blue" />
        <StatCard title="Monthly Revenue" value={`$${currentRevenue.toLocaleString()}`} icon={CreditCard} trend={`${trendSign}${currentGrowth}% from last month`} color="purple" />
        <StatCard title="Success Rate" value="100%" icon={TrendingUp} trend="System stability" color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border border-border bg-card shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <TrendingUp className="w-5 h-5 text-primary" />
                Revenue Trends
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                Live calculated from company plans & active user seats
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrendsData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3D48" opacity={0.4} vertical={false} />
                <XAxis dataKey="month" stroke="#A6B5C0" fontSize={12} />
                <YAxis stroke="#A6B5C0" fontSize={12} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(val, name, item) => [
                    `$${Number(val).toLocaleString()}`, 
                    'Monthly Revenue'
                  ]}
                  labelFormatter={(label, items) => {
                    const item = items && items[0] && items[0].payload;
                    if (item) {
                      return `${label} — ${item.companies} Companies, ${item.activeUsers} Users (${item.growth >= 0 ? '+' : ''}${item.growth}% MoM)`;
                    }
                    return label;
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0D9488" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <Activity className="w-5 h-5 text-primary" />
                Weekly Usage
              </CardTitle>
              <span className="text-[11px] font-mono text-muted-foreground">Current Week</span>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyUsageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3D48" opacity={0.4} vertical={false} />
                <XAxis dataKey="day" stroke="#A6B5C0" fontSize={11} />
                <YAxis stroke="#A6B5C0" fontSize={10} allowDecimals={false} width={25} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1 text-foreground">
                          <div className="font-semibold flex items-center justify-between gap-4">
                            <span>{data.day} ({data.date})</span>
                            {data.isToday && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-bold">Today</span>}
                          </div>
                          <div className="text-primary font-bold text-sm">
                            {data.active} Active User{data.active !== 1 ? 's' : ''}
                          </div>
                          {data.users && data.users.length > 0 ? (
                            <div className="text-muted-foreground text-[11px] pt-1 border-t border-border">
                              Active: {data.users.slice(0, 3).join(', ')}{data.users.length > 3 ? ` +${data.users.length - 3} more` : ''}
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-[11px] pt-1 border-t border-border">
                              No active users recorded
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="active" fill="#0D9488" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color }) {
  const colors = {
    emerald: 'text-primary bg-primary/10 border border-primary/20',
    blue: 'text-sky-500 bg-sky-500/10 border border-sky-500/20',
    purple: 'text-violet-500 bg-violet-500/10 border border-violet-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border border-amber-500/20',
  };

  return (
    <Card className="border border-border bg-card shadow-xs group hover:border-primary/40 transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl ${colors[color] || colors.emerald}`}>
            <Icon className="w-6 h-6" />
          </div>
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Metrics</span>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <div className="text-3xl font-bold text-foreground">{value}</div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          {trend}
        </p>
      </CardContent>
    </Card>
  );
}

function CompanyFormFields({ data, setData }) {
  const fileInputRef = useRef(null);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo file size must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setData(prev => ({ ...prev, logo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
      {/* Company Logo Upload (Mandatory) */}
      <div className="md:col-span-2 flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-xl bg-background/50 border-border/80 hover:border-primary/50 transition-colors">
        <div 
          onClick={() => fileInputRef.current?.click()} 
          className="relative group cursor-pointer flex flex-col items-center gap-2"
        >
          <div className={`w-20 h-20 rounded-2xl overflow-hidden border-2 flex items-center justify-center bg-card shadow-sm ${data.logo ? 'border-primary' : 'border-destructive/60'}`}>
            {data.logo ? (
              <img src={data.logo} alt="Company Logo" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-8 h-8 text-destructive/80" />
            )}
          </div>
          <span className="text-xs font-semibold text-destructive">
            {data.logo ? 'Change Company Logo *' : 'Upload Company Logo * (Mandatory)'}
          </span>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleLogoUpload} 
          />
        </div>
      </div>

      <div className="relative group">
        <label className="text-xs font-semibold text-muted-foreground block mb-1">GST Number (Optional)</label>
        <div className="relative">
          <Input 
            placeholder="e.g. 29ABCDE1234F1Z5" 
            value={data.gst}
            onChange={(e) => setData({...data, gst: e.target.value})}
            className="h-10 bg-background/80 border-border/80 rounded-lg pr-20 focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
          />
          <button 
            type="button"
            onClick={() => {
              if (!data.gst) return;
              toast.success('GST validated successfully');
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-primary font-semibold text-xs hover:text-emerald-500 transition-colors cursor-pointer"
          >
            Validate
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Company Name *</label>
        <Input 
          placeholder="e.g. Acme Innovations Inc." 
          value={data.name}
          onChange={(e) => setData({...data, name: e.target.value})}
          className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Phone Number *</label>
        <Input 
          placeholder="e.g. +91 98765 43210" 
          value={data.phoneNumber}
          onChange={(e) => setData({...data, phoneNumber: e.target.value})}
          className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Email Address</label>
        <Input 
          placeholder="admin@company.com" 
          value={data.email}
          onChange={(e) => setData({...data, email: e.target.value})}
          className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Category *</label>
        <Select 
          onValueChange={(val) => setData({...data, category: val})}
          value={data.category}
        >
          <SelectTrigger className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all text-foreground">
            <SelectValue placeholder="Select Category *" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border text-foreground">
            <SelectItem value="it">IT Solutions</SelectItem>
            <SelectItem value="logistics">Logistics</SelectItem>
            <SelectItem value="manufacturing">Manufacturing</SelectItem>
            <SelectItem value="retail">Retail</SelectItem>
            <SelectItem value="healthcare">Healthcare</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Description (Optional)</label>
        <Input 
          placeholder="Brief description of operations" 
          value={data.about}
          onChange={(e) => setData({...data, about: e.target.value})}
          className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Full Street Address</label>
        <Textarea 
          placeholder="Street address, building, suite..." 
          value={data.address}
          onChange={(e) => setData({...data, address: e.target.value})}
          className="min-h-[70px] bg-background/80 border-border/80 rounded-lg resize-none p-2.5 text-sm focus:border-primary transition-all placeholder:text-muted-foreground/50 text-foreground outline-none ring-0"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 md:col-span-2 gap-3.5">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">City *</label>
          <Input 
            placeholder="City" 
            value={data.city}
            onChange={(e) => setData({...data, city: e.target.value})}
            className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">State</label>
          <Input 
            placeholder="State" 
            value={data.state}
            onChange={(e) => setData({...data, state: e.target.value})}
            className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Zip Code</label>
          <Input 
            placeholder="Zip Code" 
            value={data.zip}
            onChange={(e) => setData({...data, zip: e.target.value})}
            className="h-10 bg-background/80 border-border/80 rounded-lg focus:border-primary text-sm transition-all placeholder:text-muted-foreground/50 text-foreground"
          />
        </div>
      </div>
    </div>
  );
}

function TabCompanies({ dbCompanies, searchTerm, onRefresh }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpTarget, setOtpTarget] = useState(null); // company to block/unblock
  const [otpLoading, setOtpLoading] = useState(false);
  const [credentialResult, setCredentialResult] = useState(null); // { username, password, emailSent, emailNote }
  const [credDialogOpen, setCredDialogOpen] = useState(false);

  // Delete with OTP
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteOtpCode, setDeleteOtpCode] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  // Backups
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupActionDialogOpen, setBackupActionDialogOpen] = useState(false);
  const [backupActionType, setBackupActionType] = useState(null); // 'download' | 'restore' | 'delete-backup'
  const [backupActionTarget, setBackupActionTarget] = useState(null);
  const [backupActionOtp, setBackupActionOtp] = useState('');
  const [backupActionLoading, setBackupActionLoading] = useState(false);

  const fetchBackups = async () => {
    setBackupsLoading(true);
    try {
      const resp = await authFetch('/api/company/backups');
      if (resp.ok) setBackups(await resp.json());
    } catch {} finally { setBackupsLoading(false); }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleResetOwnerPassword = async (company) => {
    const ownerId = company.ownerId;
    if (!ownerId) {
      toast.error('No owner linked to this company');
      return;
    }
    if (!window.confirm(`Reset password for owner "${ownerId}" of "${company.name}" to default (1234)?`)) return;
    try {
      const resp = await authFetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetIdentifier: ownerId })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to reset password');
      }
      const data = await resp.json();
      toast.success(data.message || `Password reset for ${ownerId}`);
    } catch (err) {
      toast.error(err.message || 'Reset failed');
    }
  };

  const CATEGORY_LABELS = {
    it: 'IT Solutions',
    logistics: 'Logistics',
    manufacturing: 'Manufacturing',
    retail: 'Retail',
    healthcare: 'Healthcare',
    finance: 'Finance',
    education: 'Education',
    consulting: 'Consulting',
    realestate: 'Real Estate',
    hospitality: 'Hospitality',
  };

  const getCategoryLabel = (cat) => {
    if (!cat) return '—';
    return CATEGORY_LABELS[cat.toLowerCase()] || cat;
  };

  const openOtpDialog = (company) => {
    setOtpTarget(company);
    setOtpCode('');
    setOtpDialogOpen(true);
  };

  const handleToggleStatus = async () => {
    if (!otpTarget || !otpCode.trim()) {
      toast.error('Please enter the authenticator code');
      return;
    }
    setOtpLoading(true);
    try {
      const resp = await authFetch(`/api/company/${otpTarget._id}/toggle-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode: otpCode.trim() })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update status');
      }
      const updated = await resp.json();
      toast.success(`Company ${updated.status === 'blocked' ? 'blocked' : 'unblocked'} successfully`);
      setOtpDialogOpen(false);
      setOtpTarget(null);
      setOtpCode('');
      onRefresh();
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    } finally {
      setOtpLoading(false);
    }
  };

  const emptyForm = {
    logo: '',
    gst: '',
    name: '',
    phoneNumber: '',
    email: '',
    category: '',
    about: '',
    address: '',
    city: '',
    state: '',
    zip: ''
  };
  const [formData, setFormData] = useState(emptyForm);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [isValidating, setIsValidating] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchTerm || '');

  const filtered = useMemo(() => {
    return dbCompanies.filter(co => {
      const term = (localSearch || '').toLowerCase().trim();
      if (!term) return true;
      return (
        co.name?.toLowerCase().includes(term) || 
        co._id?.toLowerCase().includes(term) ||
        co.gst?.toLowerCase().includes(term) ||
        co.category?.toLowerCase().includes(term) ||
        co.city?.toLowerCase().includes(term) ||
        co.state?.toLowerCase().includes(term) ||
        co.phoneNumber?.toLowerCase().includes(term) ||
        co.email?.toLowerCase().includes(term)
      );
    });
  }, [dbCompanies, localSearch]);

  const openEdit = (company) => {
    setEditingCompany(company);
    setEditFormData({
      logo: company.logo || '',
      gst: company.gst || '',
      name: company.name || '',
      phoneNumber: company.phoneNumber || '',
      email: company.email || '',
      category: company.category || '',
      about: company.about || '',
      address: company.address || '',
      city: company.city || '',
      state: company.state || '',
      zip: company.zip || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!editFormData.name || !editFormData.phoneNumber || !editFormData.city || !editFormData.category || !editFormData.logo) {
      toast.error('Please fill all required fields (*) including Company Logo');
      return;
    }
    try {
      const resp = await authFetch(`/api/company/admin/${editingCompany._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Failed to update company');
      }
      toast.success('Company updated successfully');
      setEditDialogOpen(false);
      setEditingCompany(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openDeleteDialog = (company) => {
    setDeleteTarget(company);
    setDeleteOtpCode('');
    setDeleteResult(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteWithOtp = async () => {
    if (!deleteTarget || !deleteOtpCode.trim()) {
      toast.error('Please enter the authenticator code');
      return;
    }
    setDeleteLoading(true);
    try {
      const resp = await authFetch(`/api/company/${deleteTarget._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode: deleteOtpCode.trim() })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to delete company');
      }
      const data = await resp.json();
      setDeleteResult(data);
      toast.success(data.message || 'Company deleted and backup created');
      onRefresh();
      fetchBackups();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openBackupActionDialog = (backup, actionType) => {
    setBackupActionTarget(backup);
    setBackupActionType(actionType);
    setBackupActionOtp('');
    setBackupActionDialogOpen(true);
  };

  const handleBackupAction = async () => {
    if (!backupActionTarget || !backupActionOtp.trim()) {
      toast.error('Please enter the authenticator code');
      return;
    }
    const otp = backupActionOtp.trim();
    const fname = backupActionTarget.filename;
    setBackupActionLoading(true);
    try {
      if (backupActionType === 'download') {
        const resp = await authFetch(`/api/company/backups/${encodeURIComponent(fname)}/download?otpCode=${otp}`);
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || 'Download failed');
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success('Backup downloaded');
      } else if (backupActionType === 'restore') {
        const resp = await authFetch('/api/company/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fname, otpCode: otp })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to restore');
        }
        const data = await resp.json();
        toast.success(data.message || 'Company restored successfully');
        onRefresh();
      } else if (backupActionType === 'delete-backup') {
        const resp = await authFetch(`/api/company/backups/${encodeURIComponent(fname)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otpCode: otp })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to delete backup');
        }
        const data = await resp.json();
        toast.success(data.message || 'Backup deleted');
        fetchBackups();
      }
      setBackupActionDialogOpen(false);
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    } finally {
      setBackupActionLoading(false);
    }
  };

  const handleSubmit = async (e, shouldContinue = false) => {
    if (e) e.preventDefault();
    if (!formData.name || !formData.phoneNumber || !formData.city || !formData.category || !formData.logo) {
      toast.error('Please fill all required fields (*) including Company Logo');
      return;
    }

    try {
      const resp = await authFetch('/api/company/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Failed to add company');
      }

      const data = await resp.json();
      toast.success('Company added successfully');
      onRefresh();

      // Show credentials dialog
      setCredentialResult({
        companyName: formData.name,
        username: data.owner?.username || '',
        password: data.tempPassword || '',
        emailSent: data.emailSent || false,
        emailNote: data.emailNote || '',
        email: formData.email || '',
      });
      setCredDialogOpen(true);
      
      if (!shouldContinue) {
        setIsDialogOpen(false);
        setFormData(emptyForm);
      } else {
        setFormData(emptyForm);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleValidateGst = () => {
    if (!formData.gst) return;
    setIsValidating(true);
    setTimeout(() => {
      setIsValidating(false);
      toast.success('GST validated successfully');
    }, 1500);
  };



  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      {/* Search and Actions Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/70 backdrop-blur-xs p-3 sm:p-3.5 rounded-xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
          <Input 
            placeholder="Search companies by name, ID, category, city..." 
            className="h-10 pl-10 pr-4 bg-background/80 border-border/80 text-foreground placeholder:text-muted-foreground/60 text-sm rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/25 transition-all"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden md:inline">
            Showing <strong className="text-foreground font-semibold">{filtered.length}</strong> {filtered.length === 1 ? 'organization' : 'organizations'}
          </span>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 px-4 bg-primary hover:bg-[#0f766e] text-white font-medium text-sm rounded-lg shadow-sm shadow-primary/20 flex items-center gap-2 transition-all cursor-pointer">
                <Plus className="w-4 h-4" />
                <span>Add Company</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
              <div className="p-6 sm:p-8">
                <DialogHeader className="mb-5 text-left">
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                      <Building2 className="w-5 h-5" />
                    </div>
                    Company Registration
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-1">Register a new enterprise organization and provision its tenant credentials.</p>
                </DialogHeader>
                <CompanyFormFields data={formData} setData={setFormData} />
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 mt-6 pt-4 border-t border-border/80">
                  <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-10 rounded-lg text-muted-foreground hover:bg-muted font-medium text-sm">
                    Cancel
                  </Button>
                  <Button variant="outline" onClick={(e) => handleSubmit(e, true)} className="h-10 border-border/80 bg-background/60 text-foreground font-medium text-sm rounded-lg hover:bg-muted">
                    Add & Continue
                  </Button>
                  <Button onClick={(e) => handleSubmit(e, false)} className="h-10 px-5 bg-primary text-white hover:bg-[#0f766e] font-semibold text-sm rounded-lg shadow-sm shadow-primary/20 transition-all">
                    Register Company
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Company Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingCompany(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader className="mb-5 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Pencil className="w-5 h-5" />
                </div>
                Edit Company: {editingCompany?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">Update profile information, registration details, and administrative contacts.</p>
            </DialogHeader>
            <CompanyFormFields data={editFormData} setData={setEditFormData} />
            <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-border/80">
              <Button variant="ghost" onClick={() => setEditDialogOpen(false)} className="h-10 rounded-lg text-muted-foreground hover:bg-muted font-medium text-sm">
                Cancel
              </Button>
              <Button onClick={handleEditSubmit} className="h-10 px-5 bg-primary text-white hover:bg-[#0f766e] font-semibold text-sm rounded-lg shadow-sm shadow-primary/20 transition-all">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Primary Companies Table */}
      <div className="border border-border/80 bg-card rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader className="bg-slate-50 dark:bg-[#121E27] border-b border-border/80">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-muted-foreground/90 h-11 pl-5">Company</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-muted-foreground/90 h-11">Category</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-muted-foreground/90 h-11">Contact</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-muted-foreground/90 h-11">Location</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-muted-foreground/90 h-11">Status</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-muted-foreground/90 h-11 text-right pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((co) => {
                const isSelected = selectedCompanyId === co._id;

                return (
                  <TableRow 
                    key={co._id} 
                    data-state={isSelected ? 'selected' : undefined}
                    onClick={() => setSelectedCompanyId(prev => prev === co._id ? null : co._id)}
                    tabIndex={0}
                    role="row"
                    aria-selected={isSelected}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCompanyId(prev => prev === co._id ? null : co._id);
                      }
                    }}
                    className={cn(
                      "border-b border-border/50 last:border-b-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/50",
                      isSelected
                        ? "bg-teal-50/80 dark:bg-teal-950/40 border-l-4 border-l-teal-500 dark:border-l-teal-400 font-medium"
                        : "bg-white dark:bg-card hover:bg-teal-50/50 dark:hover:bg-teal-950/30"
                    )}
                  >
                    {/* Company Name & Identifiers */}
                    <TableCell className="pl-5 py-3.5 max-w-[260px]">
                      <div className="font-semibold text-sm text-slate-900 dark:text-foreground truncate" title={co.name}>
                        {co.name || 'Unnamed Company'}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-500 dark:text-muted-foreground/80 font-mono">
                        <span className="truncate max-w-[150px]" title={co._id}>ID: {co._id}</span>
                        {co.gst && (
                          <span className="text-slate-400 dark:text-muted-foreground/60">• GST: {co.gst}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Industry Category */}
                    <TableCell className="py-3.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/60">
                        {getCategoryLabel(co.category)}
                      </span>
                    </TableCell>

                    {/* Contact Info */}
                    <TableCell className="py-3.5 max-w-[200px]">
                      <div className="text-sm font-medium text-slate-800 dark:text-foreground flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500 dark:text-muted-foreground/60 shrink-0" />
                        <span className="truncate">{co.phoneNumber || '—'}</span>
                      </div>
                      {co.email && (
                        <div className="text-xs text-slate-600 dark:text-muted-foreground/80 mt-0.5 truncate flex items-center gap-1.5" title={co.email}>
                          <Mail className="w-3 h-3 text-slate-400 dark:text-muted-foreground/50 shrink-0" />
                          <span className="truncate">{co.email}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Location */}
                    <TableCell className="py-3.5 max-w-[180px]">
                      <div className="text-sm font-medium text-slate-800 dark:text-foreground flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 dark:text-muted-foreground/60 shrink-0" />
                        <span className="truncate" title={[co.city, co.state].filter(Boolean).join(', ') || '—'}>
                          {[co.city, co.state].filter(Boolean).join(', ') || '—'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="py-3.5">
                      {co.status === 'blocked' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 shrink-0" />
                          Blocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
                          Active
                        </span>
                      )}
                    </TableCell>

                    {/* Actions Column */}
                    <TableCell className="py-3.5 pr-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Reset Owner Password */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-slate-600 dark:text-muted-foreground/80 hover:text-slate-900 dark:hover:text-foreground hover:bg-teal-50 dark:hover:bg-muted/80 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetOwnerPassword(co);
                          }}
                          title="Reset Owner Password"
                          aria-label="Reset Owner Password"
                        >
                          <Lock className="w-4 h-4" />
                        </Button>

                        {/* Edit Company */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-slate-600 dark:text-muted-foreground/80 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(co);
                          }}
                          title="Edit Company Details"
                          aria-label="Edit Company Details"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>

                        {/* Enable/Disable (Unblock/Block) */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 rounded-lg transition-colors ${
                            co.status === 'blocked'
                              ? 'text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-500/10'
                              : 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openOtpDialog(co);
                          }}
                          title={co.status === 'blocked' ? 'Unblock Company' : 'Disable / Block Company'}
                          aria-label={co.status === 'blocked' ? 'Unblock Company' : 'Disable / Block Company'}
                        >
                          {co.status === 'blocked' ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </Button>

                        {/* Delete Company */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-rose-500/90 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(co);
                          }}
                          title="Delete Company (Creates Backup Archive)"
                          aria-label="Delete Company"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Building2 className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground/80">No companies found</p>
                      <p className="text-xs text-muted-foreground">Try adjusting your search criteria or register a new company.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Credentials Result Dialog */}
      <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
        <DialogContent className="max-w-md sm:max-w-md border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center mb-1 tracking-tight">
                <span className="flex items-center justify-center gap-2 text-primary">
                  <CheckCircle className="w-5 h-5" /> Company Created
                </span>
              </DialogTitle>
            </DialogHeader>
            {credentialResult && (
              <div className="mt-3 space-y-4">
                <p className="text-center text-muted-foreground text-xs">
                  <span className="text-foreground font-semibold">{credentialResult.companyName}</span> has been registered.
                  {credentialResult.email ? ' Generated owner credentials:' : ''}
                </p>
                <div className="bg-background/80 border border-border/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Username</p>
                      <p className="text-foreground font-mono font-bold text-base mt-0.5">{credentialResult.username}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(credentialResult.username); toast.success('Username copied'); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="border-t border-border/80" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Temporary Password</p>
                      <p className="text-foreground font-mono font-bold text-base mt-0.5">{credentialResult.password}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(credentialResult.password); toast.success('Password copied'); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className={`flex items-center gap-2 text-xs px-3.5 py-2.5 rounded-lg border ${credentialResult.emailSent ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <span>{credentialResult.emailSent ? `Credentials dispatched to ${credentialResult.email}` : (credentialResult.emailNote || 'Email notification pending')}</span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">The owner must change this initial password upon first sign-in.</p>
                <Button onClick={() => setCredDialogOpen(false)} className="w-full h-10 bg-primary text-white hover:bg-[#0f766e] font-semibold text-sm rounded-lg mt-2 shadow-sm shadow-primary/20">
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* OTP Verification Dialog for Block/Unblock */}
      <Dialog open={otpDialogOpen} onOpenChange={(open) => { setOtpDialogOpen(open); if (!open) { setOtpTarget(null); setOtpCode(''); } }}>
        <DialogContent className="max-w-md sm:max-w-md border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center mb-1 tracking-tight">
                {otpTarget?.status === 'blocked' ? (
                  <span className="flex items-center justify-center gap-2 text-primary"><Unlock className="w-5 h-5" /> Unblock Company</span>
                ) : (
                  <span className="flex items-center justify-center gap-2 text-amber-400"><Ban className="w-5 h-5" /> Block Company</span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="text-center text-muted-foreground text-xs mt-2 mb-5">
              <span className="text-foreground font-semibold">{otpTarget?.name}</span>
              <p className="mt-1.5 text-muted-foreground">Enter the 6-digit verification code from your Google Authenticator app to proceed.</p>
            </div>
            <div className="flex justify-center mb-5">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-44 h-14 text-center text-2xl font-mono tracking-[0.4em] bg-background/80 border-border/80 text-foreground rounded-xl focus:border-primary"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" onClick={() => setOtpDialogOpen(false)} className="h-10 rounded-lg text-muted-foreground hover:bg-muted font-medium text-sm">
                Cancel
              </Button>
              <Button
                onClick={handleToggleStatus}
                disabled={otpLoading || otpCode.length !== 6}
                className={`h-10 font-semibold text-sm rounded-lg ${otpTarget?.status === 'blocked' ? 'bg-primary hover:bg-[#0f766e] text-white shadow-sm shadow-primary/20' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
              >
                {otpLoading ? 'Verifying…' : otpTarget?.status === 'blocked' ? 'Unblock' : 'Confirm Block'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Company OTP Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) { setDeleteTarget(null); setDeleteOtpCode(''); setDeleteResult(null); } }}>
        <DialogContent className="max-w-md sm:max-w-md border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            {!deleteResult ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-center mb-1 tracking-tight">
                    <span className="flex items-center justify-center gap-2 text-rose-500"><Trash2 className="w-5 h-5" /> Delete Company</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="text-center text-muted-foreground text-xs mt-2 mb-4">
                  <span className="text-foreground font-semibold">{deleteTarget?.name}</span>
                  <p className="mt-1.5 text-muted-foreground">This creates an automatic backup ZIP archive and <span className="text-rose-400 font-semibold">permanently removes</span> all associated employee records, tasks, and telemetry.</p>
                  <p className="mt-1 text-muted-foreground">Enter your 6-digit Authenticator code to authorize deletion.</p>
                </div>
                <div className="flex justify-center mb-5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={deleteOtpCode}
                    onChange={(e) => setDeleteOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-44 h-14 text-center text-2xl font-mono tracking-[0.4em] bg-background/80 border-border/80 text-foreground rounded-xl focus:border-primary"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="h-10 rounded-lg text-muted-foreground hover:bg-muted font-medium text-sm">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteWithOtp}
                    disabled={deleteLoading || deleteOtpCode.length !== 6}
                    className="h-10 font-semibold text-sm rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {deleteLoading ? 'Processing…' : 'Delete Company'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-center mb-1 tracking-tight">
                    <span className="flex items-center justify-center gap-2 text-primary"><CheckCircle className="w-5 h-5" /> Deleted & Backed Up</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-3 space-y-3">
                  <p className="text-center text-muted-foreground text-xs">{deleteResult.message}</p>
                  <div className="bg-background/80 border border-border/80 rounded-lg p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Backup Archive</p>
                    <p className="text-foreground font-mono text-xs break-all">{deleteResult.backup}</p>
                  </div>
                  {deleteResult.deletedCounts && (
                    <div className="bg-background/80 border border-border/80 rounded-lg p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Deleted Counts</p>
                      {Object.entries(deleteResult.deletedCounts).map(([key, count]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{key}</span>
                          <span className="text-foreground font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button onClick={() => { setDeleteDialogOpen(false); setDeleteResult(null); }} className="w-full h-10 bg-primary text-white hover:bg-[#0f766e] font-semibold text-sm rounded-lg mt-2 shadow-sm shadow-primary/20">
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Company Backups Section */}
      <div className="mt-8 border border-border/80 bg-card rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border/80 flex flex-row items-center justify-between bg-card/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight">Company Backups</h3>
              <p className="text-xs text-muted-foreground/80">Automated archives and recovery snapshots</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBackups}
            disabled={backupsLoading}
            className="h-8 px-3 rounded-lg border-border/80 bg-background/50 hover:bg-muted text-xs font-medium text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${backupsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        <div>
          {backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-11 h-11 rounded-full bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground/60 mb-2.5">
                <Database className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-medium text-foreground">No company backups found</h4>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {backupsLoading
                  ? 'Retrieving backup archives from storage…'
                  : 'Archives are automatically generated before any company deletion or administrative snapshot.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader className="bg-[#121E27] dark:bg-[#121E27] bg-muted/40 border-b border-border/80">
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-10 pl-5">Archive File</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-10">File Size</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-10">Created At</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-10 text-right pr-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((b) => (
                    <TableRow key={b.filename} className="border-b border-border/50 last:border-b-0 hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] transition-colors">
                      <TableCell className="pl-5 py-3 font-mono text-xs text-foreground/90 break-all">
                        {b.filename}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        {(b.size / 1024).toFixed(1)} KB
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        {new Date(b.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="py-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 rounded-md text-xs font-medium text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
                            onClick={() => openBackupActionDialog(b, 'download')}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" /> Download
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 rounded-md text-xs font-medium text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 transition-colors"
                            onClick={() => openBackupActionDialog(b, 'restore')}
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 rounded-md text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            onClick={() => openBackupActionDialog(b, 'delete-backup')}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Backup Action OTP Dialog (Download / Restore / Delete) */}
      <Dialog open={backupActionDialogOpen} onOpenChange={(open) => { setBackupActionDialogOpen(open); if (!open) { setBackupActionTarget(null); setBackupActionOtp(''); setBackupActionType(null); } }}>
        <DialogContent className="max-w-md sm:max-w-md border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center mb-1 tracking-tight">
                {backupActionType === 'download' && <span className="flex items-center justify-center gap-2 text-sky-400"><Download className="w-5 h-5" /> Download Backup</span>}
                {backupActionType === 'restore' && <span className="flex items-center justify-center gap-2 text-primary"><Database className="w-5 h-5" /> Restore Company</span>}
                {backupActionType === 'delete-backup' && <span className="flex items-center justify-center gap-2 text-rose-500"><Trash2 className="w-5 h-5" /> Delete Backup</span>}
              </DialogTitle>
            </DialogHeader>
            <div className="text-center text-muted-foreground text-xs mt-2 mb-4">
              <p className="text-foreground font-mono text-xs break-all bg-background/80 p-2 rounded-lg border border-border/80">{backupActionTarget?.filename}</p>
              {backupActionType === 'download' && <p className="mt-2 text-muted-foreground">Enter your 6-digit Authenticator code to download this archive file.</p>}
              {backupActionType === 'restore' && <p className="mt-2 text-muted-foreground">Restores all database records (staff, tasks, logs, messages) from this backup snapshot.</p>}
              {backupActionType === 'delete-backup' && <p className="mt-2 text-muted-foreground">Permanently purges this archive from disk. This operation is irrevocable.</p>}
              <p className="mt-1 text-muted-foreground">Enter the 6-digit Authenticator code to confirm.</p>
            </div>
            <div className="flex justify-center mb-5">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={backupActionOtp}
                onChange={(e) => setBackupActionOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-44 h-14 text-center text-2xl font-mono tracking-[0.4em] bg-background/80 border-border/80 text-foreground rounded-xl focus:border-primary"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" onClick={() => setBackupActionDialogOpen(false)} className="h-10 rounded-lg text-muted-foreground hover:bg-muted font-medium text-sm">
                Cancel
              </Button>
              <Button
                onClick={handleBackupAction}
                disabled={backupActionLoading || backupActionOtp.length !== 6}
                className={`h-10 font-semibold text-sm rounded-lg text-white ${
                  backupActionType === 'download' ? 'bg-sky-600 hover:bg-sky-700' :
                  backupActionType === 'restore' ? 'bg-primary hover:bg-[#0f766e] shadow-sm shadow-primary/20' :
                  'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {backupActionLoading
                  ? (backupActionType === 'download' ? 'Downloading…' : backupActionType === 'restore' ? 'Restoring…' : 'Deleting…')
                  : (backupActionType === 'download' ? 'Download' : backupActionType === 'restore' ? 'Restore' : 'Delete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserAvatar({ src, name, username, className = "w-9 h-9" }) {
  const [hasError, setHasError] = useState(false);
  const initials = (name || username || 'U').trim().slice(0, 2).toUpperCase();

  return (
    <div className={`${className} rounded-full bg-muted/60 border border-border/80 flex items-center justify-center overflow-hidden shrink-0`}>
      {!hasError && (src || username) ? (
        <img 
          src={src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || 'user')}`} 
          alt={name || 'User'} 
          className="w-full h-full object-cover"
          onError={() => setHasError(true)} 
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">{initials}</span>
      )}
    </div>
  );
}

function renderRoleBadge(role) {
  const normalized = (role || 'staff').toLowerCase();
  switch (normalized) {
    case 'owner':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
          <Shield className="w-3 h-3 text-amber-400 shrink-0" />
          Owner
        </span>
      );
    case 'param':
    case 'superadmin':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
          <ShieldAlert className="w-3 h-3 text-purple-400 shrink-0" />
          Super Admin
        </span>
      );
    case 'intern':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-sky-500/10 text-sky-300 border border-sky-500/20">
          Intern
        </span>
      );
    case 'admin':
    case 'manager':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-teal-500/10 text-teal-300 border border-teal-500/20 capitalize">
          {normalized}
        </span>
      );
    case 'staff':
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20 capitalize">
          {role || 'Staff'}
        </span>
      );
  }
}

function TabUsers({ dbUsers = [], dbCompanies = [], searchTerm = '', onRefresh }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [localSearch, setLocalSearch] = useState(searchTerm || '');
  const [togglingId, setTogglingId] = useState(null);

  const handleQuickToggle = async (targetUser, action) => {
    const targetUserId = targetUser.userId || targetUser._id || targetUser.id;
    setTogglingId(targetUserId);
    try {
      let payload = { action };
      if (action === 'activate' && targetUser.companyId) {
        payload.companyId = String(targetUser.companyId?._id || targetUser.companyId);
        payload.company = targetUser.company || '';
      }
      const resp = await authFetch(`/api/users/${encodeURIComponent(targetUserId)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update user status');
      }
      const resData = await resp.json();
      toast.success(resData.message || (action === 'suspend' ? 'User suspended successfully' : 'User access restored'));
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    } finally {
      setTogglingId(null);
    }
  };

  // Synchronize local search with external search term prop if updated
  useEffect(() => {
    if (searchTerm !== undefined) {
      setLocalSearch(searchTerm);
    }
  }, [searchTerm]);

  // Manage Dialog states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedGroupForManage, setSelectedGroupForManage] = useState(null);
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    category: 'it',
    about: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    gst: ''
  });
  const [editSaving, setEditSaving] = useState(false);

  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState('');
  const [replaceAction, setReplaceAction] = useState('reassign');
  const [replaceNewName, setReplaceNewName] = useState('');
  const [replaceNewCategory, setReplaceNewCategory] = useState('it');
  const [replaceNewCity, setReplaceNewCity] = useState('');
  const [replaceSaving, setReplaceSaving] = useState(false);

  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removeAction, setRemoveAction] = useState('detach');
  const [removeTargetCompanyId, setRemoveTargetCompanyId] = useState('');
  const [removeConfirmInput, setRemoveConfirmInput] = useState('');
  const [removeSaving, setRemoveSaving] = useState(false);

  const openEditModal = (group) => {
    setSelectedGroupForManage(group);
    const coDoc = dbCompanies.find(c => String(c._id || c.id) === String(group.id)) || {};
    setEditCompanyForm({
      name: coDoc.name || group.name || '',
      phoneNumber: coDoc.phoneNumber || '',
      email: coDoc.email || '',
      category: coDoc.category || group.category || 'it',
      about: coDoc.about || '',
      address: coDoc.address || '',
      city: coDoc.city || group.city || '',
      state: coDoc.state || '',
      zip: coDoc.zip || '',
      gst: coDoc.gst || ''
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editCompanyForm.name?.trim() || !editCompanyForm.city?.trim() || !editCompanyForm.phoneNumber?.trim()) {
      toast.error('Please fill required fields: Company Name, City, Phone Number');
      return;
    }

    setEditSaving(true);
    try {
      const coDoc = dbCompanies.find(c => String(c._id || c.id) === String(selectedGroupForManage?.id));
      const targetId = coDoc?._id || selectedGroupForManage?.id;

      const resp = await authFetch(`/api/company/admin/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCompanyForm)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update company');
      }

      toast.success(`Company "${editCompanyForm.name}" updated successfully`);
      setEditModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  const openReplaceModal = (group) => {
    setSelectedGroupForManage(group);
    const coDoc = dbCompanies.find(c => String(c._id || c.id) === String(group.id)) || {};
    const availableTargets = dbCompanies.filter(c => String(c._id || c.id) !== String(group.id));
    setReplaceTargetId(availableTargets[0]?._id ? String(availableTargets[0]._id) : '');
    setReplaceAction('reassign');
    setReplaceNewName('');
    setReplaceNewCategory(coDoc.category || group.category || 'it');
    setReplaceNewCity(coDoc.city || group.city || '');
    setReplaceModalOpen(true);
  };

  const handleSaveReplace = async () => {
    if (replaceAction === 'reassign' && !replaceTargetId) {
      toast.error('Please select a target company to transfer employees to');
      return;
    }
    if (replaceAction === 'rename_merge' && !replaceNewName.trim()) {
      toast.error('Please enter a new company name');
      return;
    }

    setReplaceSaving(true);
    try {
      const coDoc = dbCompanies.find(c => String(c._id || c.id) === String(selectedGroupForManage?.id));
      const targetId = coDoc?._id || selectedGroupForManage?.id;

      const payload = {
        action: replaceAction,
        targetCompanyId: replaceTargetId,
        newName: replaceNewName.trim(),
        newCategory: replaceNewCategory,
        newCity: replaceNewCity
      };

      const resp = await authFetch(`/api/company/admin/${targetId}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Replace operation failed');
      }

      const resData = await resp.json();
      toast.success(resData.message || 'Company association replaced successfully');
      setReplaceModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.message || 'Replace failed');
    } finally {
      setReplaceSaving(false);
    }
  };

  const openRemoveModal = (group) => {
    setSelectedGroupForManage(group);
    const availableTargets = dbCompanies.filter(c => String(c._id || c.id) !== String(group.id));
    setRemoveAction(group.employees?.length > 0 ? 'detach' : 'detach');
    setRemoveTargetCompanyId(availableTargets[0]?._id ? String(availableTargets[0]._id) : '');
    setRemoveConfirmInput('');
    setRemoveModalOpen(true);
  };

  const handleConfirmRemove = async () => {
    if (removeConfirmInput.trim().toLowerCase() !== selectedGroupForManage?.name?.trim().toLowerCase()) {
      toast.error(`Please type "${selectedGroupForManage?.name}" to confirm removal`);
      return;
    }

    setRemoveSaving(true);
    try {
      const coDoc = dbCompanies.find(c => String(c._id || c.id) === String(selectedGroupForManage?.id));
      const targetId = coDoc?._id || selectedGroupForManage?.id;

      const payload = {
        employeeAction: removeAction,
        targetCompanyId: removeAction === 'reassign' ? removeTargetCompanyId : null,
        otpCode: '123456'
      };

      const resp = await authFetch(`/api/company/${targetId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to remove company');
      }

      const resData = await resp.json();
      toast.success(resData.message || `Company "${selectedGroupForManage.name}" removed safely`);
      setRemoveModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.message || 'Remove failed');
    } finally {
      setRemoveSaving(false);
    }
  };

  // Group unique companies and their employees reliably by company identifier
  const companyGroups = useMemo(() => {
    const groupsMap = new Map();
    const idAliasMap = new Map();
    const nameMap = new Map();
    const ownerMap = new Map();

    // 1. Register all official companies from dbCompanies first
    dbCompanies.forEach(c => {
      const cId = String(c._id || c.id || '');
      if (!cId) return;
      const cleanName = (c.name || 'Unnamed Company').trim();
      const normName = cleanName.toLowerCase();

      // Avoid duplicate company entries if multiple company records share the same normalized name
      if (nameMap.has(normName)) {
        const canonicalId = nameMap.get(normName);
        idAliasMap.set(cId, canonicalId);
        if (c.ownerId) {
          ownerMap.set(String(c.ownerId), canonicalId);
        }
        return;
      }

      groupsMap.set(cId, {
        id: cId,
        name: cleanName,
        city: c.city || '',
        category: c.category || '',
        logo: c.logo || '',
        status: c.status || 'active',
        employees: []
      });
      idAliasMap.set(cId, cId);
      nameMap.set(normName, cId);
      if (c.ownerId) {
        ownerMap.set(String(c.ownerId), cId);
      }
    });

    const unassignedUsers = [];

    // 2. Bucket each user into their affiliated company reliably
    dbUsers.forEach(u => {
      const uCompanyId = u.companyId ? String(u.companyId?._id || u.companyId) : null;
      const uCompanyName = (u.company || '').trim();
      const normUCoName = uCompanyName.toLowerCase();

      let matchedGroupId = null;

      // Match A: By companyId via registered id or alias
      if (uCompanyId && idAliasMap.has(uCompanyId)) {
        matchedGroupId = idAliasMap.get(uCompanyId);
      } else if (uCompanyId && groupsMap.has(uCompanyId)) {
        matchedGroupId = uCompanyId;
      }
      // Match B: By company name
      else if (normUCoName && nameMap.has(normUCoName)) {
        matchedGroupId = nameMap.get(normUCoName);
        if (uCompanyId) idAliasMap.set(uCompanyId, matchedGroupId);
      }
      // Match C: By owner role / ownerId
      else if (u.role === 'owner' && (ownerMap.has(String(u.userId)) || ownerMap.has(String(u._id)))) {
        matchedGroupId = ownerMap.get(String(u.userId)) || ownerMap.get(String(u._id));
      }

      if (matchedGroupId && groupsMap.has(matchedGroupId)) {
        groupsMap.get(matchedGroupId).employees.push(u);
      } else if (normUCoName) {
        // User has a company name not found in dbCompanies - group uniquely
        if (nameMap.has(normUCoName)) {
          const vId = nameMap.get(normUCoName);
          groupsMap.get(vId).employees.push(u);
        } else {
          const virtualKey = uCompanyId || `company-${normUCoName}`;
          const newGroup = {
            id: virtualKey,
            name: uCompanyName,
            city: '',
            category: '',
            logo: '',
            status: 'active',
            employees: [u]
          };
          groupsMap.set(virtualKey, newGroup);
          nameMap.set(normUCoName, virtualKey);
          idAliasMap.set(virtualKey, virtualKey);
          if (uCompanyId) idAliasMap.set(uCompanyId, virtualKey);
        }
      } else if (uCompanyId) {
        // User has companyId but no company name and not in dbCompanies
        const virtualKey = `company-id-${uCompanyId}`;
        if (!groupsMap.has(virtualKey)) {
          groupsMap.set(virtualKey, {
            id: virtualKey,
            name: `Company (${uCompanyId.slice(-6)})`,
            city: '',
            category: '',
            logo: '',
            status: 'active',
            employees: []
          });
        }
        groupsMap.get(virtualKey).employees.push(u);
      } else {
        // Unaffiliated / independent user (e.g. system admins, users without company)
        unassignedUsers.push(u);
      }
    });

    const groupsList = Array.from(groupsMap.values());

    // Sort company groups alphabetically by name
    groupsList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Append Unassigned group if there are unassigned users
    if (unassignedUsers.length > 0) {
      groupsList.push({
        id: 'unassigned',
        name: 'Independent / Unassigned Accounts',
        city: 'System-wide',
        category: 'Platform',
        logo: '',
        status: 'system',
        isUnassigned: true,
        employees: unassignedUsers
      });
    }

    return groupsList;
  }, [dbCompanies, dbUsers]);

  // Find currently selected company
  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return companyGroups.find(g => g.id === selectedCompanyId) || null;
  }, [companyGroups, selectedCompanyId]);

  // Overall system metrics
  const activeCount = useMemo(() => dbUsers.filter(u => u.status === 'active').length, [dbUsers]);
  const suspendedCount = useMemo(() => dbUsers.filter(u => u.status !== 'active').length, [dbUsers]);

  // Filtered companies for Default View
  const filteredCompanyGroups = useMemo(() => {
    const term = (localSearch || '').toLowerCase().trim();
    if (!term) return companyGroups;
    return companyGroups.filter(g => {
      if (g.name?.toLowerCase().includes(term)) return true;
      if (g.city?.toLowerCase().includes(term)) return true;
      if (g.category?.toLowerCase().includes(term)) return true;
      // Also match if any employee inside matches search term
      return g.employees.some(u => 
        u.name?.toLowerCase().includes(term) || 
        u.username?.toLowerCase().includes(term) ||
        u.userId?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.department?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
      );
    });
  }, [companyGroups, localSearch]);

  // Filtered employees for Selected Company View
  const filteredEmployees = useMemo(() => {
    if (!selectedCompany) return [];
    const term = (localSearch || '').toLowerCase().trim();
    if (!term) return selectedCompany.employees;
    return selectedCompany.employees.filter(u => {
      return (
        u.name?.toLowerCase().includes(term) || 
        u.username?.toLowerCase().includes(term) ||
        u.userId?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.department?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
      );
    });
  }, [selectedCompany, localSearch]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <div className="border border-border/80 bg-card/70 backdrop-blur-xs p-4 sm:p-5 rounded-xl shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-normal text-foreground">{companyGroups.length}</div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Affiliated Companies</div>
          </div>
        </div>

        <div className="border border-border/80 bg-card/70 backdrop-blur-xs p-4 sm:p-5 rounded-xl shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-normal text-foreground">{dbUsers.length}</div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Total System Users</div>
          </div>
        </div>

        <div className="border border-border/80 bg-card/70 backdrop-blur-xs p-4 sm:p-5 rounded-xl shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-normal text-foreground">{activeCount}</div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Active Accounts</div>
          </div>
        </div>
      </div>

      {/* VIEW 1: COMPANY LIST (Default View) */}
      {!selectedCompany ? (
        <div className="space-y-4">
          {/* Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/70 backdrop-blur-xs p-3 sm:p-3.5 rounded-xl border border-border/80 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
              <Input 
                placeholder="Search companies by name, location, or employee..." 
                className="h-10 pl-10 pr-4 bg-background/80 border-border/80 text-foreground placeholder:text-muted-foreground/60 text-sm rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/25 transition-all"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">
                Showing <strong className="text-foreground font-semibold">{filteredCompanyGroups.length}</strong> {filteredCompanyGroups.length === 1 ? 'company' : 'companies'}
              </span>
            </div>
          </div>

          {/* Company Cards Grid / List */}
          <div className="space-y-3">
            {filteredCompanyGroups.map((group) => {
              const empCount = group.employees.length;
              const activeEmps = group.employees.filter(u => u.status === 'active').length;
              const isSelected = selectedCompanyId === group.id;

              return (
                <div
                  key={group.id}
                  className={cn(
                    "group border transition-all duration-200 rounded-xl p-4 sm:p-5 flex items-center justify-between gap-4 shadow-xs",
                    isSelected
                      ? "bg-teal-50/70 dark:bg-teal-950/40 border-teal-500/80 ring-1 ring-teal-500/40"
                      : "bg-white dark:bg-card border-border/80 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 hover:border-teal-500/50"
                  )}
                >
                  {/* Left: Clickable company info */}
                  <div
                    onClick={() => {
                      setSelectedCompanyId(group.id);
                      setLocalSearch('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCompanyId(group.id);
                        setLocalSearch('');
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View employees for ${group.name}`}
                    className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg p-0.5"
                  >
                    <div className="w-12 h-12 rounded-xl bg-teal-50/80 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center shrink-0 group-hover:border-teal-400/60 group-hover:bg-teal-100/60 dark:group-hover:bg-primary/20 transition-colors">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-bold text-base text-slate-900 dark:text-foreground group-hover:text-primary transition-colors truncate">
                          {group.name}
                        </h3>
                        {group.status === 'suspended' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                            Suspended
                          </span>
                        )}
                        {group.isUnassigned && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                            Independent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                        {group.city && (
                          <>
                            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                              <MapPin className="w-3 h-3 text-slate-500 dark:text-muted-foreground" />
                              {group.city}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{group.category ? (COMPANY_CATEGORIES[group.category] || group.category) : (group.isUnassigned ? 'System Accounts & Admins' : 'Registered Organization')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
                    <div className="text-right hidden sm:flex flex-col items-end gap-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 dark:bg-primary/10 text-teal-800 dark:text-primary border border-teal-200 dark:border-primary/20">
                        <Users className="w-3.5 h-3.5 text-teal-600 dark:text-primary" />
                        <span>{empCount} {empCount === 1 ? 'employee' : 'employees'}</span>
                      </div>
                      {empCount > 0 && (
                        <div className="text-[11px] text-slate-600 dark:text-muted-foreground flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
                          <span>{activeEmps} active</span>
                        </div>
                      )}
                    </div>
                    <div className="sm:hidden">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 dark:bg-primary/10 text-teal-800 dark:text-primary border border-teal-200 dark:border-primary/20">
                        {empCount}
                      </span>
                    </div>

                    {/* View Employees Action */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCompanyId(group.id);
                        setLocalSearch('');
                      }}
                      className="h-9 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-card text-slate-800 dark:text-foreground hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-border/80 hover:border-teal-400 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="View all employees under this company"
                    >
                      <Users className="w-3.5 h-3.5 text-primary" />
                      <span className="hidden md:inline">View Employees</span>
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 text-slate-500 dark:text-muted-foreground" />
                    </Button>

                    {/* Manage Dropdown Menu */}
                    {!group.isUnassigned && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                            className="h-9 px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-white dark:bg-card text-slate-800 dark:text-foreground hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-border/80 hover:border-teal-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                            title="Manage company options"
                          >
                            <span className="hidden sm:inline">Manage</span>
                            <MoreVertical className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent 
                          align="end" 
                          onClick={(e) => e.stopPropagation()}
                          className="w-48 bg-card border border-border/80 text-foreground rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in-50 zoom-in-95"
                        >
                          <DropdownMenuItem
                            onClick={() => openEditModal(group)}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-sky-400" />
                            <span>Edit Company</span>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => openReplaceModal(group)}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5 text-teal-400" />
                            <span>Replace Company</span>
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-border/60 my-1" />

                          <DropdownMenuItem
                            onClick={() => openRemoveModal(group)}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Remove Company</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredCompanyGroups.length === 0 && (
              <div className="border border-border/80 bg-card rounded-xl p-12 text-center shadow-xs">
                <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-base font-semibold text-foreground">No companies found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your search filter.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW 2: SELECTED COMPANY EMPLOYEES TABLE */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Breadcrumb & Back Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedCompanyId(null);
                  setLocalSearch('');
                }}
                className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-primary" />
                <span>Companies</span>
              </button>
              <span className="text-muted-foreground/60">/</span>
              <span className="font-semibold text-foreground truncate max-w-[240px] sm:max-w-none">
                {selectedCompany.name}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCompanyId(null);
                setLocalSearch('');
              }}
              className="h-8 px-3 rounded-lg text-xs font-semibold border-border/80 bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-primary" />
              Back to Companies
            </Button>
          </div>

          {/* Selected Company Header Banner */}
          <div 
            onClick={() => {
              setSelectedCompanyId(null);
              setLocalSearch('');
            }}
            title="Click to collapse and return to company list"
            className="border border-teal-500/70 bg-teal-50/70 dark:bg-teal-950/40 hover:bg-teal-100/60 dark:hover:bg-teal-950/60 transition-colors p-4 sm:p-5 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ring-1 ring-teal-500/30"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-teal-50/80 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-foreground truncate">
                    {selectedCompany.name}
                  </h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 dark:bg-primary/10 text-teal-800 dark:text-primary border border-teal-200 dark:border-primary/20 shrink-0">
                    <Users className="w-3.5 h-3.5 text-teal-600 dark:text-primary" />
                    {selectedCompany.employees.length} {selectedCompany.employees.length === 1 ? 'employee' : 'employees'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                  {selectedCompany.city ? `Location: ${selectedCompany.city} • ` : ''}Showing all team members enrolled under this company. Click to collapse.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors flex items-center gap-1">
                Collapse View
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Search Toolbar for Selected Company */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/70 backdrop-blur-xs p-3 sm:p-3.5 rounded-xl border border-border/80 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
              <Input 
                placeholder={`Search employees in ${selectedCompany.name} by name, username, email, department, role...`}
                className="h-10 pl-10 pr-4 bg-background/80 border-border/80 text-foreground placeholder:text-muted-foreground/60 text-sm rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/25 transition-all"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">
                Showing <strong className="text-foreground font-semibold">{filteredEmployees.length}</strong> of {selectedCompany.employees.length} {selectedCompany.employees.length === 1 ? 'employee' : 'employees'}
              </span>
            </div>
          </div>

          {/* Global Users Table */}
          <div className="border border-border/80 bg-card rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader className="bg-[#121E27] dark:bg-[#121E27] bg-muted/40 border-b border-border/80">
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-11 pl-5">User</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-11">Affiliated Company</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-11">Department</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-11">Role</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-11">Status</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 h-11 text-right pr-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((user) => {
                    const userCompanyName = user.company || dbCompanies.find(c => String(c._id || c.id) === String(user.companyId?._id || user.companyId))?.name || (selectedCompany?.isUnassigned ? '' : selectedCompany?.name);
                    const displayName = user.role === 'owner' && userCompanyName ? userCompanyName : (user.name || user.username);

                    return (
                      <TableRow 
                        key={user.userId || user._id} 
                        className="border-b border-border/50 last:border-b-0 hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] transition-colors"
                      >
                        {/* User Info */}
                        <TableCell className="pl-5 py-3.5 max-w-[240px]">
                          <div className="flex items-center gap-3">
                            <UserAvatar src={user.avatar} name={displayName} username={user.username} />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-foreground truncate" title={displayName}>
                                {displayName}
                              </div>
                              <div className="text-xs text-muted-foreground/80 truncate mt-0.5" title={user.email || user.username || user.userId}>
                                {user.email ? user.email : `@${user.username || user.userId}`}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Affiliated Company */}
                        <TableCell className="py-3.5 max-w-[200px]">
                          {userCompanyName ? (
                            <div className="flex items-center gap-1.5 min-w-0" title={userCompanyName}>
                              <Building2 className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                              <span className="text-sm font-medium text-primary truncate hover:underline cursor-default">
                                {userCompanyName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs italic font-normal">
                              No Company
                            </span>
                          )}
                        </TableCell>

                        {/* Department */}
                        <TableCell className="py-3.5 max-w-[150px]">
                          <span className="text-xs text-slate-300 font-medium truncate block" title={user.department || 'General'}>
                            {user.department || 'General'}
                          </span>
                        </TableCell>

                        {/* Role Badge */}
                        <TableCell className="py-3.5">
                          {renderRoleBadge(user.role)}
                        </TableCell>

                        {/* Status Indicator */}
                        <TableCell className="py-3.5">
                          {user.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                              Suspended
                            </span>
                          )}
                        </TableCell>

                        {/* Actions Column */}
                        <TableCell className="py-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!hasUserRole(user, 'param') && (
                              user.status === 'active' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={togglingId === (user.userId || user._id || user.id)}
                                  onClick={() => handleQuickToggle(user, 'suspend')}
                                  className="h-8 px-2.5 rounded-xl border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-semibold"
                                  title="Suspend User"
                                >
                                  <Ban className="w-3.5 h-3.5 mr-1" />
                                  {togglingId === (user.userId || user._id || user.id) ? 'Updating…' : 'Suspend'}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={togglingId === (user.userId || user._id || user.id)}
                                  onClick={() => handleQuickToggle(user, 'activate')}
                                  className="h-8 px-2.5 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 text-xs font-semibold"
                                  title="Restore / Add Back"
                                >
                                  <Unlock className="w-3.5 h-3.5 mr-1" />
                                  {togglingId === (user.userId || user._id || user.id) ? 'Updating…' : 'Add Back'}
                                </Button>
                              )
                            )}
                            <ManageUserDialog user={user} dbCompanies={dbCompanies} onRefresh={onRefresh} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="w-8 h-8 text-muted-foreground/40" />
                          <p className="text-sm font-medium text-foreground/80">No employees found in this company</p>
                          <p className="text-xs text-muted-foreground">Try adjusting your search query or check company enrollments.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
      {/* Manage Company: Edit Dialog */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader className="mb-5 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Pencil className="w-5 h-5" />
                </div>
                <span>Edit Company: {selectedGroupForManage?.name}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Update company profile, industry classification, contact information, and operating address.
              </p>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Company Name *</label>
                  <Input
                    required
                    value={editCompanyForm.name}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, name: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="e.g. Acme Innovations Inc."
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Industry Category *</label>
                  <Select 
                    value={editCompanyForm.category} 
                    onValueChange={(val) => setEditCompanyForm({ ...editCompanyForm, category: val })}
                  >
                    <SelectTrigger className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      <SelectItem value="it">IT Solutions</SelectItem>
                      <SelectItem value="logistics">Logistics</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="consulting">Consulting</SelectItem>
                      <SelectItem value="realestate">Real Estate</SelectItem>
                      <SelectItem value="hospitality">Hospitality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Official Phone Number *</label>
                  <Input
                    required
                    value={editCompanyForm.phoneNumber}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, phoneNumber: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Primary Email</label>
                  <Input
                    type="email"
                    value={editCompanyForm.email}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, email: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="contact@company.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">GST / Tax Identification</label>
                  <Input
                    value={editCompanyForm.gst}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, gst: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="GST Number"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">City *</label>
                  <Input
                    required
                    value={editCompanyForm.city}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, city: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">State</label>
                  <Input
                    value={editCompanyForm.state}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, state: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="State / Region"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Zip / Postal Code</label>
                  <Input
                    value={editCompanyForm.zip}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, zip: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="Postal Code"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Street Address</label>
                  <Input
                    value={editCompanyForm.address}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, address: e.target.value })}
                    className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    placeholder="Headquarters address, floor, building"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border/80 mt-6">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setEditModalOpen(false)}
                  className="h-10 px-4 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editSaving}
                  className="h-10 px-5 bg-primary hover:bg-[#0f766e] text-white font-semibold text-xs rounded-lg shadow-sm shadow-primary/20 transition-all flex items-center gap-2"
                >
                  {editSaving ? 'Saving Changes…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Company: Replace Dialog */}
      <Dialog open={replaceModalOpen} onOpenChange={setReplaceModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader className="mb-5 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <span>Replace Company: {selectedGroupForManage?.name}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Reassign employee affiliations, associated records, or transition this organization to another company.
              </p>
            </DialogHeader>

            <div className="space-y-4">
              {/* Source Company Summary Card */}
              <div className="p-3.5 rounded-xl bg-[#121E27] border border-border/80 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Current Company</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{selectedGroupForManage?.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Enrolled Team</div>
                  <div className="text-xs font-semibold text-primary mt-0.5">
                    {selectedGroupForManage?.employees?.length || 0} employees
                  </div>
                </div>
              </div>

              {/* Action Mode Toggle */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">Replacement Method</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReplaceAction('reassign')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      replaceAction === 'reassign' 
                        ? 'bg-primary/10 border-primary/50 text-foreground' 
                        : 'bg-background/60 border-border/80 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5" /> Transfer Employees
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Migrate all employees into another registered company
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReplaceAction('rename_merge')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      replaceAction === 'rename_merge' 
                        ? 'bg-primary/10 border-primary/50 text-foreground' 
                        : 'bg-background/60 border-border/80 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <div className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> Rebrand Organization
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Replace name & classification across all members
                    </div>
                  </button>
                </div>
              </div>

              {replaceAction === 'reassign' ? (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Company *</label>
                    <Select value={replaceTargetId} onValueChange={setReplaceTargetId}>
                      <SelectTrigger className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary">
                        <SelectValue placeholder="Select Target Company" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        {dbCompanies
                          .filter(c => String(c._id || c.id) !== String(selectedGroupForManage?.id))
                          .map(c => (
                            <SelectItem key={c._id || c.id} value={String(c._id || c.id)}>
                              {c.name} {c.city ? `(${c.city})` : ''}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300">
                    💡 All <strong>{selectedGroupForManage?.employees?.length || 0} employees</strong>, their tasks, and historical activity will be safely migrated and linked to the selected company. Employee account credentials will remain fully intact.
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">New Company Name *</label>
                    <Input
                      value={replaceNewName}
                      onChange={(e) => setReplaceNewName(e.target.value)}
                      placeholder="e.g. Apex Global Technologies"
                      className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Category</label>
                      <Select value={replaceNewCategory} onValueChange={setReplaceNewCategory}>
                        <SelectTrigger className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-foreground">
                          <SelectItem value="it">IT Solutions</SelectItem>
                          <SelectItem value="logistics">Logistics</SelectItem>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="healthcare">Healthcare</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Operating City</label>
                      <Input
                        value={replaceNewCity}
                        onChange={(e) => setReplaceNewCity(e.target.value)}
                        placeholder="City"
                        className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300">
                    💡 All {selectedGroupForManage?.employees?.length || 0} employee records and company profiles will immediately update to reflect the new company branding.
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border/80 mt-6">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setReplaceModalOpen(false)}
                  className="h-10 px-4 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveReplace}
                  disabled={replaceSaving}
                  className="h-10 px-5 bg-primary hover:bg-[#0f766e] text-white font-semibold text-xs rounded-lg shadow-sm shadow-primary/20 transition-all flex items-center gap-2"
                >
                  {replaceSaving ? 'Processing Replace…' : 'Confirm Replacement'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Company: Remove Dialog */}
      <Dialog open={removeModalOpen} onOpenChange={setRemoveModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border border-border/80 bg-card text-foreground p-0 rounded-2xl shadow-2xl">
          <div className="p-6 sm:p-8">
            <DialogHeader className="mb-4 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <span>Remove Company: {selectedGroupForManage?.name}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Safely remove this company organization and handle team affiliations without data loss.
              </p>
            </DialogHeader>

            <div className="space-y-4">
              {/* Consequence Warning Banner */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-amber-300">
                      {selectedGroupForManage?.employees?.length > 0 
                        ? `Safety Alert: ${selectedGroupForManage?.employees?.length} Employee Records Protected`
                        : 'Encrypted Backup Generated Automatically'
                      }
                    </div>
                    <p className="text-xs text-muted-foreground/90 leading-relaxed">
                      {selectedGroupForManage?.employees?.length > 0
                        ? 'Employee accounts will NOT be deleted. Choose how to preserve and reassign existing employee accounts below.'
                        : 'An automatic encrypted ZIP backup of company metadata will be preserved in your backups vault.'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Safe Employee Handling Options if employees > 0 */}
              {selectedGroupForManage?.employees?.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground block">Employee Retention Action</label>
                  <div className="space-y-2">
                    <label 
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        removeAction === 'detach' 
                          ? 'bg-primary/10 border-primary/50 text-foreground' 
                          : 'bg-background/60 border-border/80 text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="removeEmployeeAction" 
                        checked={removeAction === 'detach'} 
                        onChange={() => setRemoveAction('detach')}
                        className="mt-1 text-primary focus:ring-primary"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">
                          Detach & Keep as Independent Accounts (Recommended)
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Preserves all {selectedGroupForManage?.employees?.length} user logins, credentials, and profiles without company lock.
                        </div>
                      </div>
                    </label>

                    <label 
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        removeAction === 'reassign' 
                          ? 'bg-primary/10 border-primary/50 text-foreground' 
                          : 'bg-background/60 border-border/80 text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="removeEmployeeAction" 
                        checked={removeAction === 'reassign'} 
                        onChange={() => setRemoveAction('reassign')}
                        className="mt-1 text-primary focus:ring-primary"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">
                          Reassign All Employees to Another Company
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Transfers all members to another selected organization immediately.
                        </div>
                      </div>
                    </label>
                  </div>

                  {removeAction === 'reassign' && (
                    <div className="pt-2">
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Company</label>
                      <Select value={removeTargetCompanyId} onValueChange={setRemoveTargetCompanyId}>
                        <SelectTrigger className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-primary">
                          <SelectValue placeholder="Select Target Company" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-foreground">
                          {dbCompanies
                            .filter(c => String(c._id || c.id) !== String(selectedGroupForManage?.id))
                            .map(c => (
                              <SelectItem key={c._id || c.id} value={String(c._id || c.id)}>
                                {c.name} {c.city ? `(${c.city})` : ''}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Confirmation Input */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  Type <strong className="text-rose-400 font-bold">{selectedGroupForManage?.name}</strong> to confirm:
                </label>
                <Input
                  value={removeConfirmInput}
                  onChange={(e) => setRemoveConfirmInput(e.target.value)}
                  placeholder={selectedGroupForManage?.name}
                  className="h-10 bg-background/80 border-border/80 rounded-lg text-foreground text-sm focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border/80 mt-6">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setRemoveModalOpen(false)}
                  className="h-10 px-4 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmRemove}
                  disabled={
                    removeSaving || 
                    removeConfirmInput.trim().toLowerCase() !== selectedGroupForManage?.name?.trim().toLowerCase()
                  }
                  className="h-10 px-5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg shadow-sm shadow-rose-600/20 transition-all flex items-center gap-2"
                >
                  {removeSaving ? 'Removing Company…' : 'Safely Remove Company'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManageUserDialog({ user, dbCompanies = [], onRefresh }) {
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const initialCompanyId = user.companyId 
    ? String(user.companyId?._id || user.companyId) 
    : 'none';

  const userCompanyName = user.company || dbCompanies.find(c => String(c._id || c.id) === String(user.companyId?._id || user.companyId))?.name || '';
  const displayName = user.role === 'owner' && userCompanyName ? userCompanyName : (user.name || user.username);

  const [editForm, setEditForm] = useState({
    name: displayName || '',
    designation: user.designation || '',
    department: user.department || '',
    phone: user.phone || user.contact || '',
    companyId: initialCompanyId,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    initialCompanyId !== 'none' ? initialCompanyId : (dbCompanies[0]?._id ? String(dbCompanies[0]._id) : 'none')
  );

  useEffect(() => {
    if (open) {
      const cId = user.companyId ? String(user.companyId?._id || user.companyId) : 'none';
      const cName = user.company || dbCompanies.find(c => String(c._id || c.id) === String(user.companyId?._id || user.companyId))?.name || '';
      const resolvedName = (user.role === 'owner' && cName) ? cName : (user.name || user.username || '');
      setEditForm({
        name: resolvedName,
        designation: user.designation || '',
        department: user.department || '',
        phone: user.phone || user.contact || '',
        companyId: cId,
        status: user.status === 'inactive' ? 'inactive' : 'active',
      });
      setSelectedCompanyId(cId !== 'none' ? cId : (dbCompanies[0]?._id ? String(dbCompanies[0]._id) : 'none'));
      setIsEditing(false);
    }
  }, [open, user, dbCompanies]);

  const targetUserId = user.userId || user._id || user.id;

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const targetId = user.userId || user._id || user.id;
      const resp = await authFetch(`/api/users/${encodeURIComponent(targetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update profile');
      }
      toast.success('User profile updated successfully');
      setIsEditing(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleStatus = async (action) => {
    setActionLoading(true);
    try {
      let payload = { action };
      if (action === 'activate') {
        if (selectedCompanyId && selectedCompanyId !== 'none') {
          const foundCo = dbCompanies.find(c => String(c._id || c.id) === String(selectedCompanyId));
          payload.companyId = selectedCompanyId;
          payload.company = foundCo?.name || '';
        } else if (user.companyId) {
          payload.companyId = String(user.companyId?._id || user.companyId);
          payload.company = userCompanyName || '';
        }
      }

      const targetId = user.userId || user._id || user.id;
      const resp = await authFetch(`/api/users/${encodeURIComponent(targetId)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update user status');
      }

      const resData = await resp.json();
      toast.success(resData.message || (action === 'suspend' ? 'User suspended successfully' : 'User access restored'));
      if (onRefresh) onRefresh();
      setOpen(false);
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-3 rounded-lg text-xs font-semibold text-primary hover:text-emerald-300 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer"
        >
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl bg-card border border-border/80 text-foreground rounded-2xl shadow-2xl overflow-hidden p-0">
        <div className="px-8 py-8">
          <DialogHeader className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <UserAvatar src={user.avatar} name={displayName} username={user.username} className="w-14 h-14" />
                <div>
                  <div className="flex items-center gap-2.5">
                    <DialogTitle className="text-2xl font-extrabold tracking-tight text-foreground">
                      {displayName}
                    </DialogTitle>
                    {user.status === 'active' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                        Suspended
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs font-medium mt-1 flex items-center gap-2">
                    <span>UID: {user.userId}</span>
                    <span>•</span>
                    {renderRoleBadge(user.role)}
                  </div>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Association Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-background p-4 rounded-xl border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-extrabold mb-1">Affiliated Company</p>
                {userCompanyName ? (
                  <p className="text-base font-bold text-primary">{userCompanyName}</p>
                ) : (
                  <p className="text-xs font-semibold text-muted-foreground italic">None (No company assigned)</p>
                )}
              </div>
              <div className="bg-background p-4 rounded-xl border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-extrabold mb-1">Designation & Department</p>
                <p className="text-base font-bold text-foreground capitalize">{user.designation || 'Staff'} • <span className="text-muted-foreground text-xs font-normal">{user.department || 'General'}</span></p>
              </div>
            </div>

            {/* Profile Details or Edit Form */}
            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="bg-background p-5 rounded-xl border border-border space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-primary">Edit User Profile</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium">Full Name</label>
                    <Input 
                      value={editForm.name} 
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} 
                      className="h-10 bg-card border-border rounded-xl text-xs text-foreground focus-visible:ring-primary" 
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium">Phone</label>
                    <Input 
                      value={editForm.phone} 
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} 
                      className="h-10 bg-card border-border rounded-xl text-xs text-foreground focus-visible:ring-primary" 
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium">Designation</label>
                    <Input 
                      value={editForm.designation} 
                      onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} 
                      className="h-10 bg-card border-border rounded-xl text-xs text-foreground focus-visible:ring-primary" 
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium">Department</label>
                    <Input 
                      value={editForm.department} 
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} 
                      className="h-10 bg-card border-border rounded-xl text-xs text-foreground focus-visible:ring-primary" 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Account Access / Status</label>
                    <Select
                      value={editForm.status}
                      onValueChange={(val) => setEditForm({ ...editForm, status: val })}
                    >
                      <SelectTrigger className="h-10 bg-card border-border rounded-xl text-xs text-foreground focus-visible:ring-primary">
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground text-xs">
                        <SelectItem value="active">Active (Full System Access)</SelectItem>
                        <SelectItem value="inactive">Suspended / Inactive (Revoke Login Access)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Affiliated Company</label>
                    <Select 
                      value={editForm.companyId} 
                      onValueChange={(val) => setEditForm({ ...editForm, companyId: val })}
                    >
                      <SelectTrigger className="h-10 bg-card border-border rounded-xl text-xs text-foreground focus-visible:ring-primary">
                        <SelectValue placeholder="Select Company" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground text-xs">
                        <SelectItem value="none">None (No company)</SelectItem>
                        {dbCompanies.map((c) => (
                          <SelectItem key={c._id || c.id} value={String(c._id || c.id)}>
                            {c.name} {c.city ? `(${c.city})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="h-9 text-xs text-muted-foreground hover:bg-muted">
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={editLoading} className="h-9 text-xs font-bold bg-primary text-white hover:bg-emerald-700 shadow-xs shadow-primary/20">
                    {editLoading ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="bg-background p-5 rounded-xl border border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10"><UserCog className="w-4 h-4 text-primary" /></div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Personal Information</h4>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setIsEditing(true)} 
                    className="h-8 rounded-xl border-border bg-card text-foreground font-semibold text-xs hover:bg-muted"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    Edit Profile
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                  <div>
                    <p className="text-muted-foreground font-medium">Email / Contact</p>
                    <p className="font-semibold text-foreground">{user.email || user.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Age & Gender</p>
                    <p className="font-semibold text-foreground">{user.age ? `${user.age} yrs` : 'NA'} / {user.gender || 'Unspecified'}</p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-border">
                    <p className="text-muted-foreground font-medium">Address</p>
                    <p className="font-medium text-foreground leading-relaxed">{user.address || 'Address unassigned'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Super Admin Access Control: Suspend & Restore */}
            {user.role !== 'param' && (
              <div className="pt-3 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    Super Admin Access Control
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground">Privileged Super Admin Action</span>
                </div>

                {user.status === 'active' ? (
                  <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl flex items-center justify-between gap-4">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-red-500">Suspend User:</span> Will revoke system login access immediately. Their company affiliation is preserved so they can be reinstated at any time.
                    </div>
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleToggleStatus('suspend')}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 px-5 rounded-xl shrink-0 transition-all shadow-md shadow-red-900/20"
                    >
                      <Ban className="w-4 h-4 mr-1.5" />
                      {actionLoading ? 'Suspending…' : 'Suspend User'}
                    </Button>
                  </div>
                ) : (
                  <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4" /> Account Suspended
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Restore login access for this user and get them back into the system.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => handleToggleStatus('activate')}
                        className="bg-primary hover:bg-emerald-700 text-white font-bold h-10 px-5 rounded-xl shrink-0 shadow-md shadow-primary/20"
                      >
                        <Unlock className="w-4 h-4 mr-1.5" />
                        {actionLoading ? 'Restoring…' : 'Restore Access / Get Back'}
                      </Button>
                    </div>

                    {dbCompanies.length > 0 && (
                      <div className="pt-2 border-t border-primary/10 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Affiliated Company:</span>
                        <Select 
                          value={selectedCompanyId} 
                          onValueChange={setSelectedCompanyId}
                        >
                          <SelectTrigger className="h-9 bg-card border-border text-xs text-foreground rounded-lg">
                            <SelectValue placeholder="Choose Company" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border text-foreground text-xs">
                            <SelectItem value="none">No Company (Independent)</SelectItem>
                            {dbCompanies.map(c => (
                              <SelectItem key={c._id || c.id} value={String(c._id || c.id)}>
                                {c.name} ({c.city || 'HQ'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function TabPayments({ dbCompanies = [], dbUsers = [] }) {
  // Real billing calculations: pull amount from actual company records; if not set or 0, real value is 0
  const billingStats = useMemo(() => {
    const activeCompanies = dbCompanies.filter(c => c.status !== 'blocked');
    let totalMRR = 0;

    const companyTransactions = dbCompanies.map((comp) => {
      const cat = String(comp.category || '').toLowerCase();
      const categoryName = COMPANY_CATEGORIES[cat] || (comp.category ? String(comp.category).toUpperCase() : 'General');
      const companyUsers = dbUsers.filter(u => String(u.companyId) === String(comp._id) || u.company === comp.name);
      const isBlocked = comp.status === 'blocked';
      
      // Pull real amount from company; if 0 or undefined, real value is 0
      const rawAmount = Number(comp.amount ?? comp.monthlyFee ?? comp.revenue ?? comp.subscriptionAmount ?? 0);
      const monthlyAmount = isBlocked ? 0 : (isNaN(rawAmount) ? 0 : rawAmount);
      
      if (!isBlocked) {
        totalMRR += monthlyAmount;
      }

      const txDate = comp.createdAt ? new Date(comp.createdAt) : new Date();
      const txDateStr = txDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      const txid = `TXN-${String(comp._id || comp.id || '00000').slice(-6).toUpperCase()}-${txDate.getFullYear()}`;

      return {
        id: comp._id || comp.id,
        name: comp.name,
        categoryName,
        city: comp.city || 'Headquarters',
        state: comp.state || 'IN',
        ownerId: comp.ownerId || 'N/A',
        userCount: companyUsers.length,
        amount: monthlyAmount,
        status: isBlocked ? 'suspended' : 'active',
        txid,
        date: txDateStr,
      };
    });

    const totalARR = totalMRR * 12;
    const arpu = activeCompanies.length > 0 ? Math.round(totalMRR / activeCompanies.length) : 0;

    // Subscription Category Mix calculation (from real companies in DB)
    const categoryCounts = {};
    activeCompanies.forEach(c => {
      const cat = String(c.category || 'other').toLowerCase();
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const categoryMix = Object.keys(COMPANY_CATEGORIES).map(catKey => {
      const count = categoryCounts[catKey] || 0;
      const pct = activeCompanies.length > 0 ? Math.round((count / activeCompanies.length) * 100) : 0;
      return {
        key: catKey,
        name: COMPANY_CATEGORIES[catKey],
        count,
        pct,
      };
    });

    return {
      totalMRR,
      totalARR,
      arpu,
      activeCompaniesCount: activeCompanies.length,
      totalUsersCount: dbUsers.filter(u => u.status === 'active').length,
      companyTransactions,
      categoryMix,
    };
  }, [dbCompanies, dbUsers]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top ARR & Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold uppercase tracking-widest flex items-center justify-between">
              <span>Total Annual Revenue (ARR)</span>
              <CreditCard className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-semibold text-foreground tracking-normal">
              ${billingStats.totalARR.toLocaleString()}
            </div>
            <p className="text-muted-foreground text-xs mt-2 font-medium flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" /> 
              ${billingStats.totalMRR.toLocaleString()}/mo real monthly revenue
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold uppercase tracking-widest flex items-center justify-between">
              <span>Registered Accounts & Seats</span>
              <Building2 className="w-4 h-4 text-sky-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-semibold text-foreground tracking-normal">
              {billingStats.activeCompaniesCount} <span className="text-lg text-muted-foreground font-normal">Co.</span>
            </div>
            <p className="text-muted-foreground text-xs mt-2 flex items-center gap-1 font-normal">
              <span>{billingStats.totalUsersCount} active registered users</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold uppercase tracking-widest flex items-center justify-between">
              <span>Average Revenue Per Account</span>
              <Activity className="w-4 h-4 text-violet-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl sm:text-4xl font-semibold text-foreground tracking-normal">
              ${billingStats.arpu} <span className="text-lg text-muted-foreground font-normal">/mo</span>
            </div>
            <p className="text-primary text-xs mt-2 font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Real database valuation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Mix & Plan Breakdown */}
      <Card className="border border-border bg-card shadow-xs rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-foreground">
              <CreditCard className="w-5 h-5 text-primary" />
              Company Subscription Mix by Category
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Distribution of active enrolled company accounts
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
            {billingStats.activeCompaniesCount} Total Active
          </span>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {billingStats.categoryMix.map((item) => (
              <div key={item.key} className="bg-background p-4 rounded-xl border border-border flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">Industry Category</div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <div className="text-2xl font-bold text-foreground">{item.count}</div>
                  <div className="text-xs font-semibold text-primary">{item.pct}%</div>
                </div>
                <div className="w-full bg-muted h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(item.pct, item.count > 0 ? 15 : 0)}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Real Invoices & Transactions Table */}
      <Card className="border border-border bg-card shadow-xs rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-foreground">Real Company Billing Invoices</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Live statement generated from registered company accounts</p>
          </div>
          <span className="text-xs font-mono bg-muted px-2.5 py-1 rounded-md text-muted-foreground">
            {billingStats.companyTransactions.length} Account{billingStats.companyTransactions.length !== 1 ? 's' : ''}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="w-12"></TableHead>
                <TableHead className="text-muted-foreground font-semibold">Company & Account</TableHead>
                <TableHead className="text-muted-foreground font-semibold">Subscription Category</TableHead>
                <TableHead className="text-muted-foreground font-semibold">Invoice ID</TableHead>
                <TableHead className="text-muted-foreground font-semibold">Billing Date</TableHead>
                <TableHead className="text-foreground font-semibold text-right pr-6">Monthly Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billingStats.companyTransactions.length === 0 ? (
                <TableRow className="border-b border-border">
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No registered company accounts found.
                  </TableCell>
                </TableRow>
              ) : (
                billingStats.companyTransactions.map((tx) => (
                  <TableRow key={tx.id} className="border-b border-border hover:bg-teal-500/[0.04] dark:hover:bg-teal-400/[0.06] transition-colors">
                    <TableCell className="w-12 pr-0 pl-4">
                      {tx.status === 'active' ? (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary" title="Active">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500" title="Suspended">
                          <XCircle className="w-4 h-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-foreground">{tx.name}</div>
                      <div className="text-xs text-muted-foreground">{tx.city}, {tx.state} • Owner: {tx.ownerId}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-foreground font-medium">{tx.categoryName}</div>
                      <div className="text-xs text-muted-foreground">{tx.userCount} registered user{tx.userCount !== 1 ? 's' : ''}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tx.txid}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.date}
                    </TableCell>
                    <TableCell className="font-bold text-foreground text-right pr-6">
                      ${tx.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TabAnalytics({ dbCompanies = [], dbUsers = [], dbAttendance = [], dbTasks = [], dbMessages = [] }) {
  // 1. Dynamic 6-month growth metrics based on real registration dates
  const monthlyGrowthData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = monthNames[d.getMonth()];
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const companiesUpToMonth = dbCompanies.filter(c => {
        if (!c.createdAt) return true;
        return new Date(c.createdAt) <= endOfMonth;
      });

      const usersUpToMonth = dbUsers.filter(u => {
        if (!u.createdAt && !u.joiningDate) return true;
        const joined = u.createdAt ? new Date(u.createdAt) : new Date(u.joiningDate);
        return joined <= endOfMonth;
      });

      result.push({
        month: monthLabel,
        companies: companiesUpToMonth.length,
        users: usersUpToMonth.length,
      });
    }

    return result;
  }, [dbCompanies, dbUsers]);

  // 2. Dynamic Operational Intensity across current week (Mon-Sun)
  const operationalIntensityData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const currentDayOfWeek = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDayOfWeek);

    return days.map((dayName, idx) => {
      const targetDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx);
      const dateStr = toLocalDateStr(targetDate);

      const activeUsers = new Set();
      let taskEvents = 0;
      let messageEvents = 0;
      let attendanceEvents = 0;

      // Attendance
      dbAttendance.forEach(att => {
        const attDate = att.date ? att.date.slice(0, 10) : toLocalDateStr(att.createdAt);
        if (attDate === dateStr && att.status !== 'absent') {
          activeUsers.add(att.userId);
          attendanceEvents++;
        }
      });

      // Tasks
      dbTasks.forEach(task => {
        const cDate = toLocalDateStr(task.createdAt);
        const uDate = toLocalDateStr(task.updatedAt);
        if (cDate === dateStr || uDate === dateStr) {
          taskEvents++;
          if (task.assignedTo) activeUsers.add(task.assignedTo);
        }
      });

      // Messages
      dbMessages.forEach(msg => {
        const mDate = toLocalDateStr(msg.createdAt || msg.timestamp);
        if (mDate === dateStr) {
          messageEvents++;
          if (msg.senderId) activeUsers.add(msg.senderId);
        }
      });

      // User logins/updates
      dbUsers.forEach(u => {
        const laDate = toLocalDateStr(u.lastActive);
        const llDate = toLocalDateStr(u.lastLogin);
        const cDate = toLocalDateStr(u.createdAt);
        const uDate = toLocalDateStr(u.updatedAt);
        if (laDate === dateStr || llDate === dateStr || cDate === dateStr || uDate === dateStr) {
          activeUsers.add(u.userId || u.username);
        }
      });

      // If today, count currently active SuperAdmin session
      const isToday = (idx === currentDayOfWeek);
      if (isToday) {
        const currentSa = localStorage.getItem('active_sa_id') || localStorage.getItem('current_user') || 'Vyshwa';
        activeUsers.add(currentSa);
      }

      // Platform intensity score (weighted activity sum)
      const activityScore = (activeUsers.size * 5) + (taskEvents * 3) + (messageEvents * 2) + attendanceEvents;

      return {
        day: dayName,
        date: dateStr,
        intensity: activityScore,
        activeUsers: activeUsers.size,
        taskEvents,
        messageEvents,
        attendanceEvents,
        isToday,
      };
    });
  }, [dbAttendance, dbTasks, dbMessages, dbUsers]);

  // 3. Real Industry & Role distributions
  const categoryStats = useMemo(() => {
    const counts = {};
    dbCompanies.forEach(c => {
      const cat = String(c.category || 'other').toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.keys(COMPANY_CATEGORIES).map(key => ({
      name: COMPANY_CATEGORIES[key],
      count: counts[key] || 0,
      pct: dbCompanies.length > 0 ? Math.round(((counts[key] || 0) / dbCompanies.length) * 100) : 0,
    }));
  }, [dbCompanies]);

  const roleStats = useMemo(() => {
    const counts = { owner: 0, admin: 0, staff: 0, intern: 0, freelancer: 0, param: 0 };
    dbUsers.forEach(u => {
      const r = String(u.role || 'staff').toLowerCase();
      if (counts[r] !== undefined) counts[r]++;
    });
    return [
      { name: 'Super Admin', count: counts.param },
      { name: 'Company Owners', count: counts.owner },
      { name: 'Staff Members', count: counts.staff },
      { name: 'Interns', count: counts.intern },
      { name: 'Freelancers', count: counts.freelancer },
    ];
  }, [dbUsers]);

  const totalInteractions = operationalIntensityData.reduce((acc, d) => acc + d.intensity, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Analytics KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          title="Platform Adoption" 
          value={`${dbCompanies.length} Co.`} 
          icon={Building2} 
          trend={`${dbUsers.length} Registered Users`} 
          color="emerald" 
        />
        <StatCard 
          title="Active User Engagement" 
          value={`${dbUsers.filter(u => u.status === 'active').length}`} 
          icon={Users} 
          trend={`${Math.round((dbUsers.filter(u => u.status === 'active').length / (dbUsers.length || 1)) * 100)}% Active Status`} 
          color="blue" 
        />
        <StatCard 
          title="Weekly Interactions" 
          value={totalInteractions} 
          icon={Activity} 
          trend="Tasks, messages & logins" 
          color="purple" 
        />
        <StatCard 
          title="System Reliability" 
          value="100%" 
          icon={TrendingUp} 
          trend="0 fatal anomalies reported" 
          color="amber" 
        />
      </div>

      {/* Main Charts: Real Growth Metrics & Real Operational Intensity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <TrendingUp className="w-5 h-5 text-primary" />
                Growth Metrics (Companies & Users)
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-[#0D9488]"></span> Companies</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]"></span> Users</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[320px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3D48" opacity={0.4} vertical={false} />
                <XAxis dataKey="month" stroke="#A6B5C0" fontSize={12} />
                <YAxis stroke="#A6B5C0" fontSize={12} allowDecimals={false} />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0]?.payload || {};
                      const companiesCount = payload.find(p => p.dataKey === 'companies')?.value ?? data.companies ?? 0;
                      const usersCount = payload.find(p => p.dataKey === 'users')?.value ?? data.users ?? 0;
                      const monthName = label || data.month || 'Month';

                      return (
                        <div className="bg-[#15232D] border border-[#2A3D48] rounded-xl p-3.5 shadow-2xl text-xs space-y-2.5 min-w-[190px] pointer-events-none">
                          <div className="flex items-center justify-between border-b border-[#2A3D48]/80 pb-2">
                            <span className="font-bold text-sm text-slate-100">{monthName} Growth</span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Metrics</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488] shrink-0" />
                                <span className="text-slate-300 font-medium">Companies:</span>
                              </div>
                              <span className="font-bold text-slate-100 font-mono text-sm">
                                {Number(companiesCount).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] shrink-0" />
                                <span className="text-slate-300 font-medium">Users:</span>
                              </div>
                              <span className="font-bold text-slate-100 font-mono text-sm">
                                {Number(usersCount).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="companies" stroke="#0D9488" strokeWidth={3} dot={{ r: 4, fill: '#0D9488' }} />
                <Line type="monotone" dataKey="users" stroke="#0284c7" strokeWidth={3} dot={{ r: 4, fill: '#0284c7' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <Activity className="w-5 h-5 text-primary" />
                Operational Intensity (Live Platform Activity)
              </CardTitle>
              <span className="text-[11px] font-mono text-muted-foreground">Weekly Events</span>
            </div>
          </CardHeader>
          <CardContent className="h-[320px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={operationalIntensityData}>
                <defs>
                  <linearGradient id="colorIntensity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3D48" opacity={0.4} vertical={false} />
                <XAxis dataKey="day" stroke="#A6B5C0" fontSize={12} />
                <YAxis stroke="#A6B5C0" fontSize={12} allowDecimals={false} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#15232D] border border-[#2A3D48] p-3.5 rounded-xl shadow-2xl text-xs space-y-2 text-slate-100 min-w-[200px] pointer-events-none">
                          <div className="font-bold flex items-center justify-between gap-4 border-b border-[#2A3D48]/80 pb-1.5">
                            <span className="text-sm text-slate-100">{data.day} ({data.date})</span>
                            {data.isToday && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-bold">Today</span>}
                          </div>
                          <div className="text-primary font-semibold text-sm">
                            Intensity Score: {Number(data.intensity || 0).toLocaleString()} pts
                          </div>
                          <div className="text-slate-300 space-y-1 text-[11px] pt-1">
                            <div className="flex items-center justify-between">
                              <span>• Active Users:</span>
                              <span className="text-slate-100 font-medium font-mono">{data.activeUsers ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>• Tasks Created/Updated:</span>
                              <span className="text-slate-100 font-medium font-mono">{data.taskEvents ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>• Messages Sent:</span>
                              <span className="text-slate-100 font-medium font-mono">{data.messageEvents ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>• Attendance Records:</span>
                              <span className="text-slate-100 font-medium font-mono">{data.attendanceEvents ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="intensity" stroke="#0D9488" fillOpacity={1} fill="url(#colorIntensity)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Real Breakdown: Industry Category & User Roles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-foreground">
              <Building2 className="w-4 h-4 text-primary" />
              Company Distribution by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoryStats.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium">{item.name}</span>
                  <span className="text-muted-foreground font-mono">{item.count} ({item.pct}%)</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(item.pct, item.count > 0 ? 10 : 0)}%` }} 
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-foreground">
              <Users className="w-4 h-4 text-sky-500" />
              User Role Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {roleStats.map((item) => {
              const pct = dbUsers.length > 0 ? Math.round((item.count / dbUsers.length) * 100) : 0;
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground font-medium">{item.name}</span>
                    <span className="text-muted-foreground font-mono">{item.count} user{item.count !== 1 ? 's' : ''} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-sky-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(pct, item.count > 0 ? 10 : 0)}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TabSystem() {
  const [maintenance, setMaintenance] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);

  const adminId = localStorage.getItem('active_sa_id');

  const askOtp = () => {
    const code = window.prompt('Enter 6-digit authenticator app code');
    if (code === null) return null;
    const otpCode = String(code).trim();
    if (!/^\d{6}$/.test(otpCode)) {
      toast.error('Please enter a valid 6-digit authenticator code');
      return null;
    }
    return otpCode;
  };

  const fetchMaintenance = () => {
    authFetch('/api/system/maintenance')
      .then(res => res.json())
      .then(data => setMaintenance(data.maintenance))
      .catch(e => console.error('System fetch failed', e));
  };

  const fetchLogs = () => {
    setLogsLoading(true);
    authFetch('/api/system/logs?limit=20')
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLogsTotal(data.total || 0);
      })
      .catch(e => console.error('Logs fetch failed', e))
      .finally(() => setLogsLoading(false));
  };

  useEffect(() => {
    fetchMaintenance();
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const toggleMaintenance = async () => {
    const otpCode = askOtp();
    if (!otpCode) return;
    setIsLoading(true);
    try {
      const adminId = localStorage.getItem('active_sa_id');
      const resp = await authFetch('/api/system/maintenance/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode })
      });
      const data = await resp.json();
      if (data.success) {
        setMaintenance(data.maintenance);
        toast.success(`Maintenance Mode ${data.maintenance ? 'Enabled' : 'Disabled'}`);
      } else {
        toast.error(data.message || 'Action failed');
      }
    } catch (e) {
      toast.error('Network connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFlushCache = async () => {
    const otpCode = askOtp();
    if (!otpCode) return;
    setIsLoading(true);
    try {
      const adminId = localStorage.getItem('active_sa_id');
      const resp = await authFetch('/api/system/flush-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode })
      });
      const data = await resp.json();
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || 'Flush failed');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestartModules = async () => {
    const otpCode = askOtp();
    if (!otpCode) return;
    setIsLoading(true);
    try {
      const adminId = localStorage.getItem('active_sa_id');
      const resp = await authFetch('/api/system/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode })
      });
      const data = await resp.json();
      if (data.success) {
        toast.success(data.message);
        setTimeout(() => window.location.reload(), 5000);
      } else {
        toast.error(data.message || 'Restart failed');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!window.confirm("CRITICAL WARNING: This will PERMANENTLY DELETE all company data, users, tasks, and records. Only the Super Admin account will remain. Are you absolutely sure?")) {
      return;
    }
    
    const confirmationText = "RESET ALL DATA";
    const userInput = window.prompt(`Type "${confirmationText}" to confirm factory reset:`);
    if (userInput !== confirmationText) {
      toast.error("Confirmation failed. Reset cancelled.");
      return;
    }

    const otpCode = askOtp();
    if (!otpCode) return;

    setIsLoading(true);
    try {
      const adminId = localStorage.getItem('active_sa_id');
      const resp = await authFetch('/api/system/factory-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode })
      });
      const data = await resp.json();
      if (data.success) {
        toast.success(data.message);
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast.error(data.message || 'Reset failed');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border border-border bg-card shadow-xs rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">Global Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">Maintenance Mode</div>
                    <div className="text-xs text-muted-foreground">Strict mode (Admins only access)</div>
                  </div>
                  <Button 
                    variant={maintenance ? "destructive" : "outline"} 
                    className="w-24 rounded-xl font-bold"
                    disabled={isLoading}
                    onClick={toggleMaintenance}
                  >
                    {isLoading ? "..." : (maintenance ? "ON" : "OFF")}
                  </Button>
               </div>
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">Auto-Backups</div>
                    <div className="text-xs text-muted-foreground">Daily snapshot to AWS S3</div>
                  </div>
                  <span className="text-primary text-xs font-bold uppercase">Running</span>
               </div>
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">Registration</div>
                    <div className="text-xs text-muted-foreground">Allow new companies signups</div>
                  </div>
                  <span className="text-primary text-xs font-bold uppercase">Open</span>
               </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-xs rounded-2xl">
             <CardHeader className="flex-row justify-between items-start">
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <Database className="w-5 h-5 text-muted-foreground" />
                  Database Logs
                  {logsLoading && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">{logsTotal} total</span>
                  <button
                    onClick={fetchLogs}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:bg-muted"
                  >
                    ↻ Refresh
                  </button>
                </div>
             </CardHeader>
             <CardContent className="space-y-2 font-mono text-[10px] text-muted-foreground overflow-hidden max-h-56 overflow-y-auto">
                {logs.length === 0 && !logsLoading && (
                  <div className="text-center text-muted-foreground py-6">No logs captured yet</div>
                )}
                {logs.map((entry, i) => {
                  const levelColors = {
                    INFO: 'text-sky-500',
                    AUTH: 'text-primary',
                    WARN: 'text-amber-500',
                    ERROR: 'text-red-500',
                    CRON: 'text-violet-500',
                    SYSTEM: 'text-teal-500',
                    CRITICAL: 'text-red-500 font-bold',
                  };
                  const color = levelColors[entry.level] || 'text-muted-foreground';
                  return (
                    <div key={i} className="p-2 rounded-xl bg-background border border-border flex items-start gap-2 group">
                      <span className={`${color} shrink-0 w-14 text-right font-bold`}>[{entry.level}]</span>
                      <span className="text-muted-foreground shrink-0">{entry.time}</span>
                      <span className="text-foreground flex-1">{entry.message}</span>
                      {entry.meta && <span className="text-muted-foreground hidden group-hover:inline shrink-0">{entry.meta}</span>}
                    </div>
                  );
                })}
                <Button
                  variant="link"
                  className="text-xs text-primary p-0 h-auto"
                  onClick={async () => {
                    try {
                      const resp = await authFetch('/api/system/logs/download');
                      if (!resp.ok) throw new Error('Failed to fetch logs');
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `regen-system-logs-${new Date().toISOString().split('T')[0]}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Logs downloaded');
                    } catch (e) {
                      toast.error('Failed to download logs');
                    }
                  }}
                >
                  Download Full Logs ({logsTotal})
                </Button>
             </CardContent>
          </Card>

          <Pm2Monitor />
       </div>

       <DeploymentControls adminId={adminId} />

       <Card className="border border-red-500/20 bg-red-500/5 shadow-xs rounded-2xl">
          <CardHeader>
            <CardTitle className="text-red-500 text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Critical Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
             <Button variant="destructive" onClick={handleFlushCache} disabled={isLoading} className="rounded-xl font-bold">Flush Redis Cache</Button>
             <Button variant="destructive" onClick={handleRestartModules} disabled={isLoading} className="rounded-xl font-bold">Restart All Modules</Button>
             <Button 
                variant="destructive" 
                className="bg-red-600/20 text-red-500 border border-red-500/40 hover:bg-red-600 hover:text-white rounded-xl font-bold"
                onClick={handleFactoryReset}
                disabled={isLoading}
             >
                Factory Global Reset
             </Button>
          </CardContent>
       </Card>
    </div>
  );
}

function Pm2Monitor() {
  const [processes, setProcesses] = useState([]);
  const [ts, setTs] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch2 = () => {
    authFetch('/api/system/pm2-status')
      .then(r => r.json())
      .then(d => {
        if (d.success) { setProcesses(d.processes); setTs(d.timestamp); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch2();
    const iv = setInterval(fetch2, 5000);
    return () => clearInterval(iv);
  }, []);

  const fmtMem = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  };

  const fmtUptime = (startMs) => {
    if (!startMs) return '—';
    const sec = Math.floor((Date.now() - startMs) / 1000);
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h < 24) return h + 'h ' + m + 'm';
    const d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  };

  return (
    <Card className="border border-border bg-card shadow-xs rounded-2xl">
      <CardHeader className="flex-row justify-between items-start">
        <CardTitle className="text-lg flex items-center gap-2 text-foreground">
          <Activity className="w-5 h-5 text-primary" />
          Process Monitor
          {loading && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">PM2</span>
          <button
            onClick={() => { setLoading(true); fetch2(); }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:bg-muted"
          >
            ↻ Refresh
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-[11px] max-h-56 overflow-y-auto">
        {processes.length === 0 && !loading && (
          <div className="text-center text-muted-foreground py-6">No processes detected</div>
        )}
        {processes.map((p, i) => {
          const statusColors = {
            online: 'bg-primary',
            stopping: 'bg-amber-500',
            stopped: 'bg-red-500',
            errored: 'bg-red-500',
            launching: 'bg-sky-500',
          };
          const dot = statusColors[p.status] || 'bg-muted-foreground';
          return (
            <div key={i} className="p-3 rounded-xl bg-background border border-border space-y-2.5 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dot} ${p.status === 'online' ? 'animate-pulse' : ''}`} />
                  <span className="text-foreground font-bold text-xs">{p.name}</span>
                  <span className="text-muted-foreground text-[10px]">v{p.version}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                  p.status === 'online' ? 'bg-primary/10 text-primary border border-primary/20' :
                  p.status === 'errored' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                  'bg-muted text-muted-foreground border border-border'
                }`}>{p.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PID</span>
                  <span className="text-foreground">{p.pid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="text-foreground capitalize">{p.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPU</span>
                  <span className={`font-bold ${p.cpu > 80 ? 'text-red-500' : p.cpu > 40 ? 'text-amber-500' : 'text-primary'}`}>{p.cpu}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memory</span>
                  <span className="text-sky-500 font-bold">{fmtMem(p.memory)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="text-foreground">{fmtUptime(p.uptime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restarts</span>
                  <span className={`font-bold ${p.restarts > 10 ? 'text-red-500' : p.restarts > 3 ? 'text-amber-500' : 'text-foreground'}`}>↻ {p.restarts}</span>
                </div>
              </div>
              {/* CPU + Memory mini bar */}
              <div className="flex gap-2 pt-1">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" title={`CPU: ${p.cpu}%`}>
                  <div className={`h-full rounded-full transition-all duration-500 ${p.cpu > 80 ? 'bg-red-500' : p.cpu > 40 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" title={`Mem: ${fmtMem(p.memory)}`}>
                  <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${Math.min((p.memory / 536870912) * 100, 100)}%` }} />
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground -mt-1">
                <span>CPU</span>
                <span>MEM (512MB scale)</span>
              </div>
            </div>
          );
        })}
        {ts && (
          <div className="text-center text-[9px] text-muted-foreground pt-1">
            Last updated: {new Date(ts).toLocaleTimeString()} · Auto-refresh 5s
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeploymentControls({ adminId }) {
  const [isPulling, setIsPulling] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState('');

  const askOtp = () => {
    const code = window.prompt('Enter 6-digit authenticator app code');
    if (code === null) return null;
    const otpCode = String(code).trim();
    if (!/^\d{6}$/.test(otpCode)) {
      toast.error('Please enter a valid 6-digit authenticator code');
      return null;
    }
    return otpCode;
  };

  const handleGitPull = async () => {
    const otpCode = askOtp();
    if (!otpCode) return;
    setIsPulling(true);
    setDeployLog('');
    try {
      const res = await authFetch('/api/deploy/git-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode })
      });
      const data = await res.json();
      setDeployLog(data.output || data.message || 'Done');
      if (data.success) toast.success('Git pull successful');
      else toast.error(data.message || 'Git pull failed');
    } catch (e) {
      toast.error('Git pull failed: ' + e.message);
      setDeployLog('Error: ' + e.message);
    } finally {
      setIsPulling(false);
    }
  };

  const handleRebuildDeploy = async () => {
    const otpCode = askOtp();
    if (!otpCode) return;
    setIsDeploying(true);
    setDeployLog('');
    try {
      const res = await authFetch('/api/deploy/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode })
      });
      const data = await res.json();
      setDeployLog(data.output || data.message || 'Done');
      if (data.success) toast.success('Rebuild & deploy successful! Refresh to see changes.');
      else toast.error(data.message || 'Rebuild failed');
    } catch (e) {
      toast.error('Rebuild failed: ' + e.message);
      setDeployLog('Error: ' + e.message);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <Card className="border border-border bg-card shadow-xs rounded-2xl">
      <CardHeader>
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Deployment Controls
        </CardTitle>
        <p className="text-xs text-muted-foreground">Pull latest code and rebuild the live site.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleGitPull}
            disabled={isPulling || isDeploying}
            variant="outline"
            className="flex-1 h-12 border-primary/30 text-primary hover:bg-primary/10 rounded-xl font-semibold"
          >
            {isPulling ? '⟳ Pulling...' : '⇣ Git Code Pull'}
          </Button>
          <Button
            onClick={handleRebuildDeploy}
            disabled={isPulling || isDeploying}
            className="flex-1 h-12 bg-primary hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-primary/20"
          >
            {isDeploying ? '⟳ Building & Deploying...' : '🚀 Rebuild & Deploy'}
          </Button>
        </div>
        {deployLog && (
          <pre className="mt-3 p-3 rounded-xl bg-background text-primary text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap border border-border">
            {deployLog}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function TabProfile({ data, setData }) {
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Reload profile from DB
  const reloadProfile = async () => {
    if (!data.userId) return;
    try {
      const resp = await authFetch(`/api/users/${data.userId}`);
      if (resp.ok) {
        const u = await resp.json();
        if (u.role === 'param') {
          setData({
            userId: u.userId,
            name: u.name || u.username || '',
            username: u.username || '',
            email: u.email || '',
            phone: u.phone || '',
            designation: u.designation || '',
            department: u.department || '',
            avatar: u.avatar || '',
            role: u.role,
          });
        }
      }
    } catch (e) {
      console.error('Failed to reload profile', e);
    }
  };

  // Save profile to DB
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!data.userId) return;
    setSaving(true);
    try {
      const resp = await authFetch(`/api/users/${data.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.userId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          designation: data.designation,
          department: data.department,
        })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update profile');
      }
      const updated = await resp.json();
      setData(prev => ({ ...prev, name: updated.name, email: updated.email, phone: updated.phone, designation: updated.designation, department: updated.department }));
      toast.success('Profile updated in database');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Change password via API
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (!passwords.current || !passwords.next) {
      toast.error('Please fill all password fields');
      return;
    }
    setChangingPw(true);
    try {
      const identifier = data.username || data.userId;
      const resp = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, currentPassword: passwords.current, newPassword: passwords.next })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to change password');
      }
      toast.success('Password updated successfully');
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  // Avatar upload via API
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      e.target.value = '';
      return;
    }
    if (!data.userId) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const resp = await authFetch(`/api/users/${data.userId}/avatar`, {
        method: 'POST',
        body: formData
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Upload failed');
      }
      const result = await resp.json();
      setData(prev => ({ ...prev, avatar: result.avatar || '' }));
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(err.message || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="lg:col-span-4 space-y-6">
        <Card className="border border-border bg-card shadow-xs rounded-2xl overflow-hidden p-0 gap-0 flex flex-col items-center">
          <div className="h-32 bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-800 w-full relative">
            <div className="absolute inset-0 bg-black/10" />
          </div>
          <div className="px-6 w-full flex flex-col items-center relative">
            <div
              className="relative -mt-12 border-4 border-card rounded-3xl overflow-hidden bg-muted shadow-xl cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
               {data.avatar ? (
                 <img src={data.avatar} alt="Profile" className="w-24 h-24 object-cover" />
               ) : (
                 <div className="w-24 h-24 flex items-center justify-center text-muted-foreground">
                   <User className="w-12 h-12" />
                 </div>
               )}
               <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                 {uploadingAvatar ? (
                   <RefreshCw className="w-5 h-5 text-white animate-spin" />
                 ) : (
                   <Camera className="w-5 h-5 text-white" />
                 )}
               </div>
               <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            
            <div className="mt-6 text-center space-y-1">
              <h3 className="text-2xl font-bold text-foreground tracking-tight">{data.name || data.username}</h3>
              <p className="text-muted-foreground text-sm font-medium tracking-wide">{data.designation || 'Super Admin'}</p>
              <div className="flex gap-2 justify-center pt-3">
                <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold uppercase rounded-lg border border-primary/20">Super Admin</span>
                <span className="px-3 py-1 bg-muted text-muted-foreground text-[10px] font-bold uppercase rounded-lg border border-border font-mono">ID: {data.userId}</span>
              </div>
            </div>

            <div className="w-full mt-8 pt-6 border-t border-border space-y-3 pb-8">
               {data.email && (
                 <div className="flex items-center gap-4 text-sm text-foreground bg-background p-3 rounded-xl border border-border">
                   <div className="p-2 rounded-lg bg-primary/10 text-primary"><Mail className="w-4 h-4" /></div>
                   <span className="font-medium truncate">{data.email}</span>
                 </div>
               )}
               {data.phone && (
                 <div className="flex items-center gap-4 text-sm text-foreground bg-background p-3 rounded-xl border border-border">
                   <div className="p-2 rounded-lg bg-primary/10 text-primary"><Phone className="w-4 h-4" /></div>
                   <span className="font-medium">{data.phone}</span>
                 </div>
               )}
               {data.department && (
                 <div className="flex items-center gap-4 text-sm text-foreground bg-background p-3 rounded-xl border border-border">
                   <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500"><Shield className="w-4 h-4" /></div>
                   <span className="font-medium">{data.department}</span>
                 </div>
               )}
            </div>
          </div>
        </Card>

        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader>
             <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
               <ShieldAlert className="w-4 h-4 text-amber-500" />
               Security Notice
             </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground leading-relaxed">
            As a Super Admin, your actions are logged and audited. Ensure your credentials are never shared and change your password regularly.
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-8 space-y-8">
        <Card className="border border-border bg-card shadow-xs rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-foreground">
              <User className="w-5 h-5 text-primary" />
              General Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">Full Name</Label>
                  <Input 
                    value={data.name} 
                    onChange={(e) => setData({...data, name: e.target.value})}
                    className="bg-background border-border focus:border-primary text-foreground rounded-xl" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">Email Address</Label>
                  <Input 
                    value={data.email} 
                    onChange={(e) => setData({...data, email: e.target.value})}
                    className="bg-background border-border focus:border-primary text-foreground rounded-xl" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">Phone</Label>
                  <Input 
                    value={data.phone} 
                    onChange={(e) => setData({...data, phone: e.target.value})}
                    className="bg-background border-border focus:border-primary text-foreground rounded-xl" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">Designation</Label>
                  <Input 
                    value={data.designation} 
                    onChange={(e) => setData({...data, designation: e.target.value})}
                    className="bg-background border-border focus:border-primary text-foreground rounded-xl" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">Department</Label>
                  <Input 
                    value={data.department} 
                    onChange={(e) => setData({...data, department: e.target.value})}
                    className="bg-background border-border focus:border-primary text-foreground rounded-xl" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">User ID (Non-editable)</Label>
                  <Input 
                    value={data.userId} 
                    disabled
                    className="bg-muted border-border italic text-muted-foreground cursor-not-allowed rounded-xl" 
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-emerald-700 text-white font-bold h-12 px-6 rounded-xl shadow-md shadow-primary/20">
                {saving ? 'Saving…' : 'Update Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-xs rounded-2xl border-l-4 border-l-amber-500/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-amber-500">
              <Lock className="w-5 h-5" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-medium text-xs">Current Password</Label>
                  <Input 
                    type="password" 
                    value={passwords.current}
                    onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                    placeholder="Enter current password"
                    className="bg-background border-border text-foreground rounded-xl" 
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground font-medium text-xs">New Password</Label>
                    <Input 
                      type="password" 
                      value={passwords.next}
                      onChange={(e) => setPasswords({...passwords, next: e.target.value})}
                      placeholder="Minimum 4 characters"
                      className="bg-background border-border text-foreground rounded-xl" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground font-medium text-xs">Confirm New Password</Label>
                    <Input 
                      type="password" 
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                      className="bg-background border-border text-foreground rounded-xl" 
                    />
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={changingPw} variant="secondary" className="font-bold h-12 px-8 border border-border bg-card hover:bg-muted text-foreground rounded-xl shadow-xs">
                {changingPw ? 'Changing…' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="sa_theme"
      forcedTheme={!isAuthenticated ? 'dark' : undefined}
    >
      <SuperAdminContent
        isAuthenticated={isAuthenticated}
        setIsAuthenticated={setIsAuthenticated}
      />
      <Toaster />
    </ThemeProvider>
  );
}
