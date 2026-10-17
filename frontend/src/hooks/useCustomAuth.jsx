import React, { createContext, useContext, useEffect, useState } from 'react';
import { Ed25519KeyIdentity } from '@dfinity/identity';

const CustomAuthContext = createContext(undefined);

export const CustomAuthProvider = ({ children }) => {
  const [identity, setIdentity] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(true);

  // Helper to get auth DB
  const getAuthDb = () => {
    const stored = localStorage.getItem('db_auth_v4');
    return stored ? JSON.parse(stored) : {};
  };

  const saveAuthDb = (db) => {
    localStorage.setItem('db_auth_v4', JSON.stringify(db));
  };

  useEffect(() => {
    const initAuth = async () => {
      // Check if there is a current active session
      const currentUsername = localStorage.getItem('current_user');
      if (currentUsername) {
        const db = getAuthDb();
        const userRecord = db[currentUsername];
        
        if (userRecord && userRecord.identityJson) {
            try {
                const identity = Ed25519KeyIdentity.fromJSON(JSON.stringify(userRecord.identityJson));
                setIdentity(identity);
                setIsAuthenticated(true);
            } catch (e) {
                console.error("Failed to load identity", e);
                localStorage.removeItem('current_user');
            }
        }
      }
      setIsLoggingIn(false);
    };

    initAuth();
  }, []);

  const register = async (username, password) => {
    setIsLoggingIn(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

    const db = getAuthDb();
    try {
        const response = await fetch(`/api/users`);
        if (response.ok) {
            const users = await response.json();
            const exists = users.some(u => u.username === username || u.userId === username || u.id === username);
            if (exists) {
                setIsLoggingIn(false);
                throw new Error("User already exists");
            }
        }
    } catch (e) {
        console.error("Failed to check backend for user", e);
    }

    const newIdentity = Ed25519KeyIdentity.generate();
    
    db[username] = {
        identityJson: newIdentity.toJSON()
    };
    saveAuthDb(db);
    
    // Set as current user
    localStorage.setItem('current_user', username);
    setIdentity(newIdentity);
    setIsAuthenticated(true);
    setIsLoggingIn(false);
    
    return newIdentity;
  };

  const login = async (username, password) => {
    setIsLoggingIn(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!username || !password) {
        setIsLoggingIn(false);
        throw new Error("Username and password are required");
    }

    const db = getAuthDb();
    let sessionKey = username;
    try {
      const response = await fetch(`/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: username, password })
      });
      if (response.status === 503) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
        setIsLoggingIn(false);
        throw new Error('Server Under Maintenance');
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Invalid credentials' }));
        if (err.maintenance || String(err.message || '').toLowerCase().includes('maintenance')) {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
        }
        setIsLoggingIn(false);
        throw new Error(err.message || 'Invalid credentials');
      }
      const backendUser = await response.json();
      if (backendUser?.userId) {
        sessionKey = backendUser.userId;
      }
      // Store JWT token
      if (backendUser?.token) {
        localStorage.setItem('auth_token', backendUser.token);
        if (backendUser?.role === 'param') {
          localStorage.setItem('sa_auth_token', backendUser.token);
          localStorage.setItem('active_sa_id', backendUser.userId);
        } else {
          localStorage.removeItem('sa_auth_token');
          localStorage.removeItem('active_sa_id');
        }
      }
    } catch (e) {
      setIsLoggingIn(false);
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('maintenance') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
      }
      throw e;
    }

    let userRecord = db[sessionKey];
    if (!userRecord?.identityJson) {
      const newIdentity = Ed25519KeyIdentity.generate();
      db[sessionKey] = { identityJson: newIdentity.toJSON() };
      saveAuthDb(db);
      userRecord = db[sessionKey];
    }

    try {
        const identity = Ed25519KeyIdentity.fromJSON(JSON.stringify(userRecord.identityJson));
        localStorage.setItem('current_user', sessionKey);
        setIdentity(identity);
        setIsAuthenticated(true);
        setIsLoggingIn(false);
        return identity;
    } catch (e) {
        setIsLoggingIn(false);
        throw new Error("Failed to restore identity");
    }
  };

  const logout = async () => {
    localStorage.removeItem('current_user');
    localStorage.removeItem('auth_token');
    setIdentity(null);
    setIsAuthenticated(false);
  };

  const getToken = () => localStorage.getItem('auth_token');

  return (
    <CustomAuthContext.Provider value={{ identity, isAuthenticated, login, register, logout, isLoggingIn, getToken }}>
      {children}
    </CustomAuthContext.Provider>
  );
};

export const useCustomAuth = () => {
  const context = useContext(CustomAuthContext);
  if (context === undefined) {
    throw new Error('useCustomAuth must be used within a CustomAuthProvider');
  }
  return context;
};
