import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  username: string | null;
  role: string | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUsername = localStorage.getItem('auth_username');
    const savedRole = localStorage.getItem('auth_role');

    if (savedToken && savedUsername && savedRole) {
      setToken(savedToken);
      setUsername(savedUsername);
      setRole(savedRole);
    }
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch('http://localhost:8015/datawaverapi/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();

      setToken(data.access_token);
      setUsername(data.username);
      setRole(data.role);

      // Save to localStorage
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('auth_username', data.username);
      localStorage.setItem('auth_role', data.role);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    setRole(null);

    // Clear localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_role');
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        username,
        role,
        token,
        login,
        logout,
        isAuthenticated,
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
