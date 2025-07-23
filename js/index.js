import { obtenerToken } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const token = obtenerToken();
  if (!token) return window.location.href = 'login.html';

  const headers = { Authorization: `Bearer ${token}` };

  const resUser = await fetch('http://localhost:3000/api/auth/me', { headers });
  if (!resUser.ok) {
    localStorage.removeItem('token');
    return window.location.href = 'login.html';
  }

  const userData = await resUser.json();
  const userDepartamento = userData.departamento;
  const esAdmin = userData.role_id === 1;

  if (esAdmin) {
    document.getElementById('adminPanel').style.display = 'block';

    document.getElementById('formNuevoPedido').addEventListener('submit', async (e) => {
      e.preventDefault();
      const numero_pedido = document.getElementById('numero_pedido').value.trim();
      const fecha_entrega = document.getElementById('fecha_entrega').value;

      if (!numero_pedido || !fecha_entrega) return alert('Por favor, completa todos los campos.');

      const res = await fetch('http://localhost:3000/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ numero_pedido, fecha_entrega })
      });

      const data = await res.json();
      alert(data.message);
      if (res.ok) location.reload();
    });

    document.getElementById('btnEliminarCompletados').addEventListener('click', async () => {
      const confirmacion = await Swal.fire({
        title: '¿Eliminar todos los pedidos completados?',
        text: 'Esta acción eliminará todos los pedidos con estatus completado y no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar todos',
        cancelButtonText: 'Cancelar'
      });

      if (confirmacion.isConfirmed) {
        const res = await fetch('http://localhost:3000/api/pedidos/completados', {
          method: 'DELETE',
          headers
        });

        const data = await res.json();

        Swal.fire({
          icon: res.ok ? 'success' : 'error',
          title: res.ok ? 'Pedidos eliminados' : 'Error',
          text: data.message,
          timer: 2500,
          showConfirmButton: false
        });

        if (res.ok) cargarPedidos('true');
      }
    });
  }

  async function cargarPedidos(filtro = 'todos') {
    const url = new URL('http://localhost:3000/api/pedidos');
    if (filtro !== 'todos') url.searchParams.append('completado', filtro);

    const resPedidos = await fetch(url.toString(), { headers });
    if (!resPedidos.ok) {
      alert('Error al cargar pedidos');
      return console.error(await resPedidos.text());
    }

    const pedidos = await resPedidos.json();
    const cuerpoTabla = document.getElementById('cuerpoTabla');
    const thead = document.querySelector('#tablaPedidos thead tr');
    cuerpoTabla.innerHTML = '';

    if (esAdmin && filtro === 'true' && !thead.querySelector('.col-eliminar')) {
      const th = document.createElement('th');
      th.textContent = 'Eliminar';
      th.classList.add('col-eliminar');
      thead.appendChild(th);
    } else if ((!esAdmin || filtro !== 'true') && thead.querySelector('.col-eliminar')) {
      thead.querySelector('.col-eliminar').remove();
    }

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
        <td>
          <button class="btnComentario" data-id="${p.id}" data-area="${userDepartamento}" title="Ver/agregar comentario">
            📝
          </button>
        </td>
      `;

      if (esAdmin && filtro === 'true') {
        const td = document.createElement('td');
        td.classList.add('col-eliminar');
        td.innerHTML = `<button class="btnEliminar" data-id="${p.id}" style="color:#dc3545; background:none; border:none; font-size:1.2rem;" title="Eliminar"><i class="bi bi-trash-fill"></i></button>`;
        fila.appendChild(td);
      }

      cuerpoTabla.appendChild(fila);
    });

    document.querySelectorAll('.selectEstatus').forEach(select => {
      select.addEventListener('change', async (e) => {
        const pedidoId = e.target.dataset.id;
        const nuevoEstatus = e.target.value;

        const res = await fetch(`http://localhost:3000/api/pedidos/estatus/${pedidoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

    document.querySelectorAll('.btnComentario').forEach(btn => {
      btn.addEventListener('click', async () => {
        comentarioPedidoId = btn.dataset.id;
        comentarioArea = btn.dataset.area;

        const res = await fetch(`http://localhost:3000/api/pedidos/comentario/${comentarioPedidoId}`, { headers });
        const data = await res.json();

        const textareaTodos = document.getElementById('comentarioTexto');
        const textareaNuevo = document.getElementById('nuevoComentario');
        textareaTodos.value = '';
        textareaNuevo.value = '';

        if (!Array.isArray(data) || data.length === 0) {
          textareaTodos.value = '[Sin comentarios previos]';
        } else {
          textareaTodos.value = data
            .map(c => `🧭 ${c.area.toUpperCase()}:\n${c.comentarios}`)
            .join('\n\n');

          const propio = data.find(c => c.area === comentarioArea);
          if (propio) textareaNuevo.value = propio.comentarios;
        }

        document.getElementById('comentarioModal').style.display = 'block';
      });
    });

    if (esAdmin && filtro === 'true') {
      document.querySelectorAll('.btnEliminar').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pedidoId = btn.dataset.id;
          const confirmacion = await Swal.fire({
            title: '¿Eliminar pedido?',
            text: 'Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
          });

          if (confirmacion.isConfirmed) {
            const res = await fetch(`http://localhost:3000/api/pedidos/${pedidoId}`, {
              method: 'DELETE',
              headers
            });

            const data = await res.json();
            Swal.fire({
              icon: res.ok ? 'success' : 'error',
              title: res.ok ? 'Eliminado' : 'Error',
              text: data.message,
              timer: 2000,
              showConfirmButton: false
            });

            if (res.ok) cargarPedidos('true');
          }
        });
      });
    }
  }

  cargarPedidos();

  document.getElementById('filtroCompletado').addEventListener('change', (e) => {
    cargarPedidos(e.target.value);
  });

  // ✅ Exportar PDF con solo columnas esenciales
  document.getElementById('btnExportarPDF').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // 🔹 Fecha de generación
  const fecha = new Date();
  const fechaFormateada = fecha.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // 🔹 Título
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTADO DE PEDIDOS DE GLASS CARIBE', 105, 20, { align: 'center' });

  // 🔹 Fecha
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generado el ${fechaFormateada}`, 105, 28, { align: 'center' });

  // 🔹 Tabla de pedidos
  const tabla = document.querySelector('#tablaPedidos');
  const filas = Array.from(tabla.querySelectorAll('tbody tr')).map(tr => {
    const celdas = tr.querySelectorAll('td');
    return [
      celdas[1]?.textContent || '', // Número
      celdas[2]?.textContent || '', // Creación
      celdas[3]?.textContent || '', // Entrega
      celdas[4]?.textContent || '', // Ventas
      celdas[5]?.textContent || '', // Contabilidad
      celdas[6]?.textContent || '', // Producción
    ];
  });

  doc.autoTable({
    startY: 35,
    head: [['Número', 'Creación', 'Entrega', 'Ventas', 'Contabilidad', 'Producción']],
    body: filas,
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: 20,
      cellPadding: 3
    },
    headStyles: {
      fillColor: [13, 110, 253],
      textColor: [255, 255, 255],
      fontSize: 10,
      halign: 'center'
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    }
  });

  doc.save(`Listado_Pedidos_GlassCaribe_${fecha.toLocaleDateString('es-MX')}.pdf`);
});


  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  });

  // ===================== Comentarios ==========================
  let comentarioPedidoId = null;
  let comentarioArea = null;

  document.getElementById('guardarComentario').addEventListener('click', async () => {
    const comentario = document.getElementById('nuevoComentario').value.trim();

    const res = await fetch(`http://localhost:3000/api/pedidos/comentario/${comentarioPedidoId}/${comentarioArea}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ comentario })
    });

    const data = await res.json();
    Swal.fire('Comentario', data.message, res.ok ? 'success' : 'error');
    document.getElementById('comentarioModal').style.display = 'none';
    cargarPedidos();
  });

  document.getElementById('eliminarComentario').addEventListener('click', async () => {
    const res = await fetch(`http://localhost:3000/api/pedidos/comentario/${comentarioPedidoId}/${comentarioArea}`, {
      method: 'DELETE',
      headers
    });

    const data = await res.json();
    Swal.fire('Comentario', data.message, res.ok ? 'success' : 'error');
    document.getElementById('comentarioModal').style.display = 'none';
    cargarPedidos();
  });
});
