'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthState { accessToken: string | null; identityId: string | null; department: string | null; isAuthenticated: boolean; }
interface AuthContextValue extends AuthState { login: (at: string, rt: string, id: string, dept: string) => void; logout: () => void; }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === 'undefined') return { accessToken: null, identityId: null, department: null, isAuthenticated: false };
    return { accessToken: sessionStorage.getItem('access_token'), identityId: sessionStorage.getItem('identity_id'), department: sessionStorage.getItem('department'), isAuthenticated: !!sessionStorage.getItem('access_token') };
  });

  const login = useCallback((at: string, rt: string, id: string, dept: string) => {
    sessionStorage.setItem('access_token', at); sessionStorage.setItem('refresh_token', rt); sessionStorage.setItem('identity_id', id); sessionStorage.setItem('department', dept);
    setState({ accessToken: at, identityId: id, department: dept, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.clear();
    setState({ accessToken: null, identityId: null, department: null, isAuthenticated: false });
  }, []);

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth outside provider'); return ctx; }
