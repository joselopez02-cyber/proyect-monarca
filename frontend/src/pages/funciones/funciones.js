/* ============================================================
   funciones.js — Programación de funciones, rango y grupos
   Depende de: api.js, utils.js
   ============================================================ */

const RANGO_HORAS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];

function inicializarRangoHorarios() {
  const wrap = document.getElementById('rango-horarios-wrap');
  if (!wrap) return;
  wrap.innerHTML = RANGO_HORAS.map(h =>
    `<div class="hora-chip" data-hora="${h}" onclick="toggleRangoHora(this)">${h}</div>`
  ).join('');
}

function toggleRangoHora(el) {
  el.classList.toggle('sel');
  calcularRangoPreview();
}

function getHorasSeleccionadas() {
  return Array.from(document.querySelectorAll('#rango-horarios-wrap .hora-chip.sel'))
    .map(el => el.dataset.hora);
}

function getDiasSeleccionados() {
  return Array.from(document.querySelectorAll('#dias-semana-wrap input[type="checkbox"]:checked'))
    .map(el => parseInt(el.value));
}

function toggleDiaChip(el) {
  const cb = el.querySelector('input[type="checkbox"]');
  if (!cb) return;
  cb.checked = !cb.checked;
  el.classList.toggle('activo', cb.checked);
  calcularRangoPreview();
}

function setModoFuncion(modo) {
  document.getElementById('f_modo').value = modo;
  const esRango = modo === 'rango';

  const btnU = document.getElementById('btn-modo-unico');
  const btnR = document.getElementById('btn-modo-rango');
  if (btnU) { btnU.style.background = esRango ? 'transparent' : 'var(--c-gold)'; btnU.style.color = esRango ? 'var(--c-muted)' : 'var(--c-bg)'; }
  if (btnR) { btnR.style.background = esRango ? 'var(--c-gold)' : 'transparent'; btnR.style.color = esRango ? 'var(--c-bg)' : 'var(--c-muted)'; }

  const bU = document.getElementById('bloque-unico');
  const bR = document.getElementById('bloque-rango');
  if (bU) bU.style.display = esRango ? 'none' : 'grid';
  if (bR) bR.style.display = esRango ? 'flex' : 'none';

  const btnSave = document.getElementById('btn-save-f');
  if (btnSave && !document.getElementById('f_id').value) {
    btnSave.textContent = esRango ? '📅 Publicar Rango de Funciones' : 'Publicar Función';
  }

  if (esRango) {
    inicializarRangoHorarios();
    calcularRangoPreview();
  }
}

function calcularRangoPreview() {
  const desde = document.getElementById('f_rango_desde')?.value;
  const hasta = document.getElementById('f_rango_hasta')?.value;
  const horas = getHorasSeleccionadas();
  const dias  = getDiasSeleccionados();

  const cntEl = document.getElementById('rango_horas_count');
  if (cntEl) cntEl.textContent = horas.length ? `(${horas.length} seleccionadas)` : '';

  const previewEl   = document.getElementById('rango_preview');
  const conteoBadge = document.getElementById('rango_conteo_badge');

  if (!desde || !hasta) {
    if (previewEl) previewEl.textContent = 'Elige fechas inicio y fin';
    if (conteoBadge) { conteoBadge.style.display = 'none'; conteoBadge.textContent = ''; }
    return;
  }

  const fechas = generarFechasRango(desde, hasta, dias);
  const total  = fechas.length * (horas.length || 1);

  if (previewEl) {
    previewEl.innerHTML = fechas.length === 0
      ? '<span style="color:var(--c-red)">Sin días en ese rango con los filtros elegidos</span>'
      : `<strong style="color:var(--c-gold)">${fechas.length}</strong> días × <strong style="color:var(--c-gold)">${horas.length || 1}</strong> horarios = <strong style="color:var(--c-gold)">${total}</strong> funciones`;
  }
  if (conteoBadge) {
    conteoBadge.style.display = total > 0 ? 'inline' : 'none';
    conteoBadge.textContent = `${total} funciones a crear`;
  }
}

