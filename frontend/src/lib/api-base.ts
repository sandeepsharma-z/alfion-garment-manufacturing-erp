/** API origin. VITE_API_URL wins; otherwise the host the page was opened from (localhost, LAN IP, or domain) on port 5000,
 *  so the same dev build works from the PC, a phone on the office Wi-Fi, or a deployed single-origin server. */
const fromEnv = (import.meta.env.VITE_API_URL || '').trim();
const sameHost = `${window.location.protocol}//${window.location.hostname}:5000`;
// a localhost VITE_API_URL is only meaningful on the dev PC itself — from any other device use that device's view of the host
const envIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(fromEnv);
const pageIsLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
export const API_ORIGIN = (fromEnv && !(envIsLocal && !pageIsLocal) ? fromEnv : `${sameHost}/api/v1`).replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api/v1`;
