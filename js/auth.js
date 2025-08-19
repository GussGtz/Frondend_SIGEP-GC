// js/auth.js — sesión híbrida (cookie + token fallback)
const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';

/* ===== Token helpers (fallback PWA/iOS) ===== */
export function saveToken(token) {
  try { if (token) localStorage.setItem('token', token); } catch {}
}
export function getToken() {
  try { return localStorage.getItem('token'); } catch { return null; }
}
export function clearToken() {
  try { localStorage.removeItem('token'); } catch {}
}

/* ===== Headers y fetch autenticado ===== */
export function getAuthHeaders(extra = {}) {
  const tk = getToken();
  return tk ? { ...extra, Authorization: `Bearer ${tk}` } : extra;
}

/** authFetch: incluye credenciales (cookie) + Bearer si existe */
export async function authFetch(url, options = {}) {
  const opts = { credentials: 'include', ...options };
  opts.headers = getAuthHeaders(opts.headers || {});
  return fetch(url, opts);
}

/* ===== Comprobación de sesión ===== */
async function meWithCookie() {
  try {
    const r = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
    if (r.ok) return await r.json();
  } catch {}
  return null;
}
async function meWithBearer() {
  const tk = getToken();
  if (!tk) return null;
  try {
    const r = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${tk}` } });
    if (r.ok) return await r.json();
  } catch {}
  return null;
}

export async function isAuthenticated() {
  // 1) Cookie
  const byCookie = await meWithCookie();
  if (byCookie) return byCookie;
  // 2) Bearer
  const byBearer = await meWithBearer();
  if (byBearer) return byBearer;
  return null;
}

export async function redireccionarSiAutenticado() {
  const me = await isAuthenticated();
  if (me) window.location.href = 'index.html';
}

export async function requireAuth() {
  const me = await isAuthenticated();
  if (!me) window.location.href = 'login.html';
  return me; // usuario logueado
}

/* ===== Logout ===== */
export async function logoutAndRedirect() {
  clearToken();
  try {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  window.location.href = 'login.html';
}