function generarFechasRango(desde, hasta, diasFiltro) {
  const fechas = [];
  let cur = new Date(desde + 'T12:00:00');
  const fin = new Date(hasta + 'T12:00:00');
  while (cur <= fin) {
    const dow = cur.getDay();
    if (!diasFiltro.length || diasFiltro.includes(dow)) {
      fechas.push(cur.toISOString().split('T')[0]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return fechas;
}

// ── Cargar funciones (admin view) ─────────────────────────────
async function cargarFunciones() {
  const container = document.getElementById('funcionesAgrupadas');
  if (container) container.innerHTML = '<div class="empty-state">Cargando...</div>';
  try {
    const [funciones, peliculas, salas] = await Promise.all([api('/funciones'), api('/peliculas'), api('/salas')]);
    funcionesCache = funciones; peliculasCache = peliculas; salasCache = salas;

    document.getElementById('f_peli').innerHTML =
      '<option value="">-- Selecciona --</option>' +
      peliculas.map(p => `<option value="${p.movieId}">${p.nombre}</option>`).join('');

    const sucursalesUnicas = Object.values(
      salas.reduce((acc, s) => { if (s.sucursal) acc[s.sucursal.branId] = s.sucursal; return acc; }, {})
    );

    document.getElementById('f_sucursal').innerHTML =
      '<option value="">—Todas las sucursales —</option>' +
      sucursalesUnicas.map(s => `<option value="${s.branId}">${s.branLocation || 'Sucursal #' + s.branId}</option>`).join('');

    document.getElementById('f_sala').innerHTML =
      '<option value="">-- Selecciona sala --</option>' +
      salas.map(s => `<option value="${s.salaId}">${s.nombre} — ${tipoLabel(s.tipo)} (${s.capacidad} asientos)</option>`).join('');

    ['fil_f_sucursal', 'mdg_sucursal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<option value="">—Todas —</option>' +
        sucursalesUnicas.map(s => `<option value="${s.branId}">${s.branLocation || 'Sucursal #' + s.branId}</option>`).join('');
    });

    const filPeli = document.getElementById('fil_f_peli');
    if (filPeli) filPeli.innerHTML = '<option value="">—Todas —</option>' +
      peliculas.map(p => `<option value="${p.movieId}">${p.nombre}</option>`).join('');

    const filSala = document.getElementById('fil_f_sala');
    if (filSala) filSala.innerHTML = '<option value="">—Todas —</option>' +
      salas.map(s => `<option value="${s.salaId}">${s.nombre}</option>`).join('');

    const mdgPeli = document.getElementById('mdg_pelicula');
    if (mdgPeli) mdgPeli.innerHTML = '<option value="">-- Selecciona --</option>' +
      peliculas.map(p => `<option value="${p.movieId}">${p.nombre}</option>`).join('');

    const sucSalas = document.getElementById('filtro-suc-salas');
    if (sucSalas) sucSalas.innerHTML = '<option value="">—Todas las sucursales —</option>' +
      sucursalesUnicas.map(s => `<option value="${s.branId}">${s.branLocation || 'Sucursal #' + s.branId}</option>`).join('');

    renderFuncionesAgrupadas(funciones);
  } catch (e) {
    if (container) container.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function filtrarTablaFunciones() {
  const sucId  = document.getElementById('fil_f_sucursal')?.value || '';
  const peliId = document.getElementById('fil_f_peli')?.value || '';
  const salaId = document.getElementById('fil_f_sala')?.value || '';
  const desde  = document.getElementById('fil_f_desde')?.value || '';
  const hasta  = document.getElementById('fil_f_hasta')?.value || '';
  renderFuncionesAgrupadas(funcionesCache.filter(f => {
    if (sucId  && String(f.sala?.sucursal?.branId) !== sucId)  return false;
    if (peliId && String(f.pelicula?.movieId)      !== peliId) return false;
    if (salaId && String(f.sala?.salaId)           !== salaId) return false;
    if (desde  && f.fecha && f.fecha < desde) return false;
    if (hasta  && f.fecha && f.fecha > hasta) return false;
    return true;
  }));
}

function limpiarFiltrosFunciones() {
  ['fil_f_sucursal', 'fil_f_peli', 'fil_f_sala'].forEach(id => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
  ['fil_f_desde', 'fil_f_hasta'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderFuncionesAgrupadas(funcionesCache);
}

function filtrarSalasPorSucursal() {
  const sucId    = document.getElementById('f_sucursal').value;
  const filtradas = sucId ? salasCache.filter(s => String(s.sucursal?.branId) === sucId) : salasCache;
  document.getElementById('f_sala').innerHTML = '<option value="">-- Selecciona sala --</option>' +
    filtradas.map(s => `<option value="${s.salaId}">${s.nombre} — ${tipoLabel(s.tipo)} (${s.capacidad} asientos)</option>`).join('');
}

function cargarEdicionFuncion(id) {
  const f = funcionesCache.find(x => x.funcionId == id);
  if (!f) return;
  document.getElementById('f_id').value       = f.funcionId;
  document.getElementById('f_peli').value     = f.pelicula?.movieId || '';
  const sucId = f.sala?.sucursal?.branId || '';
  document.getElementById('f_sucursal').value = sucId;
  filtrarSalasPorSucursal();
  document.getElementById('f_sala').value     = f.sala?.salaId || '';
  document.getElementById('f_fecha').value    = `${f.fecha || '2025-01-01'}T${f.horaInicio || '00:00'}`;
  document.getElementById('f_precio').value   = f.precioBoleto || 18000;
  document.getElementById('lbl-form-funcion').innerText = 'Editar Función #' + f.funcionId;
  document.getElementById('btn-save-f').innerText       = 'Actualizar Función';
  document.getElementById('btn-cancel-f').style.display = 'inline-flex';
}

function cancelarEdicionFuncion() {
  document.getElementById('f_id').value = '';
  document.getElementById('formFuncion').reset();
  document.getElementById('f_precio').value = '18000';
  document.getElementById('f_sucursal').value = '';
  filtrarSalasPorSucursal();
  document.getElementById('lbl-form-funcion').innerText    = 'Programar Nueva Función';
  document.getElementById('btn-cancel-f').style.display    = 'none';
  document.querySelectorAll('#dias-semana-wrap .dia-chip').forEach(el => {
    el.classList.remove('activo');
    const cb = el.querySelector('input'); if (cb) cb.checked = false;
  });
  document.querySelectorAll('#rango-horarios-wrap .hora-chip').forEach(el => el.classList.remove('sel'));
  const prev = document.getElementById('rango_preview'); if (prev) prev.textContent = '— días generados';
  const badge = document.getElementById('rango_conteo_badge'); if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
  const hcnt = document.getElementById('rango_horas_count'); if (hcnt) hcnt.textContent = '';
}

async function saveFuncion(e) {
  e.preventDefault();
  const id   = document.getElementById('f_id').value;
  const modo = document.getElementById('f_modo').value;

  const peliId = parseInt(document.getElementById('f_peli').value);
  const salaId = parseInt(document.getElementById('f_sala').value);
  const precio = parseInt(document.getElementById('f_precio').value);

  if (!peliId || isNaN(peliId)) { showAlert('Selecciona una película.', 'error'); return; }
  if (!salaId || isNaN(salaId)) { showAlert('Selecciona una sala.', 'error'); return; }

  // Modo edición o único
  if (id || modo !== 'rango') {
    const fechaVal = document.getElementById('f_fecha').value;
    if (!fechaVal) { showAlert('Ingresa una fecha y hora.', 'error'); return; }
    const _fechaSola = fechaVal.split('T')[0];
    const payload = {
      pelicula:     { movieId: peliId },
      sala:         { salaId },
      fecha:        _fechaSola,
      horaInicio:   fechaVal.split('T')[1]?.substring(0, 5) || '00:00',
      precioBoleto: precio,
      fechaInicio:  _fechaSola,
      fechaFin:     _fechaSola,
    };
    try {
      if (id) { await api(`/funciones/${id}`, 'PUT', payload); showAlert('Función actualizada.'); }
      else    { await api('/funciones', 'POST', payload);       showAlert('Función publicada.'); }
      cancelarEdicionFuncion();
      cargarFunciones();
    } catch (err) { showAlert('Error: ' + err.message, 'error'); }
    return;
  }

  // Modo rango
  const desde = document.getElementById('f_rango_desde').value;
  const hasta  = document.getElementById('f_rango_hasta').value;
  if (!desde || !hasta) { showAlert('Ingresa fecha inicio y fin.', 'error'); return; }
  if (desde > hasta)    { showAlert('La fecha inicio debe ser anterior al fin.', 'error'); return; }

  const dias  = getDiasSeleccionados();
  const horas = getHorasSeleccionadas();
  if (!horas.length) { showAlert('Selecciona al menos un horario.', 'error'); return; }

  const fechas = generarFechasRango(desde, hasta, dias);
  if (!fechas.length) { showAlert('No hay días en ese rango con los filtros elegidos.', 'error'); return; }

  const tareas = [];
  for (const fecha of fechas) {
    for (const hora of horas) {
      tareas.push({ fecha, hora });
    }
  }

  const total = tareas.length;
  let ok = 0, fail = 0;

  const wrapProg = document.getElementById('rango-progress-wrap');
  const barEl    = document.getElementById('rango-progress-bar');
  const lblEl    = document.getElementById('rango-progress-label');
  const cntEl    = document.getElementById('rango-progress-count');
  if (wrapProg) wrapProg.style.display = 'block';

  for (let i = 0; i < tareas.length; i++) {
    const { fecha, hora } = tareas[i];
    if (cntEl) cntEl.textContent = `${i + 1}/${total}`;
    if (lblEl) lblEl.textContent = `Publicando ${fecha} ${hora}…`;
    if (barEl) barEl.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
    try {
      await api('/funciones', 'POST', {
        pelicula: { movieId: peliId },
        sala:     { salaId },
        fecha,
        horaInicio: hora,
        precioBoleto: precio,
      });
      ok++;
    } catch (_) { fail++; }
  }

  if (wrapProg) setTimeout(() => { wrapProg.style.display = 'none'; }, 2500);
  if (fail === 0) showAlert(`✅ ${ok} funciones publicadas correctamente.`);
  else            showAlert(`⚠️ ${ok} publicadas, ${fail} fallaron.`, 'error');

  cancelarEdicionFuncion();
  setModoFuncion('unico');
  cargarFunciones();
}


// ── Nota: Las funciones de grupos, modales y batch actions
// están definidas en admin.js para evitar duplicados.
