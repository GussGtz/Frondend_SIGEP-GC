import { obtenerToken } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const token = obtenerToken();
  if (!token) return window.location.href = 'login.html';

  const headers = { Authorization: `Bearer ${token}` };

  const resUser = await fetch('http://localhost:3000/api/auth/me', { headers });
  const userData = await resUser.json();
  const userDepartamento = userData.departamento;

  if (userData.role_id === 1) {
    document.getElementById('adminPanel').style.display = 'block';

    document.getElementById('formNuevoPedido').addEventListener('submit', async (e) => {
      e.preventDefault();
      const numero_pedido = document.getElementById('numero_pedido').value;
      const fecha_entrega = document.getElementById('fecha_entrega').value;

      const res = await fetch('http://localhost:3000/api/pedidos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ numero_pedido, fecha_entrega })
      });

      const data = await res.json();
      alert(data.message);
      if (res.ok) location.reload();
    });
  }

  async function cargarPedidos(filtro = 'todos') {
    const url = new URL('http://localhost:3000/api/pedidos');
    if (filtro !== 'todos') url.searchParams.append('completado', filtro);

    const resPedidos = await fetch(url.toString(), { headers });
    const pedidos = await resPedidos.json();
    const cuerpoTabla = document.getElementById('cuerpoTabla');
    cuerpoTabla.innerHTML = '';

    if (Array.isArray(pedidos)) {
      pedidos.forEach(p => {
        const fila = document.createElement('tr');

        const ventas = p.estatus?.ventas?.estado || 'Sin estatus';
        const contabilidad = p.estatus?.contabilidad?.estado || 'Sin estatus';
        const produccion = p.estatus?.produccion?.estado || 'Sin estatus';

        fila.innerHTML = `
          <td>${p.id}</td>
          <td>${p.numero_pedido}</td>
          <td>${p.fecha_creacion}</td>
          <td>${p.fecha_entrega}</td>
          <td>${ventas}</td>
          <td>${contabilidad}</td>
          <td>${produccion}</td>
          <td>
            <select data-id="${p.id}" class="selectEstatus">
              <option disabled selected>Actualizar estatus</option>
              <option value="pendiente">Pendiente</option>
              <option value="en proceso">En proceso</option>
              <option value="completado">Completado</option>
            </select>
          </td>
        `;
        cuerpoTabla.appendChild(fila);
      });

      document.querySelectorAll('.selectEstatus').forEach(select => {
        select.addEventListener('change', async (e) => {
          const pedidoId = e.target.dataset.id;
          const nuevoEstatus = e.target.value;

          const res = await fetch(`http://localhost:3000/api/pedidos/estatus/${pedidoId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ area: userDepartamento, estatus: nuevoEstatus })
          });

          const data = await res.json();
          Swal.fire({
            icon: res.ok ? 'success' : 'error',
            title: res.ok ? '✅ Actualizado' : '❌ Error',
            text: data.message || 'No se pudo actualizar',
            timer: 2000,
            showConfirmButton: false
          });

          cargarPedidos(document.getElementById('filtroCompletado').value);
        });
      });

    } else {
      alert('❌ Error al cargar los pedidos.');
      console.error('⚠️ Respuesta inesperada:', pedidos);
    }
  }

  cargarPedidos();

  document.getElementById('filtroCompletado').addEventListener('change', (e) => {
    cargarPedidos(e.target.value);
  });

  document.getElementById('btnExportarPDF').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const tabla = document.querySelector('#tablaPedidos');
    const tablaClonada = tabla.cloneNode(true);

    tablaClonada.querySelectorAll('thead tr th:last-child').forEach(el => el.remove());
    tablaClonada.querySelectorAll('tbody tr').forEach(tr => {
      tr.querySelectorAll('td:last-child').forEach(td => td.remove());
    });

    doc.autoTable({ html: tablaClonada });
    doc.save('pedidos.pdf');
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  });
});
