import axios from 'axios';

import { API_BASE as BASE } from './api-base';

export const api = axios.create({ baseURL: BASE, timeout: 15000 });

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/* One shared silent refresh — boot and the 401 interceptor must never race each other,
   because the server rotates the refresh token and the loser of the race gets logged out. */
type Session = { accessToken: string; refreshToken: string; user: unknown };
let refreshing: Promise<Session | null> | null = null;

const doRefresh = async (): Promise<Session | null> => {
  const stored = localStorage.getItem('afion-refresh');
  if (!stored) return null;
  try {
    const { data } = await axios.post<Session>(`${BASE}/auth/refresh`, { refreshToken: stored });
    localStorage.setItem('afion-refresh', data.refreshToken);
    setAccessToken(data.accessToken);
    return data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) { localStorage.removeItem('afion-refresh'); setAccessToken(null); } // revoked/expired — network blips keep the token
    return null;
  }
};
export const refreshSession = () => {
  refreshing = refreshing || doRefresh().finally(() => { refreshing = null; });
  return refreshing;
};

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  if (error.response?.status === 401 && !original._retried) {
    original._retried = true;
    const s = await refreshSession();
    if (s) {
      original.headers.Authorization = `Bearer ${s.accessToken}`;
      return api(original);
    }
    window.dispatchEvent(new Event('afion:logout'));
  }
  return Promise.reject(error);
});

export const apiMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as { message?: string })?.message
      || (e.code === 'ERR_NETWORK' ? 'Cannot reach the server — is the backend running?' : e.message);
  }
  return 'Something went wrong';
};
