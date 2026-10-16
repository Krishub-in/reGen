import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { 
  Building2, Users, CreditCard, TrendingUp, Settings, ShieldAlert, LogOut, 
  CheckCircle, XCircle, Search, Filter, ShieldCheck, Activity, Database, Plus,
  UserCog, Lock, Mail, User, Shield, Camera, MapPin, Pencil, Trash2, RefreshCw, Phone, Ban, Unlock, Copy, Download, Home, Eye, EyeOff
} from 'lucide-react';
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
import { Menu } from 'lucide-react';

// Mock Data
const MOCK_COMPANIES = [
  { id: '1', name: 'Krishub Innovations', users: 45, plan: 'Gold', status: 'active', revenue: 12000, joined: '2025-01-10' },
  { id: '2', name: 'TechNexus corp', users: 12, plan: 'Silver', status: 'active', revenue: 5000, joined: '2025-02-15' },
  { id: '3', name: 'Global Logistics', users: 89, plan: 'Enterprise', status: 'active', revenue: 54000, joined: '2024-11-20' },
  { id: '4', name: 'Creative Studio', users: 5, plan: 'Basic', status: 'inactive', revenue: 800, joined: '2025-03-01' },
  { id: '5', name: 'Swift Solutions', users: 22, plan: 'Gold', status: 'active', revenue: 8500, joined: '2025-01-25' },
];

const MOCK_USERS = [
  { id: 'u1', name: 'John Doe', email: 'john@krishub.in', company: 'Krishub Innovations', role: 'Staff', status: 'active' },
  { id: 'u2', name: 'Jane Smith', email: 'jane@technexus.com', company: 'TechNexus corp', role: 'Admin', status: 'active' },
  { id: 'u3', name: 'Robert Brown', email: 'robert@global.com', company: 'Global Logistics', role: 'Owner', status: 'suspended' },
  { id: 'u4', name: 'Alice Wong', email: 'alice@creative.io', company: 'Creative Studio', role: 'Freelancer', status: 'active' },
];

const REVENUE_DATA = [
  { month: 'Jan', revenue: 45000, growth: 12 },
  { month: 'Feb', revenue: 52000, growth: 15 },
  { month: 'Mar', revenue: 61000, growth: 18 },
  { month: 'Apr', revenue: 58000, growth: -5 },
  { month: 'May', revenue: 72000, growth: 24 },
  { month: 'Jun', revenue: 85000, growth: 18 },
];

const GROWTH_DATA = [
  { day: 'Mon', active: 120 },
  { day: 'Tue', active: 150 },
  { day: 'Wed', active: 180 },
  { day: 'Thu', active: 170 },
  { day: 'Fri', active: 210 },
  { day: 'Sat', active: 90 },
  { day: 'Sun', active: 60 },
];

