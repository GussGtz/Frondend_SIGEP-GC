import { obtenerToken } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const token = obtenerToken();
  const rolSelector = document.getElementById('rolSelector');

  // Mostrar selector de rol solo si el usuario es administrador
  if (token) {
    try {
      const resUser = await fetch('https://backend-sigep-gc.onrender.com/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const user = await resUser.json();
      if (resUser.ok && user.role_id === 1) {
        rolSelector.style.display = 'block';
      }
    } catch (err) {
      console.error('⚠️ No se pudo verificar el rol del usuario', err);
    }
  }

  // Manejar el registro
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
      return Swal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor, completa todos los campos requeridos.',
      });
    }

    try {
      const res = await fetch('https://backend-sigep-gc.onrender.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password, role_id, departamento })
      });

      const data = await res.json();

      if (res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Registro exitoso',
          text: 'Serás redirigido al login...',
          timer: 2000,
          showConfirmButton: false
        });

        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error al registrarse',
          text: data.message || 'Hubo un problema durante el registro.',
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: 'error',
        title: 'Error del servidor',
        text: 'No se pudo procesar el registro. Inténtalo más tarde.',
      });
    }
  });
});
