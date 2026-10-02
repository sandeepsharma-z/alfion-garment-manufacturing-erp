import * as React from 'react';
import { api, setAccessToken, refreshSession } from '@/lib/api';

export type User = {
  id: string; name: string; uid: string; email: string; phone: string;
  role: string; modules: string[]; flags: string[]; status: string;
  mustChangePassword: boolean; lastLoginAt?: string; createdAt?: string; custom?: Record<string, unknown>;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (uid: string, password: string) => Promise<void>;
  logout: () => void;
  hasModule: (key: string) => boolean;
  hasFlag: (flag: string) => boolean;
  refreshMe: () => Promise<void>;
};

const Ctx = React.createContext<AuthCtx>(null as never);
export const useAuth = () => React.useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshMe = React.useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
  }, []);

  /* boot: silent refresh if a refresh token survives (deduped — StrictMode runs this twice) */
  React.useEffect(() => {
    refreshSession().then((s) => { if (s) setUser(s.user as User); setLoading(false); });
  }, []);

  React.useEffect(() => {
    const onLogout = () => { setUser(null); setAccessToken(null); };
    window.addEventListener('afion:logout', onLogout);
    return () => window.removeEventListener('afion:logout', onLogout);
  }, []);

  const login = async (uid: string, password: string) => {
    const { data } = await api.post('/auth/login', { uid, password });
    setAccessToken(data.accessToken);
    localStorage.setItem('afion-refresh', data.refreshToken);
    setUser(data.user);
  };

  const logout = () => {
    api.post('/auth/logout', { refreshToken: localStorage.getItem('afion-refresh') }).catch(() => undefined);
    localStorage.removeItem('afion-refresh');
    setAccessToken(null);
    setUser(null);
  };

  const hasModule = (key: string) =>
    !!user && (user.modules[0] === '*' || user.modules.includes(key));
  const hasFlag = (flag: string) =>
    !!user && (user.role === 'Admin' || (user.flags || []).includes(flag));

  return (
    <Ctx.Provider value={{ user, loading, login, logout, hasModule, hasFlag, refreshMe }}>
      {children}
    </Ctx.Provider>
  );
}
