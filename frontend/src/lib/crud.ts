import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiMessage } from './api';

export type ListResp<T> = { items: T[]; total: number };

/** GET list — queryKey is [path, params] so invalidateQueries([path]) refreshes every variant. */
export const useList = <T,>(path: string, params: Record<string, unknown> = {}, enabled = true) =>
  useQuery<ListResp<T>>({
    queryKey: [path, params],
    queryFn: async () => (await api.get(path, { params })).data,
    enabled,
  });

export const useItem = <T,>(path: string, enabled = true) =>
  useQuery<T>({ queryKey: [path], queryFn: async () => (await api.get(path)).data, enabled });

/** POST (create) or PATCH /:id (update) — toast on error, invalidate on success. */
export const useSave = <T,>(path: string, invalidate: string[] = [path], onDone?: (d: T) => void) => {
  const qc = useQueryClient();
  return useMutation<T, unknown, { id?: string; body: unknown }>({
    mutationFn: async ({ id, body }) =>
      id ? (await api.patch(`${path}/${id}`, body)).data : (await api.post(path, body)).data,
    onSuccess: (d) => { invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onDone?.(d); },
    onError: (e) => toast.error(apiMessage(e)),
  });
};

/** Arbitrary POST action (toggle, round, convert …). */
export const useAction = <T,>(invalidate: string[], onDone?: (d: T) => void) => {
  const qc = useQueryClient();
  return useMutation<T, unknown, { url: string; body?: unknown }>({
    mutationFn: async ({ url, body }) => (await api.post(url, body ?? {})).data,
    onSuccess: (d) => { invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onDone?.(d); },
    onError: (e) => toast.error(apiMessage(e)),
  });
};

export async function uploadFile(file: File, refType = '', refId = '') {
  const fd = new FormData();
  fd.append('file', file); fd.append('refType', refType); fd.append('refId', refId);
  return (await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }))
    .data as { id: string; name: string; size: number; mime: string };
}

/** Object URL for an auth-protected file (images in <img>); revoked on unmount. */
export function useFileUrl(id?: string | null) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!id) { setUrl(null); return; }
    let u: string | null = null; let live = true;
    api.get(`/files/${id}`, { responseType: 'blob' }).then((r) => { if (!live) return; u = URL.createObjectURL(r.data); setUrl(u); }).catch(() => live && setUrl(null));
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url;
}

/** Files are auth-protected, so fetch as blob and open/download locally. */
export async function openFile(id: string, name: string, download = false) {
  try {
    const r = await api.get(`/files/${id}`, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    if (download) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) { toast.error(apiMessage(e)); }
}

export const fmtN = (n?: number | null) => (n ?? 0).toLocaleString('en-IN');
export const fmtInr = (v?: number | null) => {
  if (v == null) return '—';
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const toInputDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Save a server response (or a string) as a file — used by the Excel / CSV exports. */
export const saveBlob = (data: Blob | string, name: string, type = 'application/octet-stream') => {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
};
