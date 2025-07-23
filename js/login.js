import { guardarToken } from './auth.js';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    return Swal.fire({
      icon: 'warning',
      title: 'Campos vacíos',
      text: 'Por favor, completa todos los campos.',
    });
  }

  try {
    const res = await fetch('https://backend-sigep-gc.onrender.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      guardarToken(data.token);

      Swal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Inicio de sesión exitoso',
        timer: 1500,
        showConfirmButton: false,
      });

      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1600);
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error de inicio de sesión',
        text: data.message || 'Correo o contraseña incorrectos.',
      });
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error del servidor',
      text: 'No se pudo conectar con el servidor. Inténtalo más tarde.',
    });
  }
});
