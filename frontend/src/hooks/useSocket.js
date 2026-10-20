/**
 * useSocket — real-time data synchronisation via Socket.IO.
 *
 * Connects once per app lifetime, authenticates with the JWT,
 * and invalidates the relevant React Query caches when the
 * server broadcasts change events.
 *
 * Covered modules:
 *   attendance:change  → ['attendance']
 *   task:change        → ['tasks']
 *   message:change     → ['messages']
 *   scrum:change       → ['scrumNotes']
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
  'meeting:started':     [['notifications']],
};

let globalSocket = null;

export function getSocket() {
  return globalSocket;
}


/**
 * Resolve the socket server URL.
 * - In production the page is served from the same origin as the API,
 *   so we just use the current origin.
 * - In dev (Vite proxy) the `/ws` path is proxied to the backend.
 */
function getSocketUrl() {
  // In production the frontend is served from nginx on the same host
  // as the API, so window.location.origin works.
  return window.location.origin;
}

export function useSocket() {
  const queryClient = useQueryClient();
  const socketRef = useRef(null);
  // Track the token so we reconnect on login / disconnect on logout
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));

  // Poll localStorage for token changes (covers login/logout from other code)
  useEffect(() => {
    const interval = setInterval(() => {
      const current = localStorage.getItem('auth_token');
      setToken((prev) => (prev !== current ? current : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Disconnect stale socket if token changed or disappeared
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!token) return; // not logged in

    const socket = io(getSocketUrl(), {
      path: '/ws',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;
    globalSocket = socket;

    // Register event listeners
    for (const [event, queryKeys] of Object.entries(EVENT_TO_QUERY_KEYS)) {
      socket.on(event, () => {
        for (const key of queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }

    socket.on('notification:new', (notif) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-notification-new', { detail: notif }));
      }
    });

    // Force logout when company is blocked by SuperAdmin
    socket.on('company:blocked', (payload) => {
      // Clear all auth state
      localStorage.removeItem('current_user');
      localStorage.removeItem('auth_token');
      // Show alert and redirect to login
      alert(payload?.message || 'Your company has been blocked. Please contact system admin (ReGen) for assistance.');
      window.location.href = '/';
    });

    socket.on('connect', () => {
      globalSocket = socket;
      // eslint-disable-next-line no-console
      console.log('[WS] connected');
    });

    socket.on('disconnect', (reason) => {
      // eslint-disable-next-line no-console
      console.log('[WS] disconnected:', reason);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (globalSocket === socket) globalSocket = null;
    };
  }, [token, queryClient]);
}

