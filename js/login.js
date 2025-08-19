// js/login.js — login híbrido (cookie + token)
import { redireccionarSiAutenticado, saveToken } from './auth.js';

const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';

// Si ya está logueado, vete al dashboard
document.addEventListener('DOMContentLoaded', redireccionarSiAutenticado);

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    return Swal.fire({ icon: 'warning', title: 'Campos vacíos', text: 'Por favor, completa todos los campos.' });
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',            // intenta set-cookie httpOnly
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      // Guarda token fallback (PWA/iOS)
      if (data.token) saveToken(data.token);

      Swal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Inicio de sesión exitoso',
        timer: 900,
        showConfirmButton: false,
      });

      setTimeout(() => (window.location.href = 'index.html'), 900);
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error de inicio de sesión',
        text: data.message || 'Correo o contraseña incorrectos.',
      });
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    Swal.fire({ icon: 'error', title: 'Error del servidor', text: 'No se pudo conectar. Inténtalo más tarde.' });
  }
});
