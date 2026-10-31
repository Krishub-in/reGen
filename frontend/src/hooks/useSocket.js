/**
 * useSocket — real-time data synchronisation via Socket.IO.
 *
 * Connects once per app lifetime, authenticates with JWT,
 * and invalidates the relevant React Query caches when the
 * server broadcasts change events.
 *
 * Includes complete handling for:
 * - Page lifecycle & BFCache (pagehide / pageshow / visibilitychange)
 * - Safe reconnection without duplicate connections on React remounts
 * - Clean teardown of event listeners
 * - Multi-role token support (SuperAdmin sa_auth_token & User/Company auth_token)
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

/** Map server event → React Query key(s) to invalidate */
const EVENT_TO_QUERY_KEYS = {
  'attendance:change':   [['attendance']],
  'task:change':         [['tasks']],
  'message:change':      [['messages']],
  'scrum:change':        [['scrumNotes']],
  'dm:change':           [['dm-conversations'], ['dm-messages']],
  'dm:key-exchange':     [['dm-conversations']],
  'notification:new':    [['notifications']],
  'notification:change': [['notifications']],
  'notification:read':   [['notifications']],
  'notification:read_all': [['notifications']],
  'notification:clear_all': [['notifications']],
  'meeting:started':     [['notifications']],
  'payroll:change':      [['payroll'], ['payrolls'], ['payroll-preview'], ['payroll-report'], ['notifications']],
};

let globalSocket = null;

export function getSocket() {
  return globalSocket;
}


/**
 * Resolve the socket server URL.
 * - In production the page is served from the same origin as the API.
 * - In dev (Vite proxy) the `/ws` path is proxied to the backend on port 5006.
 */
function getSocketUrl() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

/**
 * Retrieve the active authentication token.
 * Checks both regular and Super Admin storage keys based on current route.
 */
function getAuthToken() {
  if (typeof window === 'undefined') return null;
  const isSuperAdmin = window.location.pathname.startsWith('/superadmin');
  return isSuperAdmin
    ? (localStorage.getItem('sa_auth_token') || localStorage.getItem('auth_token'))
    : (localStorage.getItem('auth_token') || localStorage.getItem('sa_auth_token'));
}

// Module-level singleton instance to prevent duplicate connections across React renders/remounts
let activeSocket = null;
let activeToken = null;
let isBfCached = false;
let currentQueryClient = null;

function setupEventListeners(socket) {
  // Remove existing listeners to prevent duplicates
  for (const event of Object.keys(EVENT_TO_QUERY_KEYS)) {
    socket.off(event);
  }
  socket.off('company:blocked');
  socket.off('connect');
  socket.off('disconnect');

  // Register real-time query invalidation listeners
  for (const [event, queryKeys] of Object.entries(EVENT_TO_QUERY_KEYS)) {
    socket.on(event, (data) => {
      if (currentQueryClient) {
        for (const key of queryKeys) {
          currentQueryClient.invalidateQueries({
            queryKey: key,
            refetchType: 'all',
          });
          currentQueryClient.refetchQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === key[0],
          });
        }
      }
      if (typeof window !== 'undefined' && event === 'attendance:change') {
        window.dispatchEvent(new CustomEvent('attendance:updated', { detail: data }));
      }
    });
  }

  socket.on('notification:new', (notif) => {
    if (currentQueryClient) {
      currentQueryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-notification-new', { detail: notif }));
    }
  });

  socket.on('meeting:started', (data) => {
    if (currentQueryClient) {
      currentQueryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('meeting:started', { detail: data }));
    }
  });

  // Force logout when company is blocked by SuperAdmin
  socket.on('company:blocked', (payload) => {
    localStorage.removeItem('current_user');
    localStorage.removeItem('auth_token');
    alert(payload?.message || 'Your company has been blocked. Please contact system admin (ReGen) for assistance.');
    window.location.href = '/';
  });

  socket.on('connect', () => {
    globalSocket = socket;
    // eslint-disable-next-line no-console
    console.log('[WS] connected');
  });

  socket.on('disconnect', (reason) => {
    // Only log if not intentional BFCache transition
    if (!isBfCached) {
      // eslint-disable-next-line no-console
      console.log('[WS] disconnected:', reason);
    }
  });
}

function getOrCreateSocket(token) {
  if (!token) {
    if (activeSocket) {
      activeSocket.disconnect();
      activeSocket = null;
      globalSocket = null;
      activeToken = null;
    }
    return null;
  }

  // If existing socket is valid with the same token, reuse it
  if (activeSocket && activeToken === token) {
    globalSocket = activeSocket;
    if (!activeSocket.connected && !isBfCached) {
      activeSocket.connect();
    }
    return activeSocket;
  }

  // If token changed, tear down old socket
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
    globalSocket = null;
  }

  activeToken = token;
  const socket = io(getSocketUrl(), {
    path: '/ws',
    transports: ['websocket', 'polling'],
    auth: { token },
    query: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  setupEventListeners(socket);
  activeSocket = socket;
  globalSocket = socket;
  return activeSocket;
}

export function useSocket() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(getAuthToken);

  // Keep queryClient reference updated for event callbacks
  useEffect(() => {
    currentQueryClient = queryClient;
  }, [queryClient]);

  // Monitor localStorage for token changes (login, logout, account switch)
  useEffect(() => {
    const checkToken = () => {
      const current = getAuthToken();
      setToken((prev) => (prev !== current ? current : prev));
    };

    window.addEventListener('storage', checkToken);
    const interval = setInterval(checkToken, 1000);

    return () => {
      window.removeEventListener('storage', checkToken);
      clearInterval(interval);
    };
  }, []);

  // Manage connection lifecycle and BFCache events
  useEffect(() => {
    const socket = getOrCreateSocket(token);

    // BFCache: Handle page entering Back-Forward Cache (navigating away)
    const handlePageHide = (event) => {
      // If persisted is true, the page is going into BFCache
      isBfCached = true;
      if (activeSocket && activeSocket.connected) {
        // Disconnect cleanly so browser does not forcibly terminate the connection with an error
        activeSocket.disconnect();
      }
    };

    // BFCache: Handle page restored from Back-Forward Cache
    const handlePageShow = (event) => {
      if (event.persisted || isBfCached) {
        isBfCached = false;
        const currentToken = getAuthToken();
        if (currentToken) {
          if (activeSocket) {
            activeSocket.auth = { token: currentToken };
            if (activeSocket.io?.opts) {
              activeSocket.io.opts.query = { token: currentToken };
            }
            if (!activeSocket.connected) {
              activeSocket.connect();
            }
          } else {
            getOrCreateSocket(currentToken);
          }
        }
      }
    };

    // Tab visibility recovery (e.g. background tab reactivation)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isBfCached) {
        const currentToken = getAuthToken();
        if (currentToken && activeSocket && !activeSocket.connected) {
          activeSocket.connect();
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);
}