export default function SuperAdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
        if (dbUser.role !== 'param') throw new Error('Not a superadmin');
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
      const [uResp, cResp] = await Promise.all([
        authFetch('/api/users'),
        authFetch('/api/company')
      ]);
      if (uResp.ok) setDbUsers(await uResp.json());
      if (cResp.ok) {
        const coData = await cResp.json();
        // Backend returns single object or array depending on structure. normalize.
        setDbCompanies(Array.isArray(coData) ? coData : (coData ? [coData] : []));
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
      if (user.role === 'param') {
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
            if (dbUser.role === 'param') {
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
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,30,60,0.5),transparent)] pointer-events-none" />
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
              <ShieldCheck className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-white">Super Admin Access</CardTitle>
            <p className="text-sm text-zinc-400">Enter your credentials to manage the platform</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="saAdminId" className="text-sm font-medium text-zinc-300">Admin ID</label>
                <Input 
                  id="saAdminId"
                  name="adminId"
                  placeholder="ID" 
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                  value={loginForm.id}
                  onChange={(e) => setLoginForm({ ...loginForm, id: e.target.value })}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="saPassword" className="text-sm font-medium text-zinc-300">Security Password</label>
                <div className="relative">
                  <Input 
                    id="saPassword"
                    name="password"
                    type={showSaPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 pr-10"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSaPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                  >
                    {showSaPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full py-6 text-lg font-semibold shadow-lg shadow-primary/20">
                Authenticate & Connect
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 flex overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-72 border-r border-zinc-800 bg-zinc-900/30 flex-col pt-8">
        <div className="px-6 mb-10 flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight">reGen Central</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Platform Control</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <SidebarItem active={activeTab === 'dashboard'} icon={Activity} label="Dashboard" onClick={() => setActiveTab('dashboard')} />
          <SidebarItem active={activeTab === 'companies'} icon={Building2} label="Companies" onClick={() => setActiveTab('companies')} />
          <SidebarItem active={activeTab === 'users'} icon={Users} label="Global Users" onClick={() => setActiveTab('users')} />
          <SidebarItem active={activeTab === 'payments'} icon={CreditCard} label="Payments" onClick={() => setActiveTab('payments')} />
          <SidebarItem active={activeTab === 'analytics'} icon={TrendingUp} label="Analytics" onClick={() => setActiveTab('analytics')} />
          <SidebarItem active={activeTab === 'system'} icon={Settings} label="System Control" onClick={() => setActiveTab('system')} />
          <div className="pt-4 mt-4 border-t border-zinc-800/50 space-y-1">
            <SidebarItem active={activeTab === 'profile'} icon={UserCog} label="Account Profile" onClick={() => setActiveTab('profile')} />
            <SidebarItem active={false} icon={Home} label="Switch to EMS App" onClick={() => window.location.href = '/?view=ems'} />
          </div>
        </nav>

        <div className="p-6 border-t border-zinc-800">
          <Button variant="ghost" className="w-full flex justify-start gap-3 text-zinc-400 hover:text-red-400 hover:bg-red-400/10" onClick={() => { localStorage.removeItem('sa_auth_token'); localStorage.removeItem('auth_token'); localStorage.removeItem('active_sa_id'); setIsAuthenticated(false); }}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(24,24,27,1),rgba(9,9,11,1))] p-6 lg:p-10 pb-0">
          <header className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-4">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden text-zinc-400">
                    <Menu className="w-6 h-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 bg-zinc-950 border-r-zinc-800 p-0 flex flex-col">
                  <div className="px-6 py-8 mb-4 flex items-center gap-3 border-b border-zinc-800/50">
                    <div className="bg-primary p-2 rounded-xl">
                      <ShieldCheck className="w-6 h-6 text-black" />
                    </div>
                    <div>
                      <h1 className="font-bold text-xl tracking-tight text-white">reGen Central</h1>
                    </div>
                  </div>
                  <nav className="flex-1 px-4 space-y-2">
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
                      <SidebarItem active={activeTab === 'payments'} icon={CreditCard} label="Payments" onClick={() => setActiveTab('payments')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'analytics'} icon={TrendingUp} label="Analytics" onClick={() => setActiveTab('analytics')} />
                    </SheetClose>
                    <SheetClose asChild>
                      <SidebarItem active={activeTab === 'system'} icon={Settings} label="System Control" onClick={() => setActiveTab('system')} />
                    </SheetClose>
                    <div className="pt-4 mt-4 border-t border-zinc-800/50">
                      <SheetClose asChild>
                        <SidebarItem active={activeTab === 'profile'} icon={UserCog} label="Account Profile" onClick={() => setActiveTab('profile')} />
                      </SheetClose>
                    </div>
                  </nav>
                  <div className="p-6 border-t border-zinc-800">
                    <SheetClose asChild>
                      <Button variant="ghost" className="w-full flex justify-start gap-3 text-zinc-400 hover:text-red-400 hover:bg-red-400/10" onClick={() => { localStorage.removeItem('sa_auth_token'); localStorage.removeItem('auth_token'); localStorage.removeItem('active_sa_id'); setIsAuthenticated(false); }}>
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </Button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
              <div>
                <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white capitalize">{activeTab}</h2>
                <p className="text-zinc-500 text-sm hidden lg:block">System oversight for reGen Innovations Inc.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 px-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center gap-2 hidden md:flex">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">System Live</span>
              </div>
              <div className="bg-zinc-800 h-10 w-10 rounded-xl overflow-hidden border border-zinc-700 flex items-center justify-center">
                 {profileData.avatar ? (
                   <img src={profileData.avatar} alt="Super Admin" className="w-full h-full object-cover" />
                 ) : (
                   <User className="w-5 h-5 text-zinc-500" />
                 )}
              </div>
            </div>
          </header>

          {activeTab === 'dashboard' && <TabDashboard dbUsers={dbUsers} dbCompanies={dbCompanies} />}
          {activeTab === 'companies' && <TabCompanies dbCompanies={dbCompanies} searchTerm={searchTerm} onRefresh={fetchRealData} />}
          {activeTab === 'users' && <TabUsers dbUsers={dbUsers} searchTerm={searchTerm} />}
          {activeTab === 'payments' && <TabPayments />}
          {activeTab === 'analytics' && <TabAnalytics />}
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
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-primary text-black font-semibold shadow-lg shadow-primary/20' 
          : 'text-zinc-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className={`w-5 h-5 ${active ? 'text-black' : 'text-inherit'}`} />
      <span className="text-sm">{label}</span>
    </button>
  );
}

// --- TAB COMPONENTS ---

function TabDashboard({ dbUsers, dbCompanies }) {
  const activeCount = dbUsers.filter(u => u.status === 'active').length;
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Companies" value={dbCompanies.length} icon={Building2} trend="+0% from last month" color="emerald" />
        <StatCard title="Active Users" value={activeCount} icon={Users} trend={`Total ${dbUsers.length}`} color="blue" />
        <StatCard title="Total Revenue" value="$0" icon={CreditCard} trend="Experimental" color="purple" />
        <StatCard title="Success Rate" value="100%" icon={TrendingUp} trend="System stability" color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Revenue Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="month" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Weekly Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={GROWTH_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="day" stroke="#71717a" fontSize={10} />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}
                />
                <Bar dataKey="active" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
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
    emerald: 'text-emerald-400 bg-emerald-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-sm group hover:border-zinc-700 transition-colors">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl ${colors[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Metrics</span>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
          <div className="text-3xl font-bold text-white">{value}</div>
        </div>
        <p className="mt-4 text-xs text-zinc-500 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          {trend}
        </p>
      </CardContent>
    </Card>
  );
}

