'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  identityId: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, refreshToken: string, identityId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === 'undefined') {
      return { accessToken: null, refreshToken: null, identityId: null, isAuthenticated: false };
    }
    const accessToken = sessionStorage.getItem('access_token');
    const refreshToken = sessionStorage.getItem('refresh_token');
    const identityId = sessionStorage.getItem('identity_id');
    return {
      accessToken,
      refreshToken,
      identityId,
      isAuthenticated: !!accessToken,
    };
  });

  const login = useCallback((accessToken: string, refreshToken: string, identityId: string) => {
    sessionStorage.setItem('access_token', accessToken);
    sessionStorage.setItem('refresh_token', refreshToken);
    sessionStorage.setItem('identity_id', identityId);
    setState({ accessToken, refreshToken, identityId, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('identity_id');
    setState({ accessToken: null, refreshToken: null, identityId: null, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
