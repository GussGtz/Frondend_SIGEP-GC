// js/index.js — dashboard protegido usando cookie
import { requireAuth, logoutAndRedirect } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';

  // 🔐 exige sesión y obtiene al usuario
  const userData = await requireAuth();
  const userDepartamento = (userData?.departamento || '').toLowerCase();
  const esAdmin = userData?.role_id === 1;

  // Estado global
  let comentarioPedidoId = null;
  let comentarioArea = null;
  let rawPedidos = [];
  let paginationEnabled = false;
  let pageSize = 10;
  let currentPage = 1;

  // ======= Helpers =======
  const onlyDate = (s) => (String(s || '').split(' ')[0] || '').trim();
  const norm = (s) => String(s || '').toLowerCase();

  // ======= Panel admin =======
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
        await cargarPedidos(document.getElementById('filtroCompletado').value);
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
        if (res.ok) await cargarPedidos('true');
      }
    });
  }

  // ======= Elementos =======
  const els = {
    filtroCompletado: document.getElementById('filtroCompletado'),
    // date groups (seg pills):
    segPills: document.querySelectorAll('.seg-pill'),
    // date inputs:
    fCreacionDesde: document.getElementById('fCreacionDesde'),
    fCreacionHasta: document.getElementById('fCreacionHasta'),
    fEntregaDesde: document.getElementById('fEntregaDesde'),
    fEntregaHasta: document.getElementById('fEntregaHasta'),
    // simple filters:
    fNumero: document.getElementById('fNumero'),
    fDepartamento: document.getElementById('fDepartamento'),
    fEstatus: document.getElementById('fEstatus'),
    // actions:
    btnLimpiarFiltros: document.getElementById('btnLimpiarFiltros'),
    // pagination
    chkPaginar: document.getElementById('chkPaginar'),
    pageSize: document.getElementById('pageSize'),
    paginationBar: document.getElementById('paginationBar'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    pageInfo: document.getElementById('pageInfo'),
    // admin btn
    btnEliminarCompletados: document.getElementById('btnEliminarCompletados'),
  };

  // Estado de modo de fechas
  const dateMode = { creacion: 'specific', entrega: 'specific' };

  // Manejador de “segment pills”
  els.segPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const group = pill.dataset.group;   // 'creacion' | 'entrega'
      const mode = pill.dataset.mode;     // 'any'|'specific'|'after'|'before'|'between'
      // limpiar activos del grupo
      document.querySelectorAll(`.seg-pill[data-group="${group}"]`).forEach(x => x.classList.remove('active'));
      pill.classList.add('active');
      dateMode[group] = mode;
      currentPage = 1;
      render();
    });
  });

  // ======= Filtros =======
  const getFilters = () => ({
    completado: els.filtroCompletado.value,
    creacionDesde: els.fCreacionDesde.value || null,
    creacionHasta: els.fCreacionHasta.value || null,
    entregaDesde: els.fEntregaDesde.value || null,
    entregaHasta: els.fEntregaHasta.value || null,
    numero: norm(els.fNumero.value),
    departamento: els.fDepartamento.value,
    estatus: els.fEstatus.value,
  });

  const clearFilters = () => {
    els.fCreacionDesde.value = '';
    els.fCreacionHasta.value = '';
    els.fEntregaDesde.value = '';
    els.fEntregaHasta.value = '';
    els.fNumero.value = '';
    els.fDepartamento.value = 'todos';
    els.fEstatus.value = 'todos';
    // reset pills to 'specific'
    document.querySelectorAll('.seg-pill[data-group="creacion"]').forEach(x => x.classList.remove('active'));
    document.querySelector('.seg-pill[data-group="creacion"][data-mode="specific"]').classList.add('active');
    document.querySelectorAll('.seg-pill[data-group="entrega"]').forEach(x => x.classList.remove('active'));
    document.querySelector('.seg-pill[data-group="entrega"][data-mode="specific"]').classList.add('active');
    dateMode.creacion = 'specific';
    dateMode.entrega = 'specific';
    currentPage = 1;
    render();
  };

  // ======= Filtrado client-side =======
  const matchDateByMode = (valueYMD, mode, d1, d2) => {
    if (!valueYMD) return false;
    // valueYMD es 'YYYY-MM-DD' (creación ya la normalizamos)
    const v = valueYMD;
    switch (mode) {
      case 'any': return true;
      case 'specific': return d1 ? v === d1 : true;
      case 'after': return d1 ? v > d1 : true;
      case 'before': return d1 ? v < d1 : true;
      case 'between': {
        if (!d1 && !d2) return true;
        if (d1 && !d2) return v >= d1;
        if (!d1 && d2) return v <= d2;
        return v >= d1 && v <= d2;
      }
      default: return true;
    }
  };

  const pedidoTieneEstatus = (p, depto, est) => {
    const toLow = (x) => norm(x).trim();
    const estAreas = {
      ventas: toLow(p.estatus?.ventas?.estado || 'sin estatus'),
      contabilidad: toLow(p.estatus?.contabilidad?.estado || 'sin estatus'),
      produccion: toLow(p.estatus?.produccion?.estado || 'sin estatus'),
    };

    if (depto !== 'todos') {
      const val = estAreas[depto] || 'sin estatus';
      if (est === 'todos') return true;
      return val === est;
    }

    if (est === 'todos') return true;
    return Object.values(estAreas).some(v => v === est);
  };

  const filterPedidos = (list) => {
    const f = getFilters();
    let out = [...list];

    // Fecha de creación (usar solo fecha)
    out = out.filter(p => matchDateByMode(
      onlyDate(p.fecha_creacion),
      dateMode.creacion,
      f.creacionDesde,
      f.creacionHasta
    ));

    // Fecha de entrega (YYYY-MM-DD ya viene limpio)
    out = out.filter(p => matchDateByMode(
      p.fecha_entrega,
      dateMode.entrega,
      f.entregaDesde,
      f.entregaHasta
    ));

    if (f.numero) {
      out = out.filter(p => norm(p.numero_pedido).includes(f.numero));
    }

    // Estatus por departamento (tal cual pediste: filtra el estatus de los departamentos)
    if (f.departamento !== 'todos' || f.estatus !== 'todos') {
      out = out.filter(p => pedidoTieneEstatus(p, f.departamento, f.estatus));
    }

    return out;
  };

  // ======= Render =======
  function render() {
    const cuerpoTabla = document.getElementById('cuerpoTabla');
    cuerpoTabla.innerHTML = '';

    // Mostrar botón "Eliminar completados" solo a admin
    els.btnEliminarCompletados.style.display = esAdmin ? 'inline-block' : 'none';

    let working = filterPedidos(rawPedidos);

    // Paginación
    if (paginationEnabled) {
      els.paginationBar.style.display = 'flex';
      const total = working.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      const pageItems = working.slice(start, end);

      els.pageInfo.textContent = `Página ${currentPage} de ${totalPages} — ${total} registros`;
      els.btnPrev.disabled = currentPage <= 1;
      els.btnNext.disabled = currentPage >= totalPages;

      working = pageItems;
    } else {
      els.paginationBar.style.display = 'none';
    }

    // Render filas
    working.forEach(p => {
      const fila = document.createElement('tr');
      const ventas = p.estatus?.ventas?.estado || 'Sin estatus';
      const contabilidad = p.estatus?.contabilidad?.estado || 'Sin estatus';
      const produccion = p.estatus?.produccion?.estado || 'Sin estatus';

      const hayComentarios =
        (p.estatus?.ventas?.comentarios || '').trim() !== '' ||
        (p.estatus?.contabilidad?.comentarios || '').trim() !== '' ||
        (p.estatus?.produccion?.comentarios || '').trim() !== '';

      const fechaCreacionSolo = onlyDate(p.fecha_creacion);

      fila.innerHTML = `
        <td>${p.id}</td>
        <td>${p.numero_pedido}</td>
        <td>${fechaCreacionSolo}</td>
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
          <button class="btnComentario btn btn-light btn-sm" data-id="${p.id}" data-area="${userDepartamento}" title="Ver/agregar comentario">📝</button>
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
        <td>
          ${esAdmin ? `<button class="btnEliminar btn btn-outline-danger btn-sm" data-id="${p.id}" title="Eliminar"><i class="bi bi-trash-fill"></i></button>` : ''}
        </td>
      `;

      cuerpoTabla.appendChild(fila);
    });
  }

  // ======= Cargar pedidos =======
  async function cargarPedidos(filtro = 'todos') {
    const url = new URL(`${API_URL}/api/pedidos`);
    if (filtro !== 'todos') url.searchParams.append('completado', filtro);

    const resPedidos = await fetch(url.toString(), { credentials: 'include' });
    if (!resPedidos.ok) {
      console.error('Error pedidos:', await resPedidos.text());
      Swal.fire('Error', 'No se pudo cargar la lista de pedidos', 'error');
      return;
    }

    rawPedidos = await resPedidos.json();
    currentPage = 1;
    render();
  }

  // ======= Delegación de eventos en tabla =======
  const cuerpoTabla = document.getElementById('cuerpoTabla');

  // Cambiar estatus
  cuerpoTabla.addEventListener('change', async (e) => {
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
      await cargarPedidos(els.filtroCompletado.value);
    }
  });

  // Comentarios + Eliminar
  cuerpoTabla.addEventListener('click', async (e) => {
    // Abrir modal comentarios
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

      $('#commentModal').modal('show');
      return;
    }

    // Eliminar pedido (SIEMPRE visible para admin)
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
        if (res.ok) await cargarPedidos(els.filtroCompletado.value);
      }
    }
  });

  // ======= Eventos de filtros / paginación =======
  els.filtroCompletado.addEventListener('change', async (e) => {
    await cargarPedidos(e.target.value);
  });

  ['fCreacionDesde','fCreacionHasta','fEntregaDesde','fEntregaHasta','fNumero','fDepartamento','fEstatus']
    .forEach(id => els[id].addEventListener('input', () => { currentPage = 1; render(); }));

  els.btnLimpiarFiltros.addEventListener('click', clearFilters);

  els.chkPaginar.addEventListener('change', () => {
    paginationEnabled = els.chkPaginar.checked;
    document.getElementById('pageSize').style.display = paginationEnabled ? 'inline-block' : 'none';
    currentPage = 1;
    render();
  });

  els.pageSize.addEventListener('change', () => {
    pageSize = parseInt(els.pageSize.value, 10) || 10;
    currentPage = 1;
    render();
  });

  els.btnPrev.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; render(); }
  });

  els.btnNext.addEventListener('click', () => {
    currentPage++; render();
  });

  // ======= PDF =======
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

  // ======= Logout =======
  document.getElementById('logoutBtn').addEventListener('click', logoutAndRedirect);

  // ======= Modal Comentarios: guardar / eliminar / cerrar =======
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
      $('#commentModal').modal('hide');
      await cargarPedidos(document.getElementById('filtroCompletado').value);
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
      $('#commentModal').modal('hide');
      await cargarPedidos(document.getElementById('filtroCompletado').value);
    }
  });

  document.getElementById('cerrarComentario').addEventListener('click', () => {
    $('#commentModal').modal('hide');
  });

  // ======= Primera carga =======
  await cargarPedidos();
});
