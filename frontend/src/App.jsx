import { useEffect, useState } from 'react';
import { useCustomAuth } from './hooks/useCustomAuth';
import { useGetCallerUserProfile } from './hooks/useQueries';
import { useSocket } from './hooks/useSocket';
import MaintenancePage from './components/MaintenancePage';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';

export default function App() {
  const { identity, isLoggingIn: isInitializing, logout } = useCustomAuth();
  const { data: userProfile, isLoading: profileLoading, isFetched, error: profileError } = useGetCallerUserProfile();
  const [isMaintenance, setIsMaintenance] = useState(false);

  // Real-time data sync via WebSocket (connects when auth_token exists)
  useSocket();

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const resp = await fetch('/api/system/maintenance');
        const data = await resp.json().catch(() => ({}));
        if (resp.status === 503 || data.maintenance) {
          setIsMaintenance(true);
        } else if (resp.ok) {
          setIsMaintenance(false);
        }
      } catch (e) {
        console.warn('Maintenance endpoint unreachable, assuming maintenance mode');
        setIsMaintenance(true);
      }
    };
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 2000);
    return () => clearInterval(interval);
  }, []);

  if (isMaintenance) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111',
        color: '#fff',
        fontSize: '2rem',
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '2rem',
      }}>
        Server Under Maintenance
      </div>
    );
  }

  const isSuperAdminPath = window.location.pathname.startsWith('/superadmin');

  const isAuthenticated = !!identity;
  const resetToken = new URLSearchParams(window.location.search).get('resetToken');

  if (isSuperAdminPath) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <SuperAdminDashboard />
        <Toaster />
      </ThemeProvider>
    );
  }

  useEffect(() => {
    if (resetToken && isAuthenticated) {
      logout();
    }
  }, [resetToken]);

  useEffect(() => {
    if (!isAuthenticated || !profileError) return;
    const msg = String(profileError?.message || '').toLowerCase();
    const isAuthError = msg.includes('invalid or expired token')
      || msg.includes('access token required')
      || msg.includes('session expired')
      || msg.includes('invalid session');
    if (isAuthError) {
      logout();
    }
  }, [isAuthenticated, profileError, logout]);

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-muted-foreground">Initializing...</p>
          </div>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  if (resetToken) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <LoginPage resetToken={resetToken} />
        <Toaster />
      </ThemeProvider>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <LoginPage />
        <Toaster />
      </ThemeProvider>
    );
  }

  const showDashboard = isAuthenticated && isFetched && !!userProfile;

  // Show loading while fetching profile
  if (profileLoading || !isFetched) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  if (showDashboard) {
    if (userProfile?.role === 'param' && !window.location.search.includes('view=ems')) {
      return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SuperAdminDashboard />
          <Toaster />
        </ThemeProvider>
      );
    }

    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Dashboard userProfile={userProfile} />
        <Toaster />
      </ThemeProvider>
    );
  }

  // Authenticated but profile failed — offer retry instead of showing login again
  if (isAuthenticated) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Could not load your profile.</p>
            <button
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LoginPage />
      <Toaster />
    </ThemeProvider>
    );
}
