'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthState { accessToken: string | null; identityId: string | null; isAuthenticated: boolean; }
interface AuthCtx extends AuthState { login: (at: string, rt: string, id: string) => void; logout: () => void; }
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === 'undefined') return { accessToken: null, identityId: null, isAuthenticated: false };
    return { accessToken: sessionStorage.getItem('access_token'), identityId: sessionStorage.getItem('identity_id'), isAuthenticated: !!sessionStorage.getItem('access_token') };
  });
  const login = useCallback((at: string, rt: string, id: string) => { sessionStorage.setItem('access_token', at); sessionStorage.setItem('refresh_token', rt); sessionStorage.setItem('identity_id', id); setState({ accessToken: at, identityId: id, isAuthenticated: true }); }, []);
  const logout = useCallback(() => { sessionStorage.clear(); setState({ accessToken: null, identityId: null, isAuthenticated: false }); }, []);
  return <Ctx.Provider value={{ ...state, login, logout }}>{children}</Ctx.Provider>;
}
export function useAuth() { const c = useContext(Ctx); if (!c) throw new Error('no auth'); return c; }
