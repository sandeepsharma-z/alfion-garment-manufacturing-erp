import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const initials = (s: string) =>
  s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export const timeAgo = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso), diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/** UUID v4 that also works on plain-http LAN origins (crypto.randomUUID needs a secure context). */
export const uuid = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
