import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCustomAuth } from './hooks/useCustomAuth';
import { useGetCallerUserProfile } from './hooks/useQueries';
import { useSocket } from './hooks/useSocket';
import MaintenancePage from './components/MaintenancePage';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';

// Page lazy loading for optimal bundle size and initial load speed
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));

function PageLoader({ message = 'Loading...' }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const { identity, isLoggingIn: isInitializing, logout } = useCustomAuth();
  const { data: userProfile, isLoading: profileLoading, isFetched, error: profileError } = useGetCallerUserProfile();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const isMaintenanceRef = useRef(false);
  isMaintenanceRef.current = isMaintenance;

  // Real-time data sync via WebSocket (connects when auth_token exists)
  useSocket();

  useEffect(() => {
    let active = true;

    const onMaintenanceEvent = async () => {
      if (!active) return;
      try {
        const resp = await fetch('/api/system/maintenance', { cache: 'no-store' });
        const data = await resp.json().catch(() => ({}));
        if (resp.status === 503 || data?.maintenance === true) {
          if (active) setIsMaintenance(true);
        } else {
          if (active) setIsMaintenance(false);
        }
      } catch (err) {
        // Do not falsely trigger maintenance on momentary client fetch errors
        console.warn('Maintenance check query failed:', err);
      }
    };
    window.addEventListener('server-maintenance', onMaintenanceEvent);

    const checkMaintenance = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch('/api/system/maintenance', {
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          if (active && resp.status === 503) {
            setIsMaintenance(true);
          }
          return;
        }

        const data = await resp.json().catch(() => ({}));
        if (data && data.maintenance === true) {
          if (active) {
            setIsMaintenance(true);
          }
        } else {
          if (active) {
            setIsMaintenance(prev => {
              if (prev) {
                // Service restored! Automatically re-validate and fetch profile/app state
                queryClient.invalidateQueries();
              }
              return false;
            });
          }
        }
      } catch (e) {
        // Do not falsely trigger maintenance on momentary client-side fetch timeouts
      }
    };

    checkMaintenance();
    const interval = setInterval(checkMaintenance, 1500);
    return () => {
      active = false;
      window.removeEventListener('server-maintenance', onMaintenanceEvent);
      clearInterval(interval);
    };
  }, [queryClient]);

  const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('auth_token') : false;
  const isAuthenticated = !!identity && hasToken;
  const resetToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('resetToken') : null;

  useEffect(() => {
    if (resetToken && isAuthenticated) {
      logout();
    }
  }, [resetToken, isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // CRITICAL: Never log out during maintenance mode or when server/port is temporarily down
    if (isMaintenance) return;

    if (profileError) {
      const msg = String(profileError?.message || '').toLowerCase();
      // Only logout on authentic 401 Unauthorized or invalid session, NEVER on maintenance / 503 / connection errors
      if (msg.includes('invalid session') || msg.includes('unauthorized') || profileError?.status === 401) {
        logout();
      }
      return;
    }

    if (isFetched && !profileLoading && !userProfile && !profileError) {
      const timer = setTimeout(() => {
        if (!isMaintenanceRef.current && !userProfile) {
          logout();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isMaintenance, profileError, isFetched, profileLoading, userProfile, logout]);

  const isSuperAdminPath = typeof window !== 'undefined' ? window.location.pathname.startsWith('/superadmin') : false;

  if (isSuperAdminPath) {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('portal_view');
    }
    return (
      <Suspense fallback={<PageLoader message="Loading SuperAdmin..." />}>
        <SuperAdminDashboard />
      </Suspense>
    );
  }

  if (isMaintenance) {
    return <MaintenancePage />;
  }

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <ThemeProvider attribute="class" forcedTheme={!hasToken ? 'dark' : undefined} defaultTheme="system" enableSystem>
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
      <ThemeProvider attribute="class" forcedTheme="dark">
        <Suspense fallback={<PageLoader message="Loading..." />}>
          <LoginPage resetToken={resetToken} />
        </Suspense>
        <Toaster />
      </ThemeProvider>
    );
  }

  // Show login page if not authenticated (always in dark theme)
  if (!isAuthenticated) {
    return (
      <ThemeProvider attribute="class" forcedTheme="dark">
        <Suspense fallback={<PageLoader message="Loading..." />}>
          <LoginPage />
        </Suspense>
        <Toaster />
      </ThemeProvider>
    );
  }

  const showDashboard = isAuthenticated && isFetched && !!userProfile;

  // Show loading while fetching profile
  if (profileLoading || (isAuthenticated && !isFetched)) {
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
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('view=ems')) {
        sessionStorage.setItem('portal_view', 'ems');
      } else if (window.location.pathname.startsWith('/superadmin')) {
        sessionStorage.removeItem('portal_view');
      }
    }
    const isEmsMode = typeof window !== 'undefined' && (
      window.location.search.includes('view=ems') || 
      sessionStorage.getItem('portal_view') === 'ems'
    );

    if (userProfile?.role === 'param' && !isEmsMode) {
      return (
        <Suspense fallback={<PageLoader message="Loading SuperAdmin..." />}>
          <SuperAdminDashboard />
        </Suspense>
      );
    }

    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Suspense fallback={<PageLoader message="Loading Dashboard..." />}>
          <Dashboard userProfile={userProfile} />
        </Suspense>
        <Toaster />
      </ThemeProvider>
    );
  }

  // Authenticated: show loading while restoring session and fetching profile
  if (isAuthenticated) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-muted-foreground">Connecting to services...</p>
          </div>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Suspense fallback={<PageLoader message="Loading..." />}>
        <LoginPage />
      </Suspense>
      <Toaster />
    </ThemeProvider>
  );
}
