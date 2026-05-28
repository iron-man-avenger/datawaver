import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthContextType {
  username: string | null;
  role: string | null;
  token: string | null;
  canViewHistory: boolean;
  historyAccess: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [historyAccess, setHistoryAccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const clearSession = useCallback(() => {
    setToken(null);
    setUsername(null);
    setRole(null);
    setHistoryAccess(false);
    setExpiresAt(null);
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_history_access');
    localStorage.removeItem('auth_expires_at');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsReady(true);
      return;
    }

    const savedToken = localStorage.getItem('auth_token');
    const savedUsername = localStorage.getItem('auth_username');
    const savedRole = localStorage.getItem('auth_role');
    const savedHistoryAccess = localStorage.getItem('auth_history_access');
    const savedExpiresAt = localStorage.getItem('auth_expires_at');

    if (savedToken && savedUsername && savedRole && savedExpiresAt) {
      const expiry = Number(savedExpiresAt);
      if (!Number.isNaN(expiry) && expiry > Date.now()) {
        setToken(savedToken);
        setUsername(savedUsername);
        setRole(savedRole);
        setHistoryAccess(savedHistoryAccess === 'true');
        setExpiresAt(expiry);
        setIsReady(true);
        return;
      }
    }

    clearSession();
    setIsReady(true);
  }, [clearSession]);

  const login = useCallback(async (usernameParam: string, password: string) => {
    const response = await fetch('http://10.200.7.77:8015/datawaverapi/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: usernameParam, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    const expiryTimestamp = Date.now() + SESSION_DURATION_MS;

    setToken(data.access_token);
    setUsername(data.username);
    setRole(data.role);
    setHistoryAccess(Boolean(data.history_access));
    setExpiresAt(expiryTimestamp);

    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('auth_username', data.username);
      localStorage.setItem('auth_role', data.role);
      localStorage.setItem('auth_history_access', data.history_access ? 'true' : 'false');
      localStorage.setItem('auth_expires_at', expiryTimestamp.toString());
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    if (!expiresAt || typeof window === 'undefined') {
      return;
    }

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearSession();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearSession();
    }, remaining);

    return () => window.clearTimeout(timeoutId);
  }, [expiresAt, clearSession]);

  const canViewHistory = role === 'admin' || historyAccess;
  const isAuthenticated = Boolean(token && expiresAt && expiresAt > Date.now());

  return (
    <AuthContext.Provider
      value={{
        username,
        role,
        token,
        canViewHistory,
        historyAccess,
        login,
        logout,
        isAuthenticated,
        isReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};