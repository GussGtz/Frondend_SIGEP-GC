import { guardarToken } from './auth.js';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    Swal.fire({
      icon: 'warning',
      title: 'Campos vacíos',
      text: 'Por favor, completa todos los campos.',
    });
    return;
  }

  try {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      Swal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Inicio de sesión exitoso',
        timer: 1500,
        showConfirmButton: false,
      });

      guardarToken(data.token);
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1600);
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error de inicio de sesión',
        text: data.msg || 'Correo o contraseña incorrectos',
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