function TabCompanies({ dbCompanies, searchTerm, onRefresh }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
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

  const filtered = dbCompanies.filter(co => {
    const term = localSearch.toLowerCase();
    return !term || 
      co.name?.toLowerCase().includes(term) || 
      co._id?.toLowerCase().includes(term) ||
      co.category?.toLowerCase().includes(term) ||
      co.city?.toLowerCase().includes(term);
  });

  const openEdit = (company) => {
    setEditingCompany(company);
    setEditFormData({
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
    if (!editFormData.name || !editFormData.phoneNumber || !editFormData.city || !editFormData.category) {
      toast.error('Please fill all required fields (*)');
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
    if (!formData.name || !formData.phoneNumber || !formData.city || !formData.category) {
      toast.error('Please fill all required fields (*)');
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

  const CompanyFormFields = ({ data, setData }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
      <div className="relative group">
        <Input 
          placeholder="GST No (Optional)" 
          value={data.gst}
          onChange={(e) => setData({...data, gst: e.target.value})}
          className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl pr-20 focus:border-primary/50 transition-all placeholder:text-zinc-600"
        />
        <button 
          type="button"
          onClick={() => {
            if (!data.gst) return;
            toast.success('GST validated successfully');
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-semibold text-sm hover:text-primary/80 transition-colors"
        >
          Validate
        </button>
      </div>
      <Input 
        placeholder="Company Name *" 
        value={data.name}
        onChange={(e) => setData({...data, name: e.target.value})}
        className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
      />
      <Input 
        placeholder="Phone Number *" 
        value={data.phoneNumber}
        onChange={(e) => setData({...data, phoneNumber: e.target.value})}
        className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
      />
      <Input 
        placeholder="Email (Optional)" 
        value={data.email}
        onChange={(e) => setData({...data, email: e.target.value})}
        className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
      />
      <Select 
        onValueChange={(val) => setData({...data, category: val})}
        value={data.category}
      >
        <SelectTrigger className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all text-zinc-300">
          <SelectValue placeholder="Select Category *" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
          <SelectItem value="it">IT Solutions</SelectItem>
          <SelectItem value="logistics">Logistics</SelectItem>
          <SelectItem value="manufacturing">Manufacturing</SelectItem>
          <SelectItem value="retail">Retail</SelectItem>
          <SelectItem value="healthcare">Healthcare</SelectItem>
        </SelectContent>
      </Select>
      <Input 
        placeholder="Brief Description (Optional)" 
        value={data.about}
        onChange={(e) => setData({...data, about: e.target.value})}
        className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
      />
      <div className="md:col-span-2">
        <Textarea 
          placeholder="Full Street Address (Optional)" 
          value={data.address}
          onChange={(e) => setData({...data, address: e.target.value})}
          className="min-h-[120px] bg-zinc-900/40 border-zinc-800/50 rounded-2xl resize-none p-4 focus:border-primary/40 focus:bg-zinc-900/60 transition-all placeholder:text-zinc-600 outline-none ring-0"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 md:col-span-2 gap-4">
        <Input 
          placeholder="City *" 
          value={data.city}
          onChange={(e) => setData({...data, city: e.target.value})}
          className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
        />
        <Input 
          placeholder="State" 
          value={data.state}
          onChange={(e) => setData({...data, state: e.target.value})}
          className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
        />
        <Input 
          placeholder="Zip Code" 
          value={data.zip}
          onChange={(e) => setData({...data, zip: e.target.value})}
          className="h-14 bg-zinc-900/50 border-zinc-800 rounded-xl focus:border-primary/50 transition-all placeholder:text-zinc-600"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input 
            placeholder="Search companies by name, ID, category..." 
            className="pl-10 bg-zinc-950 border-zinc-800"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-black hover:bg-primary/90 font-bold shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" /> Add Company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-zinc-800/50 bg-zinc-950/80 backdrop-blur-2xl text-white p-0 overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <div className="bg-gradient-to-b from-primary/5 to-transparent px-8 py-10">
                <DialogHeader>
                  <DialogTitle className="text-4xl font-extrabold text-center mb-12 tracking-tighter bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
                    Company Registration
                  </DialogTitle>
                </DialogHeader>
                <CompanyFormFields data={formData} setData={setFormData} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                  <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-14 rounded-2xl text-zinc-400 hover:bg-white/5 font-semibold">
                    Cancel
                  </Button>
                  <Button variant="outline" onClick={(e) => handleSubmit(e, true)} className="h-14 border-zinc-800 bg-white/5 text-zinc-300 font-semibold rounded-2xl hover:bg-white/10">
                    Add & Continue
                  </Button>
                  <Button onClick={(e) => handleSubmit(e, false)} className="h-14 bg-primary text-black font-extrabold text-lg rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                    Add Company
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Company Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingCompany(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-zinc-800/50 bg-zinc-950/80 backdrop-blur-2xl text-white p-0 overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="bg-gradient-to-b from-blue-500/5 to-transparent px-8 py-10">
            <DialogHeader>
              <DialogTitle className="text-4xl font-extrabold text-center mb-12 tracking-tighter bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
                Edit Company
              </DialogTitle>
            </DialogHeader>
            <CompanyFormFields data={editFormData} setData={setEditFormData} />
            <div className="grid grid-cols-2 gap-6 mt-12">
              <Button variant="ghost" onClick={() => setEditDialogOpen(false)} className="h-14 rounded-2xl text-zinc-400 hover:bg-white/5 font-semibold">
                Cancel
              </Button>
              <Button onClick={handleEditSubmit} className="h-14 bg-primary text-black font-extrabold text-lg rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow className="hover:bg-transparent border-zinc-800">
                <TableHead className="text-zinc-400 h-14">Company Name</TableHead>
                <TableHead className="text-zinc-400 h-14">Category</TableHead>
                <TableHead className="text-zinc-400 h-14">Contact</TableHead>
                <TableHead className="text-zinc-400 h-14">Location</TableHead>
                <TableHead className="text-zinc-100 h-14 text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((co, idx) => (
                <TableRow key={co._id || idx} className="border-zinc-800 hover:bg-white/5 transition-colors">
                  <TableCell className="font-semibold py-4">
                    <div>{co.name || 'Unnamed Company'}</div>
                    <div className="text-[10px] text-zinc-500 font-normal">ID: {co._id}</div>
                    {co.gst && <div className="text-[10px] text-zinc-500 font-normal">GST: {co.gst}</div>}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs font-medium">
                      {getCategoryLabel(co.category)}
                    </span>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    <div>{co.phoneNumber || '—'}</div>
                    {co.email && <div className="text-[11px] text-zinc-500">{co.email}</div>}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    {[co.city, co.state].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex items-center justify-end gap-1">
                      {co.status === 'blocked' ? (
                        <span className="mr-2 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase">Blocked</span>
                      ) : (
                        <span className="mr-2 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">Active</span>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-yellow-400 hover:bg-yellow-400/10" onClick={() => handleResetOwnerPassword(co)} title="Reset Owner Password">
                        <Lock className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10" onClick={() => openEdit(co)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className={`h-8 w-8 p-0 ${co.status === 'blocked' ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10' : 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'}`}
                        onClick={() => openOtpDialog(co)}
                        title={co.status === 'blocked' ? 'Unblock' : 'Block'}
                      >
                        {co.status === 'blocked' ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400 hover:bg-red-400/10" onClick={() => openDeleteDialog(co)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-zinc-500">No companies found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credentials Result Dialog */}
      <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
        <DialogContent className="max-w-md border-zinc-800/50 bg-zinc-950/90 backdrop-blur-2xl text-white p-0 overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="px-8 py-10">
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold text-center mb-2 tracking-tight">
                <span className="flex items-center justify-center gap-2 text-emerald-400"><CheckCircle className="w-6 h-6" /> Company Created</span>
              </DialogTitle>
            </DialogHeader>
            {credentialResult && (
              <div className="mt-4 space-y-5">
                <p className="text-center text-zinc-400 text-sm">
                  <span className="text-white font-semibold">{credentialResult.companyName}</span> has been registered.
                  {credentialResult.email ? ' Owner credentials:' : ''}
                </p>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Username</p>
                      <p className="text-white font-mono font-bold text-lg mt-0.5">{credentialResult.username}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white" onClick={() => { navigator.clipboard.writeText(credentialResult.username); toast.success('Username copied'); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="border-t border-zinc-800" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Temporary Password</p>
                      <p className="text-white font-mono font-bold text-lg mt-0.5">{credentialResult.password}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white" onClick={() => { navigator.clipboard.writeText(credentialResult.password); toast.success('Password copied'); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${credentialResult.emailSent ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <span>{credentialResult.emailSent ? `Credentials sent to ${credentialResult.email}` : (credentialResult.emailNote || 'Email not sent')}</span>
                </div>
                <p className="text-[11px] text-zinc-600 text-center">The owner must change this password on first login.</p>
                <Button onClick={() => setCredDialogOpen(false)} className="w-full h-12 bg-primary text-black font-bold rounded-xl mt-2">
                  Done
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* OTP Verification Dialog for Block/Unblock */}
      <Dialog open={otpDialogOpen} onOpenChange={(open) => { setOtpDialogOpen(open); if (!open) { setOtpTarget(null); setOtpCode(''); } }}>
        <DialogContent className="max-w-md border-zinc-800/50 bg-zinc-950/90 backdrop-blur-2xl text-white p-0 overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="px-8 py-10">
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold text-center mb-2 tracking-tight">
                {otpTarget?.status === 'blocked' ? (
                  <span className="flex items-center justify-center gap-2 text-emerald-400"><Unlock className="w-6 h-6" /> Unblock Company</span>
                ) : (
                  <span className="flex items-center justify-center gap-2 text-red-400"><Ban className="w-6 h-6" /> Block Company</span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="text-center text-zinc-400 text-sm mt-2 mb-6">
              <span className="text-white font-semibold">{otpTarget?.name}</span>
              <p className="mt-2 text-xs text-zinc-500">Enter the 6-digit code from your Google Authenticator app to confirm this action.</p>
            </div>
            <div className="flex justify-center mb-6">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-48 h-16 text-center text-3xl font-mono tracking-[0.5em] bg-zinc-900/50 border-zinc-700 rounded-2xl focus:border-primary/50"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="ghost" onClick={() => setOtpDialogOpen(false)} className="h-12 rounded-xl text-zinc-400 hover:bg-white/5 font-semibold">
                Cancel
              </Button>
              <Button
                onClick={handleToggleStatus}
                disabled={otpLoading || otpCode.length !== 6}
                className={`h-12 font-bold rounded-xl ${otpTarget?.status === 'blocked' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
              >
                {otpLoading ? 'Verifying\u2026' : otpTarget?.status === 'blocked' ? 'Unblock' : 'Block'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Company OTP Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) { setDeleteTarget(null); setDeleteOtpCode(''); setDeleteResult(null); } }}>
        <DialogContent className="max-w-md border-zinc-800/50 bg-zinc-950/90 backdrop-blur-2xl text-white p-0 overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="px-8 py-10">
            {!deleteResult ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-extrabold text-center mb-2 tracking-tight">
                    <span className="flex items-center justify-center gap-2 text-red-400"><Trash2 className="w-6 h-6" /> Delete Company</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="text-center text-zinc-400 text-sm mt-2 mb-4">
                  <span className="text-white font-semibold">{deleteTarget?.name}</span>
                  <p className="mt-2 text-xs text-zinc-500">This will create a backup ZIP and then <span className="text-red-400 font-bold">permanently delete</span> all company data including users, tasks, attendance, messages, and more.</p>
                  <p className="mt-2 text-xs text-zinc-500">Enter the 6-digit code from your Authenticator app to confirm.</p>
                </div>
                <div className="flex justify-center mb-6">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={deleteOtpCode}
                    onChange={(e) => setDeleteOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-48 h-16 text-center text-3xl font-mono tracking-[0.5em] bg-zinc-900/50 border-zinc-700 rounded-2xl focus:border-primary/50"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="h-12 rounded-xl text-zinc-400 hover:bg-white/5 font-semibold">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteWithOtp}
                    disabled={deleteLoading || deleteOtpCode.length !== 6}
                    className="h-12 font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete Company'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-extrabold text-center mb-2 tracking-tight">
                    <span className="flex items-center justify-center gap-2 text-emerald-400"><CheckCircle className="w-6 h-6" /> Deleted & Backed Up</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <p className="text-center text-zinc-400 text-sm">{deleteResult.message}</p>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Backup File</p>
                    <p className="text-white font-mono text-sm break-all">{deleteResult.backup}</p>
                  </div>
                  {deleteResult.deletedCounts && (
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-1">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Deleted Records</p>
                      {Object.entries(deleteResult.deletedCounts).map(([key, count]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-zinc-400 capitalize">{key}</span>
                          <span className="text-white font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button onClick={() => { setDeleteDialogOpen(false); setDeleteResult(null); }} className="w-full h-12 bg-primary text-black font-bold rounded-xl mt-2">
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Backups Section */}
      <Card className="border-zinc-800/50 bg-zinc-950/50 backdrop-blur-2xl mt-6">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Company Backups
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchBackups} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className={`w-4 h-4 mr-2 ${backupsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-center py-6 text-zinc-500 text-sm">
              {backupsLoading ? 'Loading backups…' : 'No backups found. Backups are created automatically when a company is deleted.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800/50">
                  <TableHead className="text-zinc-400">Backup File</TableHead>
                  <TableHead className="text-zinc-400">Size</TableHead>
                  <TableHead className="text-zinc-400">Created</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.filename} className="border-zinc-800/30 hover:bg-zinc-900/30">
                    <TableCell className="font-mono text-sm text-zinc-300 break-all">{b.filename}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{(b.size / 1024).toFixed(1)} KB</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{new Date(b.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10" onClick={() => openBackupActionDialog(b, 'download')}>
                        <Download className="w-4 h-4 mr-1" /> Download
                      </Button>
                      <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10" onClick={() => openBackupActionDialog(b, 'restore')}>
                        <RefreshCw className="w-4 h-4 mr-1" /> Restore
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => openBackupActionDialog(b, 'delete-backup')}>
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Backup Action OTP Dialog (Download / Restore / Delete) */}
      <Dialog open={backupActionDialogOpen} onOpenChange={(open) => { setBackupActionDialogOpen(open); if (!open) { setBackupActionTarget(null); setBackupActionOtp(''); setBackupActionType(null); } }}>
        <DialogContent className="max-w-md border-zinc-800/50 bg-zinc-950/90 backdrop-blur-2xl text-white p-0 overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="px-8 py-10">
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold text-center mb-2 tracking-tight">
                {backupActionType === 'download' && <span className="flex items-center justify-center gap-2 text-blue-400"><Download className="w-6 h-6" /> Download Backup</span>}
                {backupActionType === 'restore' && <span className="flex items-center justify-center gap-2 text-emerald-400"><Database className="w-6 h-6" /> Restore Company</span>}
                {backupActionType === 'delete-backup' && <span className="flex items-center justify-center gap-2 text-red-400"><Trash2 className="w-6 h-6" /> Delete Backup</span>}
              </DialogTitle>
            </DialogHeader>
            <div className="text-center text-zinc-400 text-sm mt-2 mb-4">
              <p className="text-white font-mono text-xs break-all">{backupActionTarget?.filename}</p>
              {backupActionType === 'download' && <p className="mt-2 text-xs text-zinc-500">Enter the 6-digit Authenticator code to download this backup.</p>}
              {backupActionType === 'restore' && <p className="mt-2 text-xs text-zinc-500">This will restore all company data (users, tasks, attendance, messages, etc.) from this backup.</p>}
              {backupActionType === 'delete-backup' && <p className="mt-2 text-xs text-zinc-500">This will permanently delete this backup file. This action cannot be undone.</p>}
              <p className="mt-2 text-xs text-zinc-500">Enter the 6-digit Authenticator code to confirm.</p>
            </div>
            <div className="flex justify-center mb-6">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={backupActionOtp}
                onChange={(e) => setBackupActionOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-48 h-16 text-center text-3xl font-mono tracking-[0.5em] bg-zinc-900/50 border-zinc-700 rounded-2xl focus:border-primary/50"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="ghost" onClick={() => setBackupActionDialogOpen(false)} className="h-12 rounded-xl text-zinc-400 hover:bg-white/5 font-semibold">
                Cancel
              </Button>
              <Button
                onClick={handleBackupAction}
                disabled={backupActionLoading || backupActionOtp.length !== 6}
                className={`h-12 font-bold rounded-xl text-white ${
                  backupActionType === 'download' ? 'bg-blue-600 hover:bg-blue-700' :
                  backupActionType === 'restore' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  'bg-red-600 hover:bg-red-700'
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

function TabUsers({ dbUsers, searchTerm }) {
  const filtered = dbUsers.filter(u => 
    !searchTerm || 
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.userId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = dbUsers.filter(u => u.status === 'active').length;
  const suspendedCount = dbUsers.filter(u => u.status !== 'active').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{activeCount}</div>
              <div className="text-xs text-emerald-400/80 uppercase font-bold tracking-wider">Active Users</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/20 text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{suspendedCount}</div>
              <div className="text-xs text-red-400/80 uppercase font-bold tracking-wider">Inactive/Suspended</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{dbUsers.length}</div>
              <div className="text-xs text-blue-400/80 uppercase font-bold tracking-wider">Total in System</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow className="border-zinc-800">
                <TableHead>User</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.userId} className="border-zinc-800">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden">
                        <img src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="font-semibold">{user.name || user.username}</div>
                        <div className="text-xs text-zinc-500">{user.email || 'No email'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400">{user.phone || user.contact || '—'}</TableCell>
                  <TableCell className="text-zinc-400">{user.department || 'General'}</TableCell>
                  <TableCell>
                    <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 capitalize">{user.role}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${user.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {user.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <ManageUserDialog user={user} />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-zinc-500">No users found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ManageUserDialog({ user }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-blue-400 font-semibold hover:bg-blue-400/10">Manage</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl bg-zinc-950/90 backdrop-blur-3xl border-zinc-800/50 text-white rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden p-0">
        <div className="bg-gradient-to-b from-blue-500/10 via-transparent to-transparent px-8 py-10">
          <DialogHeader className="mb-8">
            <div className="flex items-center gap-4">
               <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                  <img src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="" className="w-full h-full object-cover" />
               </div>
               <div>
                  <DialogTitle className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">User Profile</DialogTitle>
                  <p className="text-zinc-500 text-sm font-medium">Manage and view system identity</p>
               </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
             {/* Association Section */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900/60 transition-all group">
                   <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-extrabold mb-1 group-hover:text-zinc-500 transition-colors">Affiliated Company</p>
                   <p className="text-lg font-bold text-blue-400">{user.company || 'Innovation Inc (Global)'}</p>
                </div>
                <div className="bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900/60 transition-all group">
                   <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-extrabold mb-1 group-hover:text-zinc-500 transition-colors">Designation</p>
                   <p className="text-lg font-bold text-white capitalize">{user.designation || user.role || 'Unspecified'}</p>
                </div>
             </div>

             {/* Personal Information */}
             <div className="bg-zinc-900/40 p-6 rounded-[2rem] border border-zinc-800/50 hover:bg-zinc-900/60 transition-all">
                <div className="flex items-center gap-2 mb-6">
                   <div className="p-2 rounded-xl bg-blue-500/10"><UserCog className="w-5 h-5 text-blue-400" /></div>
                   <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Personal Information</h4>
                </div>
                
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                   <div className="space-y-1">
                      <p className="text-xs text-zinc-600 font-bold uppercase tracking-tighter">Full Identity</p>
                      <p className="text-md font-semibold text-white">{user.name || user.username}</p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-xs text-zinc-600 font-bold uppercase tracking-tighter">Vital Stats</p>
                      <p className="text-md font-semibold text-white">Age: {user.age || 'NA'} / {user.gender || 'Any'}</p>
                   </div>
                   <div className="col-span-2 space-y-1 border-t border-zinc-800/30 pt-4">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-3.5 h-3.5 text-zinc-600" />
                        <p className="text-xs text-zinc-600 font-bold uppercase tracking-tighter">Registered Address</p>
                      </div>
                      <p className="text-sm font-medium text-zinc-300 leading-relaxed italic">{user.address || 'Address hidden or unassigned'}</p>
                   </div>
                </div>
             </div>

             <div className="pt-4 flex justify-between items-center px-2">
                <div className="flex gap-2">
                   <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Global UID: {user.userId || user.id}</span>
                </div>
                <Button size="sm" variant="outline" className="h-10 rounded-xl border-zinc-800 bg-white/5 text-zinc-400 font-bold hover:bg-white/10 hover:text-white transition-all px-6">Edit Profile</Button>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabPayments() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <CardHeader>
              <CardTitle className="text-zinc-400 text-sm font-medium uppercase tracking-widest">Total ARR</CardTitle>
            </CardHeader>
            <CardContent>
               <div className="text-5xl font-extrabold text-white tracking-tighter">$510,000</div>
               <p className="text-emerald-400 text-sm mt-2 font-medium flex items-center gap-1">
                 <TrendingUp className="w-4 h-4" /> +22.4% projected growth
               </p>
            </CardContent>
         </Card>
         <Card className="border-zinc-800 bg-zinc-900/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Subscription Mix</CardTitle>
              <CreditCard className="w-4 h-4 text-zinc-500" />
            </CardHeader>
            <CardContent className="h-24 flex items-end gap-2">
               <div className="flex-1 bg-emerald-500/20 h-[60%] rounded-t-lg border-t border-emerald-500/50" title="Enterprise (45%)"></div>
               <div className="flex-1 bg-blue-500/20 h-[85%] rounded-t-lg border-t border-blue-500/50" title="Gold (75%)"></div>
               <div className="flex-1 bg-purple-500/20 h-[40%] rounded-t-lg border-t border-purple-500/50" title="Silver (20%)"></div>
               <div className="flex-1 bg-amber-500/20 h-[20%] rounded-t-lg border-t border-amber-500/50" title="Basic (10%)"></div>
            </CardContent>
         </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {[1, 2, 3, 4, 5].map(i => (
                <TableRow key={i} className="border-zinc-800 hover:bg-white/5">
                  <TableCell className="w-12 pr-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-white">Payment from Co. {i}</div>
                    <div className="text-xs text-zinc-500">TXID: 9283-XJ23-882{i}</div>
                  </TableCell>
                  <TableCell className="text-zinc-400">Enterprise Subscription</TableCell>
                  <TableCell className="font-bold text-white text-right pr-6">+$2,499.00</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TabAnalytics() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-zinc-800 bg-zinc-900/30 h-[400px]">
            <CardHeader>
              <CardTitle className="text-lg">Growth metrics (Companies)</CardTitle>
            </CardHeader>
            <CardContent className="h-full pt-4">
               <ResponsiveContainer width="100%" height="80%">
                  <LineChart data={REVENUE_DATA}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="month" stroke="#71717a" fontSize={12} />
                    <YAxis stroke="#71717a" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }} />
                    <Line type="stepAfter" dataKey="growth" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} />
                  </LineChart>
               </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/30 h-[400px]">
             <CardHeader>
                <CardTitle className="text-lg">Operational Intensity</CardTitle>
             </CardHeader>
             <CardContent className="h-full pt-4">
                <ResponsiveContainer width="100%" height="80%">
                   <AreaChart data={GROWTH_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="day" stroke="#71717a" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }} />
                      <Area type="monotone" dataKey="active" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
                   </AreaChart>
                </ResponsiveContainer>
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
          <Card className="border-zinc-800 bg-zinc-900/30">
            <CardHeader>
              <CardTitle className="text-lg">Global Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Maintenance Mode</div>
                    <div className="text-xs text-zinc-500">Strict mode (Admins only access)</div>
                  </div>
                  <Button 
                    variant={maintenance ? "destructive" : "outline"} 
                    className="w-24"
                    disabled={isLoading}
                    onClick={toggleMaintenance}
                  >
                    {isLoading ? "..." : (maintenance ? "ON" : "OFF")}
                  </Button>
               </div>
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Auto-Backups</div>
                    <div className="text-xs text-zinc-500">Daily snapshot to AWS S3</div>
                  </div>
                  <span className="text-emerald-400 text-xs font-bold uppercase">Running</span>
               </div>
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Registration</div>
                  <div className="text-xs text-zinc-500">Allow new companies signups</div>
                  </div>
                  <span className="text-emerald-400 text-xs font-bold uppercase">Open</span>
               </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/30">
             <CardHeader className="flex-row justify-between items-start">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-zinc-500" />
                  Database Logs
                  {logsLoading && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600 font-mono">{logsTotal} total</span>
                  <button
                    onClick={fetchLogs}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-800 hover:border-zinc-700"
                  >
                    ↻ Refresh
                  </button>
                </div>
             </CardHeader>
             <CardContent className="space-y-2 font-mono text-[10px] text-zinc-500 overflow-hidden max-h-56 overflow-y-auto">
                {logs.length === 0 && !logsLoading && (
                  <div className="text-center text-zinc-700 py-6">No logs captured yet</div>
                )}
                {logs.map((entry, i) => {
                  const levelColors = {
                    INFO: 'text-blue-400',
                    AUTH: 'text-emerald-400',
                    WARN: 'text-amber-400',
                    ERROR: 'text-red-400',
                    CRON: 'text-purple-400',
                    SYSTEM: 'text-cyan-400',
                    CRITICAL: 'text-red-500 font-bold',
                  };
                  const color = levelColors[entry.level] || 'text-zinc-400';
                  return (
                    <div key={i} className="p-2 rounded bg-zinc-950/50 border border-zinc-900 flex items-start gap-2 group">
                      <span className={`${color} shrink-0 w-14 text-right font-bold`}>[{entry.level}]</span>
                      <span className="text-zinc-600 shrink-0">{entry.time}</span>
                      <span className="text-zinc-300 flex-1">{entry.message}</span>
                      {entry.meta && <span className="text-zinc-600 hidden group-hover:inline shrink-0">{entry.meta}</span>}
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

       <Card className="border-red-900/50 bg-red-950/10">
          <CardHeader>
            <CardTitle className="text-red-400 text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Critical Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
             <Button variant="destructive" onClick={handleFlushCache} disabled={isLoading}>Flush Redis Cache</Button>
             <Button variant="destructive" onClick={handleRestartModules} disabled={isLoading}>Restart All Modules</Button>
             <Button 
                variant="destructive" 
                className="bg-red-600/20 text-red-400 border border-red-800 hover:bg-red-600"
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
    <Card className="border-zinc-800 bg-zinc-900/30">
      <CardHeader className="flex-row justify-between items-start">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          Process Monitor
          {loading && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 font-mono">PM2</span>
          <button
            onClick={() => { setLoading(true); fetch2(); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-800 hover:border-zinc-700"
          >
            ↻ Refresh
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-[11px] max-h-56 overflow-y-auto">
        {processes.length === 0 && !loading && (
          <div className="text-center text-zinc-700 py-6">No processes detected</div>
        )}
        {processes.map((p, i) => {
          const statusColors = {
            online: 'bg-emerald-500',
            stopping: 'bg-amber-500',
            stopped: 'bg-red-500',
            errored: 'bg-red-500',
            launching: 'bg-blue-500',
          };
          const dot = statusColors[p.status] || 'bg-zinc-500';
          return (
            <div key={i} className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5 hover:border-zinc-700/60 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dot} ${p.status === 'online' ? 'animate-pulse' : ''}`} />
                  <span className="text-white font-bold text-xs">{p.name}</span>
                  <span className="text-zinc-600 text-[10px]">v{p.version}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                  p.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  p.status === 'errored' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>{p.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-zinc-600">PID</span>
                  <span className="text-zinc-300">{p.pid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Mode</span>
                  <span className="text-zinc-300 capitalize">{p.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">CPU</span>
                  <span className={`font-bold ${p.cpu > 80 ? 'text-red-400' : p.cpu > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{p.cpu}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Memory</span>
                  <span className="text-blue-400 font-bold">{fmtMem(p.memory)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Uptime</span>
                  <span className="text-zinc-300">{fmtUptime(p.uptime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Restarts</span>
                  <span className={`font-bold ${p.restarts > 10 ? 'text-red-400' : p.restarts > 3 ? 'text-amber-400' : 'text-zinc-300'}`}>↻ {p.restarts}</span>
                </div>
              </div>
              {/* CPU + Memory mini bar */}
              <div className="flex gap-2 pt-1">
                <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden" title={`CPU: ${p.cpu}%`}>
                  <div className={`h-full rounded-full transition-all duration-500 ${p.cpu > 80 ? 'bg-red-500' : p.cpu > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(p.cpu, 100)}%` }} />
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden" title={`Mem: ${fmtMem(p.memory)}`}>
                  <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min((p.memory / 536870912) * 100, 100)}%` }} />
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-zinc-600 -mt-1">
                <span>CPU</span>
                <span>MEM (512MB scale)</span>
              </div>
            </div>
          );
        })}
        {ts && (
          <div className="text-center text-[9px] text-zinc-700 pt-1">
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
    <Card className="border-amber-900/50 bg-amber-950/10">
      <CardHeader>
        <CardTitle className="text-amber-400 text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Deployment Controls
        </CardTitle>
        <p className="text-xs text-zinc-500">Pull latest code and rebuild the live site.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleGitPull}
            disabled={isPulling || isDeploying}
            variant="outline"
            className="flex-1 h-12 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            {isPulling ? '⟳ Pulling...' : '⇣ Git Code Pull'}
          </Button>
          <Button
            onClick={handleRebuildDeploy}
            disabled={isPulling || isDeploying}
            className="flex-1 h-12 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isDeploying ? '⟳ Building & Deploying...' : '🚀 Rebuild & Deploy'}
          </Button>
        </div>
        {deployLog && (
          <pre className="mt-3 p-3 rounded-lg bg-zinc-950 text-green-400 text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap border border-zinc-800">
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
        <Card className="border-zinc-800 bg-zinc-900/10 backdrop-blur-md overflow-hidden p-0 gap-0 flex flex-col items-center">
          <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600 w-full relative">
            <div className="absolute inset-0 bg-black/20" />
          </div>
          <div className="px-6 w-full flex flex-col items-center relative">
            <div
              className="relative -mt-12 border-4 border-zinc-950 rounded-3xl overflow-hidden bg-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
               {data.avatar ? (
                 <img src={data.avatar} alt="Profile" className="w-24 h-24 object-cover" />
               ) : (
                 <div className="w-24 h-24 flex items-center justify-center text-zinc-500">
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
              <h3 className="text-2xl font-bold text-white tracking-tight">{data.name || data.username}</h3>
              <p className="text-zinc-400 text-sm font-medium tracking-wide opacity-80">{data.designation || 'Super Admin'}</p>
              <div className="flex gap-2 justify-center pt-3">
                <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold uppercase rounded-lg border border-primary/20">Super Admin</span>
                <span className="px-3 py-1 bg-zinc-800/80 text-zinc-400 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 font-mono">ID: {data.userId}</span>
              </div>
            </div>

            <div className="w-full mt-8 pt-6 border-t border-zinc-800/50 space-y-4 pb-8">
               {data.email && (
                 <div className="flex items-center gap-4 text-sm text-zinc-300 bg-white/5 p-3 rounded-xl border border-white/5">
                   <div className="p-2 rounded-lg bg-primary/10 shadow-inner"><Mail className="w-4 h-4 text-primary" /></div>
                   <span className="font-medium truncate">{data.email}</span>
                 </div>
               )}
               {data.phone && (
                 <div className="flex items-center gap-4 text-sm text-zinc-300 bg-white/5 p-3 rounded-xl border border-white/5">
                   <div className="p-2 rounded-lg bg-emerald-500/10 shadow-inner"><Phone className="w-4 h-4 text-emerald-400" /></div>
                   <span className="font-medium">{data.phone}</span>
                 </div>
               )}
               {data.department && (
                 <div className="flex items-center gap-4 text-sm text-zinc-300 bg-white/5 p-3 rounded-xl border border-white/5">
                   <div className="p-2 rounded-lg bg-amber-500/10 shadow-inner"><Shield className="w-4 h-4 text-amber-400" /></div>
                   <span className="font-medium">{data.department}</span>
                 </div>
               )}
            </div>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/30">
          <CardHeader>
             <CardTitle className="text-sm font-bold flex items-center gap-2">
               <ShieldAlert className="w-4 h-4 text-amber-500" />
               Security Notice
             </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500 leading-relaxed">
            As a Super Admin, your actions are logged and audited. Ensure your credentials are never shared and change your password regularly.
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-8 space-y-8">
        <Card className="border-zinc-800 bg-zinc-900/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              General Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">Full Name</Label>
                  <Input 
                    value={data.name} 
                    onChange={(e) => setData({...data, name: e.target.value})}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary text-white" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">Email Address</Label>
                  <Input 
                    value={data.email} 
                    onChange={(e) => setData({...data, email: e.target.value})}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary text-white" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">Phone</Label>
                  <Input 
                    value={data.phone} 
                    onChange={(e) => setData({...data, phone: e.target.value})}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary text-white" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">Designation</Label>
                  <Input 
                    value={data.designation} 
                    onChange={(e) => setData({...data, designation: e.target.value})}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary text-white" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">Department</Label>
                  <Input 
                    value={data.department} 
                    onChange={(e) => setData({...data, department: e.target.value})}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary text-white" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">User ID (Non-editable)</Label>
                  <Input 
                    value={data.userId} 
                    disabled
                    className="bg-zinc-900/50 border-zinc-800 italic text-zinc-500 cursor-not-allowed" 
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-black font-bold h-12 px-6">
                {saving ? 'Saving…' : 'Update Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/30 border-l-4 border-l-amber-500/50 shadow-lg shadow-amber-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-amber-400">
              <Lock className="w-5 h-5" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium">Current Password</Label>
                  <Input 
                    type="password" 
                    value={passwords.current}
                    onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                    placeholder="Enter current password"
                    className="bg-zinc-950 border-zinc-800 text-white" 
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 font-medium">New Password</Label>
                    <Input 
                      type="password" 
                      value={passwords.next}
                      onChange={(e) => setPasswords({...passwords, next: e.target.value})}
                      placeholder="Minimum 4 characters"
                      className="bg-zinc-950 border-zinc-800 text-white" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 font-medium">Confirm New Password</Label>
                    <Input 
                      type="password" 
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                      className="bg-zinc-950 border-zinc-800 text-white" 
                    />
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={changingPw} variant="secondary" className="font-bold h-12 px-8 border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white">
                {changingPw ? 'Changing…' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
