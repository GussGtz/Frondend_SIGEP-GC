export function guardarToken(token) {
  localStorage.setItem('token', token);
}

export function obtenerToken() {
  return localStorage.getItem('token');
}

export function redireccionarSiAutenticado() {
  if (obtenerToken()) {
    window.location.href = 'index.html';
  }
}
