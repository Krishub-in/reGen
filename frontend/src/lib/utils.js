import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/**
 * Wrapper around fetch that automatically injects the JWT Bearer token.
 * Use this for all authenticated API calls.
 */
export function authFetch(url, options = {}) {
    const isSuperAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/superadmin');
    const token = isSuperAdminPath
        ? (localStorage.getItem('sa_auth_token') || localStorage.getItem('auth_token'))
        : localStorage.getItem('auth_token');
    const headers = { ...(options.headers || {}) };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers })
      .then((res) => {
        if (res.status === 503) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('server-maintenance'));
          }
        }
        return res;
      })
      .catch((err) => {
        throw err;
      });
}

export function safeRandomUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Universal helper to check if a user object or role value matches a given role name.
 * Robust against strings ('owner') and legacy objects ({ owner: null }).
 */
export function hasUserRole(userOrRole, roleName) {
    if (!userOrRole) return false;
    const role = (userOrRole && typeof userOrRole === 'object' && userOrRole.role !== undefined)
        ? userOrRole.role
        : userOrRole;
    if (!role) return false;
    const target = String(roleName || '').toLowerCase().trim();
    if (typeof role === 'string') {
        return role.toLowerCase().trim() === target;
    }
    if (typeof role === 'object') {
        return Boolean(
            role[target] !== undefined ||
            role[roleName] !== undefined ||
            Object.prototype.hasOwnProperty.call(role, target) ||
            Object.prototype.hasOwnProperty.call(role, roleName)
        );
    }
    return false;
}

/**
 * Universal helper to extract the primary role string key ('staff', 'owner', 'admin', etc.)
 * from a user object or role value.
 */
export function getUserRoleKey(userOrRole) {
    if (!userOrRole) return 'staff';
    const role = (userOrRole && typeof userOrRole === 'object' && userOrRole.role !== undefined)
        ? userOrRole.role
        : userOrRole;
    if (!role) return 'staff';
    if (typeof role === 'string') return role.toLowerCase().trim();
    if (typeof role === 'object') {
        const keys = Object.keys(role);
        return keys.length > 0 ? keys[0].toLowerCase().trim() : 'staff';
    }
    return 'staff';
}

