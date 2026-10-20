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
    let active = true;

    const onMaintenanceEvent = () => {
      if (active) setIsMaintenance(true);
    };
    window.addEventListener('server-maintenance', onMaintenanceEvent);

    const checkMaintenance = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch('/api/system/maintenance', {
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          // If port/server stops, proxy or server returns non-2xx (500, 502, 503, 504, etc.)
          if (active && resp.status === 503) setIsMaintenance(true);
          return;
        }
        const data = await resp.json().catch(() => ({}));
        if (data && data.maintenance === true) {
          if (active) setIsMaintenance(true);
        } else {
          if (active) setIsMaintenance(false);
        }
      } catch (e) {
        if (e?.name === 'AbortError') return; // Do not trigger maintenance mode on momentary timeout
        // Port stopped, network down, or connection refused
        if (active) setIsMaintenance(true);
      }
    };
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 1500);
    return () => {
      active = false;
      window.removeEventListener('server-maintenance', onMaintenanceEvent);
      clearInterval(interval);
    };
  }, []);


  const isSuperAdminPath = window.location.pathname.startsWith('/superadmin');

  if (isSuperAdminPath) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="sa_theme">
        <SuperAdminDashboard />
        <Toaster />
      </ThemeProvider>
    );
  }

  if (isMaintenance) {
    return <MaintenancePage />;
  }

  const isAuthenticated = !!identity;
  const resetToken = new URLSearchParams(window.location.search).get('resetToken');

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

  // Authenticated but profile failed (e.g. port down or maintenance)
  if (isAuthenticated) {
    return (
      <div
        id="server-maintenance-screen"
        style={{
          minHeight: '100vh',
          width: '100vw',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111111',
          color: '#ffffff',
          textAlign: 'center',
          padding: '2rem',
          boxSizing: 'border-box',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <h1
          style={{
            color: '#ffffff',
            fontSize: '2.5rem',
            fontWeight: '800',
            letterSpacing: '-0.025em',
            margin: '0 0 1rem 0'
          }}
        >
          Server Under Maintenance
        </h1>
        <p
          style={{
            color: '#ffffff',
            fontSize: '1.125rem',
            maxWidth: '520px',
            lineHeight: 1.6,
            margin: 0,
            opacity: 0.9
          }}
        >
          Our services are currently undergoing maintenance. Please check back shortly.
        </p>
      </div>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LoginPage />
      <Toaster />
    </ThemeProvider>
    );
}
