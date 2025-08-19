// registrar.js — usa cookie httpOnly; muestra selector de rol solo si es admin
import { isAuthenticated } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';
  const rolSelector = document.getElementById('rolSelector');

  try {
    const user = await isAuthenticated();
    if (user?.role_id === 1) {
      rolSelector.style.display = 'block';
    }
  } catch (err) {
    console.error('⚠️ No se pudo verificar el rol del usuario', err);
  }

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const departamento = document.getElementById('departamento').value;

    const role_id = rolSelector.style.display !== 'none'
      ? parseInt(document.getElementById('role_id').value)
      : undefined;

    if (!nombre || !email || !password || !departamento) {
      return Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Por favor, completa todos los campos requeridos.' });
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password, role_id, departamento })
      });

      const data = await res.json();

      if (res.ok) {
        Swal.fire({ icon: 'success', title: 'Registro exitoso', text: 'Serás redirigido al login...', timer: 1800, showConfirmButton: false });
        setTimeout(() => (window.location.href = 'login.html'), 1800);
      } else {
        Swal.fire({ icon: 'error', title: 'Error al registrarse', text: data.message || 'Hubo un problema durante el registro.' });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error del servidor', text: 'No se pudo procesar el registro. Inténtalo más tarde.' });
    }
  });
});
