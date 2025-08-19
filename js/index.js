// js/index.js — dashboard protegido usando cookie
import { requireAuth, logoutAndRedirect } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';

  // 🔐 exige sesión y obtiene al usuario
  const userData = await requireAuth();
  const userDepartamento = (userData?.departamento || '').toLowerCase();
  const esAdmin = userData?.role_id === 1;

  // Estado para comentarios (evita null/null)
  let comentarioPedidoId = null;
  let comentarioArea = null;

  // Panel admin
  if (esAdmin) {
    document.getElementById('adminPanel').style.display = 'block';

    // Crear pedido
    document.getElementById('formNuevoPedido').addEventListener('submit', async (e) => {
      e.preventDefault();
      const numero_pedido = document.getElementById('numero_pedido').value.trim();
      const fecha_entrega = document.getElementById('fecha_entrega').value;

      if (!numero_pedido || !fecha_entrega) {
        Swal.fire('Campos requeridos', 'Por favor, completa todos los campos.', 'warning');
        return;
      }

      const res = await fetch(`${API_URL}/api/pedidos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_pedido, fecha_entrega })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Swal.fire('Creado', data.message || 'Pedido creado correctamente', 'success');
        document.getElementById('numero_pedido').value = '';
        document.getElementById('fecha_entrega').value = '';
        cargarPedidos(document.getElementById('filtroCompletado').value);
      } else {
        Swal.fire('Error', data.message || 'No se pudo crear el pedido', 'error');
      }
    });

    // Eliminar completados
    document.getElementById('btnEliminarCompletados').addEventListener('click', async () => {
      const confirmacion = await Swal.fire({
        title: '¿Eliminar pedidos completados?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      });

      if (confirmacion.isConfirmed) {
        const res = await fetch(`${API_URL}/api/pedidos/completados`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        Swal.fire(res.ok ? 'Eliminados' : 'Error', data.message || '', res.ok ? 'success' : 'error');
        if (res.ok) cargarPedidos('true');
      }
    });
  }

  // Cargar pedidos
  async function cargarPedidos(filtro = 'todos') {
    const url = new URL(`${API_URL}/api/pedidos`);
    if (filtro !== 'todos') url.searchParams.append('completado', filtro);

    const resPedidos = await fetch(url.toString(), { credentials: 'include' });
    if (!resPedidos.ok) {
      console.error('Error pedidos:', await resPedidos.text());
      Swal.fire('Error', 'No se pudo cargar la lista de pedidos', 'error');
      return;
    }

    const pedidos = await resPedidos.json();
    const cuerpoTabla = document.getElementById('cuerpoTabla');
    const thead = document.querySelector('#tablaPedidos thead tr');
    cuerpoTabla.innerHTML = '';

    // Mostrar botón "Eliminar completados" solo a admin
    document.getElementById('btnEliminarCompletados').style.display = esAdmin ? 'inline-block' : 'none';

    // Columna "Eliminar" solo si es admin y filtro=Completados
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

      // Detecta si hay comentarios en alguna área del pedido
      const hayComentarios =
        (p.estatus?.ventas?.comentarios || '').trim() !== '' ||
        (p.estatus?.contabilidad?.comentarios || '').trim() !== '' ||
        (p.estatus?.produccion?.comentarios || '').trim() !== '';

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
          <button class="btnComentario" data-id="${p.id}" data-area="${userDepartamento}" title="Ver/agregar comentario">📝</button>
        </td>
        <td class="col-ripple">
          ${hayComentarios ? `
            <a href="javascript:void(0)" class="intro-banner-vdo-play-btn pinkBg" title="Tiene comentarios">
              <i class="glyphicon glyphicon-play whiteText"></i>
              <span class="ripple pinkBg"></span>
              <span class="ripple pinkBg"></span>
              <span class="ripple pinkBg"></span>
            </a>` : ''}
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
  }

  // Delegación: clicks dentro del tbody (comentarios, eliminar, actualizar)
  const cuerpoTabla = document.getElementById('cuerpoTabla');
  cuerpoTabla.addEventListener('change', async (e) => {
    // Cambiar estatus
    const sel = e.target.closest('.selectEstatus');
    if (sel) {
      const pedidoId = sel.dataset.id;
      const nuevoEstatus = sel.value;

      const res = await fetch(`${API_URL}/api/pedidos/estatus/${pedidoId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: userDepartamento, estatus: nuevoEstatus })
      });

      const data = await res.json().catch(() => ({}));
      Swal.fire(res.ok ? 'Actualizado' : 'Error', data.message || '', res.ok ? 'success' : 'error');
      cargarPedidos(document.getElementById('filtroCompletado').value);
    }
  });

  cuerpoTabla.addEventListener('click', async (e) => {
    // Abrir modal de comentarios
    const btnComentario = e.target.closest('.btnComentario');
    if (btnComentario) {
      comentarioPedidoId = btnComentario.dataset.id || null;
      comentarioArea = (btnComentario.dataset.area || userDepartamento || '').toLowerCase();

      if (!comentarioPedidoId || !comentarioArea) {
        Swal.fire('Error', 'No se pudo determinar el pedido o tu área.', 'error');
        return;
      }

      const res = await fetch(`${API_URL}/api/pedidos/comentario/${comentarioPedidoId}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => []);

      const textareaTodos = document.getElementById('comentarioTexto');
      const textareaNuevo = document.getElementById('nuevoComentario');
      textareaTodos.value = '';
      textareaNuevo.value = '';

      if (!Array.isArray(data) || data.length === 0) {
        textareaTodos.value = '[Sin comentarios previos]';
      } else {
        textareaTodos.value = data
          .map(c => `🧭 ${String(c.area || '').toUpperCase()}:\n${c.comentarios || ''}`)
          .join('\n\n');

        const propio = data.find(c => (c.area || '').toLowerCase() === comentarioArea);
        if (propio) textareaNuevo.value = propio.comentarios || '';
      }

      document.getElementById('comentarioModal').style.display = 'block';
      return;
    }

    // Eliminar pedido (solo admin, en lista de completados)
    const btnEliminar = e.target.closest('.btnEliminar');
    if (btnEliminar) {
      const pedidoId = btnEliminar.dataset.id;
      const confirmacion = await Swal.fire({
        title: '¿Eliminar pedido?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      });

      if (confirmacion.isConfirmed) {
        const res = await fetch(`${API_URL}/api/pedidos/${pedidoId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        Swal.fire(res.ok ? 'Eliminado' : 'Error', data.message || '', res.ok ? 'success' : 'error');
        if (res.ok) cargarPedidos('true');
      }
    }
  });

  // Filtro
  document.getElementById('filtroCompletado').addEventListener('change', (e) => {
    cargarPedidos(e.target.value);
  });

  // Exportar PDF
  document.getElementById('btnExportarPDF').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const fecha = new Date();
    const fechaFormateada = fecha.toLocaleString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.text('LISTADO DE PEDIDOS DE GLASS CARIBE', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generado el ${fechaFormateada}`, 105, 28, { align: 'center' });

    const tabla = document.querySelector('#tablaPedidos');
    const filas = Array.from(tabla.querySelectorAll('tbody tr')).map(tr => {
      const c = tr.querySelectorAll('td');
      return [c[1]?.textContent || '', c[2]?.textContent || '', c[3]?.textContent || '', c[4]?.textContent || '', c[5]?.textContent || '', c[6]?.textContent || ''];
    });

    doc.autoTable({
      startY: 35,
      head: [['Número', 'Creación', 'Entrega', 'Ventas', 'Contabilidad', 'Producción']],
      body: filas,
      styles: { font: 'helvetica', fontSize: 9, textColor: 20, cellPadding: 3 },
      headStyles: { fillColor: [13, 110, 253], textColor: [255, 255, 255], fontSize: 10, halign: 'center' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save(`Listado_Pedidos_GlassCaribe_${fecha.toLocaleDateString('es-MX')}.pdf`);
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', logoutAndRedirect);

  // Modal comentarios: guardar / eliminar / cerrar
  document.getElementById('guardarComentario').addEventListener('click', async () => {
    if (!comentarioPedidoId || !comentarioArea) {
      Swal.fire('Error', 'Abre el comentario desde el botón 📝 primero.', 'error');
      return;
    }
    const comentario = document.getElementById('nuevoComentario').value.trim();

    const res = await fetch(`${API_URL}/api/pedidos/comentario/${comentarioPedidoId}/${comentarioArea}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comentario })
    });

    const data = await res.json().catch(() => ({}));
    Swal.fire('Comentario', data.message || (res.ok ? 'Actualizado' : 'Error'), res.ok ? 'success' : 'error');
    if (res.ok) {
      document.getElementById('comentarioModal').style.display = 'none';
      cargarPedidos(document.getElementById('filtroCompletado').value);
    }
  });

  document.getElementById('eliminarComentario').addEventListener('click', async () => {
    if (!comentarioPedidoId || !comentarioArea) {
      Swal.fire('Error', 'Abre el comentario desde el botón 📝 primero.', 'error');
      return;
    }

    const res = await fetch(`${API_URL}/api/pedidos/comentario/${comentarioPedidoId}/${comentarioArea}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await res.json().catch(() => ({}));
    Swal.fire('Comentario', data.message || (res.ok ? 'Eliminado' : 'Error'), res.ok ? 'success' : 'error');
    if (res.ok) {
      document.getElementById('comentarioModal').style.display = 'none';
      cargarPedidos(document.getElementById('filtroCompletado').value);
    }
  });

  document.getElementById('cerrarComentario').addEventListener('click', () => {
    document.getElementById('comentarioModal').style.display = 'none';
  });

  // Primera carga
  await cargarPedidos();
});
