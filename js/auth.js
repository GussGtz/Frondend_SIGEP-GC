// auth.js — versión cookies HTTP-only (sin localStorage)
const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';

export async function isAuthenticated() {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data; // { role_id, departamento, ... } según tu backend
  } catch {
    return null;
  }
}

export async function redireccionarSiAutenticado() {
  const me = await isAuthenticated();
  if (me) window.location.href = 'index.html';
}

export async function requireAuth() {
  const me = await isAuthenticated();
  if (!me) window.location.href = 'login.html';
  return me; // devuelve usuario logueado
}

// Opcional: logout por endpoint
export async function logoutAndRedirect() {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {}
  window.location.href = 'login.html';
}
