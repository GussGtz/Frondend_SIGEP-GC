// js/index.js — dashboard protegido usando cookie
import { requireAuth, logoutAndRedirect } from './auth.js';

// evita doble ejecución si el HTML accidentalmente inyecta dos veces el script
if (window.__SIGEP_BOOTED) {
  console.warn('App ya inicializada. Evitando doble carga.');
} else {
  window.__SIGEP_BOOTED = true;

  document.addEventListener('DOMContentLoaded', async () => {
    const API_URL = (window.__ENV__ && window.__ENV__.API_URL) || 'https://backend-sigep-gc1.onrender.com';

    // 🔐 Sesión
    const userData = await requireAuth();
    const userDepartamento = (userData?.departamento || '').toLowerCase();
    const esAdmin = userData?.role_id === 1;

    // ===== Estado global =====
    let comentarioPedidoId = null;
    let comentarioArea = null;
    let rawPedidos = [];
    let paginationEnabled = false;
    let pageSize = 10;
    let currentPage = 1;

    // ===== Elementos =====
    const els = {
      filtroCompletado: document.getElementById('filtroCompletado'),
      // modal filtros
      btnOpenFilters: document.getElementById('btnOpenFilters'),
      segPills: () => document.querySelectorAll('#filtersModal .seg-pill'),
      fCreacionDesde: document.getElementById('fCreacionDesde'),
      fCreacionHasta: document.getElementById('fCreacionHasta'),
      wrapCreacionHasta: document.getElementById('wrapCreacionHasta'),
      fEntregaDesde: document.getElementById('fEntregaDesde'),
      fEntregaHasta: document.getElementById('fEntregaHasta'),
      wrapEntregaHasta: document.getElementById('wrapEntregaHasta'),
      fNumero: document.getElementById('fNumero'),
      fDepartamento: document.getElementById('fDepartamento'),
      fEstatus: document.getElementById('fEstatus'),
      btnLimpiarFiltros: document.getElementById('btnLimpiarFiltros'),
      btnAplicarFiltros: document.getElementById('btnAplicarFiltros'),
      // paginación
      chkPaginar: document.getElementById('chkPaginar'),
      pageSize: document.getElementById('pageSize'),
      paginationBar: document.getElementById('paginationBar'),
      btnPrev: document.getElementById('btnPrev'),
      btnNext: document.getElementById('btnNext'),
      pageInfo: document.getElementById('pageInfo'),
      totalInfo: document.getElementById('totalInfo'),
      // admin
      btnEliminarCompletados: document.getElementById('btnEliminarCompletados'),
      thEliminar: document.getElementById('thEliminar'),
      cuerpoTabla: document.getElementById('cuerpoTabla'),
    };

    // Oculta columna Eliminar si NO es admin
    if (!esAdmin && els.thEliminar) els.thEliminar.style.display = 'none';

    // Persistencia
    const SKEY = 'sigepgc.ui';
    const saveState = () => {
      const state = {
        filtroCompletado: els.filtroCompletado.value,
        paginationEnabled,
        pageSize,
        filters: {
          creacionMode: dateMode.creacion,
          entregaMode: dateMode.entrega,
          fCreacionDesde: els.fCreacionDesde.value,
          fCreacionHasta: els.fCreacionHasta.value,
          fEntregaDesde: els.fEntregaDesde.value,
          fEntregaHasta: els.fEntregaHasta.value,
          fNumero: els.fNumero.value,
          fDepartamento: els.fDepartamento.value,
          fEstatus: els.fEstatus.value,
        }
      };
      localStorage.setItem(SKEY, JSON.stringify(state));
    };
    const loadState = () => {
      try {
        const raw = localStorage.getItem(SKEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    };

    // ===== Helpers =====
    const onlyDate = (s) => (String(s || '').split(' ')[0] || '').trim();
    const norm = (s) => String(s || '').toLowerCase();

    // ===== Panel admin =====
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
          await cargarPedidos(els.filtroCompletado.value);
        } else {
          Swal.fire('Error', data.message || 'No se pudo crear el pedido', 'error');
        }
      });

      // Eliminar completados (masivo)
      els.btnEliminarCompletados.addEventListener('click', async () => {
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
    } else {
      // si no es admin, oculta botón masivo
      els.btnEliminarCompletados.style.display = 'none';
    }

    // ===== Fecha modes =====
    const dateMode = { creacion: 'specific', entrega: 'specific' };

    function updateDateInputsVisibility() {
      // CREACIÓN
      if (dateMode.creacion === 'specific' || dateMode.creacion === 'after') {
        els.fCreacionDesde.parentElement.style.display = '';
        els.wrapCreacionHasta.style.display = 'none';
        if (dateMode.creacion === 'specific' && els.fCreacionHasta.value) els.fCreacionDesde.value = els.fCreacionHasta.value;
        els.fCreacionHasta.value = '';
      } else if (dateMode.creacion === 'before') {
        els.fCreacionDesde.parentElement.style.display = 'none';
        els.wrapCreacionHasta.style.display = '';
        els.fCreacionDesde.value = '';
      } else if (dateMode.creacion === 'between') {
        els.fCreacionDesde.parentElement.style.display = '';
        els.wrapCreacionHasta.style.display = '';
      } else { // any
        els.fCreacionDesde.parentElement.style.display = 'none';
        els.wrapCreacionHasta.style.display = 'none';
        els.fCreacionDesde.value = '';
        els.fCreacionHasta.value = '';
      }

      // ENTREGA
      if (dateMode.entrega === 'specific' || dateMode.entrega === 'after') {
        els.fEntregaDesde.parentElement.style.display = '';
        els.wrapEntregaHasta.style.display = 'none';
        if (dateMode.entrega === 'specific' && els.fEntregaHasta.value) els.fEntregaDesde.value = els.fEntregaHasta.value;
        els.fEntregaHasta.value = '';
      } else if (dateMode.entrega === 'before') {
        els.fEntregaDesde.parentElement.style.display = 'none';
        els.wrapEntregaHasta.style.display = '';
        els.fEntregaDesde.value = '';
      } else if (dateMode.entrega === 'between') {
        els.fEntregaDesde.parentElement.style.display = '';
        els.wrapEntregaHasta.style.display = '';
      } else { // any
        els.fEntregaDesde.parentElement.style.display = 'none';
        els.wrapEntregaHasta.style.display = 'none';
        els.fEntregaDesde.value = '';
        els.fEntregaHasta.value = '';
      }
    }

    // Abrir modal filtros
    els.btnOpenFilters.addEventListener('click', () => {
      $('#filtersModal').modal('show');
      updateDateInputsVisibility();
    });

    // Pills handlers
    els.segPills().forEach(pill => {
      pill.addEventListener('click', () => {
        const group = pill.dataset.group;
        const mode = pill.dataset.mode;
        document.querySelectorAll(`#filtersModal .seg-pill[data-group="${group}"]`).forEach(x => x.classList.remove('active'));
        pill.classList.add('active');
        dateMode[group] = mode;
        updateDateInputsVisibility();
      });
    });

    // Leer filtros
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

    // Limpiar
    const clearFilters = () => {
      els.fCreacionDesde.value = '';
      els.fCreacionHasta.value = '';
      els.fEntregaDesde.value = '';
      els.fEntregaHasta.value = '';
      els.fNumero.value = '';
      els.fDepartamento.value = 'todos';
      els.fEstatus.value = 'todos';

      document.querySelectorAll('#filtersModal .seg-pill[data-group="creacion"]').forEach(x => x.classList.remove('active'));
      document.querySelector('#filtersModal .seg-pill[data-group="creacion"][data-mode="specific"]').classList.add('active');
      document.querySelectorAll('#filtersModal .seg-pill[data-group="entrega"]').forEach(x => x.classList.remove('active'));
      document.querySelector('#filtersModal .seg-pill[data-group="entrega"][data-mode="specific"]').classList.add('active');
      dateMode.creacion = 'specific';
      dateMode.entrega = 'specific';
      updateDateInputsVisibility();

      currentPage = 1;
      saveState();
      render();
    };

    els.btnAplicarFiltros.addEventListener('click', () => {
      currentPage = 1;
      saveState();
      render();
    });
    els.btnLimpiarFiltros.addEventListener('click', clearFilters);

    // ===== Filtrado =====
    const matchDateByMode = (valueYMD, mode, d1, d2) => {
      if (!valueYMD) return false;
      const v = valueYMD;
      switch (mode) {
        case 'any': return true;
        case 'specific': return d1 ? v === d1 : true;
        case 'after': return d1 ? v > d1 : true;
        case 'before': return d2 ? v < d2 : true;
        case 'between':
          if (!d1 && !d2) return true;
          if (d1 && !d2) return v >= d1;
          if (!d1 && d2) return v <= d2;
          return v >= d1 && v <= d2;
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

      out = out.filter(p => matchDateByMode(
        onlyDate(p.fecha_creacion),
        dateMode.creacion,
        f.creacionDesde,
        f.creacionHasta
      ));

      out = out.filter(p => matchDateByMode(
        p.fecha_entrega,
        dateMode.entrega,
        f.entregaDesde,
        f.entregaHasta
      ));

      if (f.numero) {
        out = out.filter(p => norm(p.numero_pedido).includes(f.numero));
      }

      if (f.departamento !== 'todos' || f.estatus !== 'todos') {
        out = out.filter(p => pedidoTieneEstatus(p, f.departamento, f.estatus));
      }

      return out;
    };

    // ===== Paginación UI (renombrado para evitar colisiones) =====
    const updatePaginationUI = () => {
      const chk = els.chkPaginar;
      const sel = els.pageSize;
      const bar = els.paginationBar;
      chk.checked = paginationEnabled;
      sel.style.display = paginationEnabled ? 'inline-block' : 'none';
      bar.style.display = paginationEnabled ? 'flex' : 'none';
    };

    // ===== Render =====
    function render() {
      els.cuerpoTabla.innerHTML = '';

      // Mostrar/ocultar bulk delete
      els.btnEliminarCompletados.style.display = esAdmin ? 'inline-block' : 'none';

      let working = filterPedidos(rawPedidos);

      // Contador total (siempre)
      els.totalInfo.textContent = `${working.length} registros`;

      // Paginación
      if (paginationEnabled) {
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
        els.paginationBar.style.display = 'flex';
      } else {
        els.paginationBar.style.display = 'none';
      }

      // Filas
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

        const btnComentario = `
          <button class="btn-icon btnComentario" data-id="${p.id}" data-area="${userDepartamento}" title="Ver/agregar comentario" data-toggle="tooltip">
            <i class="bi bi-chat-dots"></i>
          </button>`;

        const btnEliminar = esAdmin ? `
          <button class="btn-icon btnEliminar text-danger" data-id="${p.id}" title="Eliminar pedido" data-toggle="tooltip">
            <i class="bi bi-trash-fill"></i>
          </button>` : '';

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
          <td>${btnComentario}</td>
          <td class="col-ripple">
            ${hayComentarios ? `
              <a href="javascript:void(0)" class="intro-banner-vdo-play-btn pinkBg" title="Tiene comentarios">
                <i class="bi bi-bell-fill"></i>
                <span class="ripple pinkBg"></span>
                <span class="ripple pinkBg"></span>
                <span class="ripple pinkBg"></span>
              </a>` : ''}
          </td>
          <td class="cell-eliminar">${btnEliminar}</td>
        `;

        if (!esAdmin) {
          if (els.thEliminar) els.thEliminar.style.display = 'none';
          fila.querySelector('.cell-eliminar').style.display = 'none';
        }

        els.cuerpoTabla.appendChild(fila);
      });

      // Tooltips
      $('[data-toggle="tooltip"]').tooltip({ container: 'body' });
    }

    // ===== Cargar pedidos =====
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

    // ===== Delegación: tabla =====
    // Cambiar estatus
    els.cuerpoTabla.addEventListener('change', async (e) => {
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
    els.cuerpoTabla.addEventListener('click', async (e) => {
      // Comentarios
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

        $('#filtersModal').modal('hide');
        $('#commentModal').modal('show');
        return;
      }

      // Eliminar (admin)
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
          let payload = {};
          try { payload = await res.json(); } catch {}
          if (res.ok) {
            Swal.fire('Eliminado', payload.message || 'Pedido eliminado correctamente', 'success');
            await cargarPedidos(els.filtroCompletado.value);
          } else {
            Swal.fire('Error', payload.message || 'No se pudo eliminar', 'error');
          }
        }
      }
    });

    // ===== Filtro rápido =====
    els.filtroCompletado.addEventListener('change', async (e) => {
      saveState();
      await cargarPedidos(e.target.value);
    });

    // ===== Paginación =====
    updatePaginationUI();

    els.chkPaginar.addEventListener('change', () => {
      paginationEnabled = els.chkPaginar.checked;
      currentPage = 1;
      saveState();
      updatePaginationUI();
      render();
    });

    els.pageSize.addEventListener('change', () => {
      pageSize = parseInt(els.pageSize.value, 10) || 10;
      currentPage = 1;
      saveState();
      render();
    });

    els.btnPrev.addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; saveState(); render(); }
    });

    els.btnNext.addEventListener('click', () => {
      currentPage++; saveState(); render();
    });

    // ===== PDF =====
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

    // ===== Logout =====
    document.getElementById('logoutBtn').addEventListener('click', logoutAndRedirect);

    // ===== Restaurar estado guardado =====
    (function restore() {
      const st = loadState();
      if (!st) return;
      if (st.filtroCompletado) els.filtroCompletado.value = st.filtroCompletado;
      paginationEnabled = !!st.paginationEnabled;
      pageSize = parseInt(st.pageSize || 10, 10);
      els.pageSize.value = String(pageSize);
      updatePaginationUI();
      const f = st.filters || {};
      dateMode.creacion = f.creacionMode || 'specific';
      dateMode.entrega = f.entregaMode || 'specific';
      ['fCreacionDesde','fCreacionHasta','fEntregaDesde','fEntregaHasta','fNumero'].forEach(id => { if (f[id] !== undefined) els[id].value = f[id]; });
      if (f.fDepartamento) els.fDepartamento.value = f.fDepartamento;
      if (f.fEstatus) els.fEstatus.value = f.fEstatus;
      document.querySelectorAll('#filtersModal .seg-pill[data-group="creacion"]').forEach(x => x.classList.remove('active'));
      document.querySelector(`#filtersModal .seg-pill[data-group="creacion"][data-mode="${dateMode.creacion}"]`)?.classList.add('active');
      document.querySelectorAll('#filtersModal .seg-pill[data-group="entrega"]').forEach(x => x.classList.remove('active'));
      document.querySelector(`#filtersModal .seg-pill[data-group="entrega"][data-mode="${dateMode.entrega}"]`)?.classList.add('active');
      updateDateInputsVisibility();
    })();

    // ===== Primera carga =====
    await cargarPedidos(els.filtroCompletado.value || 'todos');
  });
}
