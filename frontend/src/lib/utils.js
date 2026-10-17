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
    return fetch(url, { ...options, headers });
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
