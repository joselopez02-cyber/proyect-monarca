/* ============================================================
   cartelera.js — Cartelera, filtros y modal de selección de función
   Depende de: api.js, utils.js
   ============================================================ */

let _carteleraCards = [];

// ── Cargar cartelera ─────────────────────────────────────────
async function cargarCartelera() {
  // Solo ejecutar si la vista cartelera está activa
  if (!document.getElementById('view-cartelera')?.classList.contains('active')) return;
  const list = document.getElementById('carteleraList');
  list.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Cargando cartelera...</div>';
  try {
    funcionesCache = await api('/funciones/vigentes');
    const hoyStr = new Date().toISOString().split('T')[0];
    funcionesCache = funcionesCache.filter(f => f.fecha && f.fecha >= hoyStr);
    list.innerHTML = '';
    if (!funcionesCache.length) {
      list.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No hay funciones programadas activas.</div>';
      return;
    }

    const pelisMap = {};
    for (const f of funcionesCache) {
      if (!f.pelicula) continue;
      const mid = f.pelicula.movieId;
      if (!pelisMap[mid]) pelisMap[mid] = f.pelicula;
    }

    _carteleraCards = [];
    limpiarFiltrosCartelera();

    for (const peli of Object.values(pelisMap)) {
      const card = document.createElement('div');
      card.className = 'card funcion-card';
      const genreKey   = (peli.genero || '').toLowerCase().replace(/[^a-z_]/g, '');
      const genreLabel = (peli.genero || '—').replace(/_/g, ' ');
      const clasifClass = 'clasif-' + (peli.clasificacion || 'A').replace('+', '');

      card.innerHTML = `
        <div class="funcion-header">
          ${peli.posterUrl
            ? `<img src="${peli.posterUrl}" class="poster-img" alt="${escHtml(peli.nombre)}"
                    onerror="this.style.display='none';this.parentElement.classList.add('no-poster')">`
            : `<div class="funcion-no-poster"></div>`}
          <div class="poster-overlay-badges">
            <span class="badge badge-dur">${peli.duracionMin || '?'} MIN</span>
          </div>
          <h3>${escHtml(peli.nombre).toUpperCase()}</h3>
        </div>
        <div class="funcion-body">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span class="badge badge-genre">${genreLabel}</span>
            <span class="clasif-pill ${clasifClass}" title="Clasificación ${peli.clasificacion || 'A'}">${peli.clasificacion || 'A'}</span>
          </div>
          ${peli.descripcion
            ? `<p class="funcion-desc" style="margin:0;">${escHtml(peli.descripcion)}</p>`
            : '<p class="funcion-desc" style="margin:0;color:var(--c-muted);font-style:italic;">Sin descripción disponible.</p>'}
          <button class="btn-reservar" onclick="abrirSeleccionFuncion(${peli.movieId})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg> Reservar Entrada
          </button>
        </div>`;

      list.appendChild(card);
      _carteleraCards.push({ peli, cardEl: card });
    }

    const peliList = Object.values(pelisMap);
    const generos  = new Set(peliList.map(p => p.genero).filter(Boolean));
    const statsEl  = document.getElementById('carteleraStats');
    if (statsEl) {
      statsEl.style.display = 'flex';
      document.getElementById('stat_pelis_count').textContent     = peliList.length;
      document.getElementById('stat_generos_count').textContent   = generos.size;
      document.getElementById('stat_funciones_count').textContent = funcionesCache.length;
    }
  } catch (e) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Error: ${e.message}</div>`;
  }
}

// ── Filtros de cartelera ──────────────────────────────────────
function filtrarCartelera() {
  const titulo = (document.getElementById('fil_c_titulo')?.value || '').toLowerCase();
  const genero = (document.getElementById('fil_c_genero')?.value || '').toLowerCase();
  const clasif = document.getElementById('fil_c_clasif')?.value || '';
  let visible  = 0;
  _carteleraCards.forEach(({ peli, cardEl }) => {
    const match =
      (!titulo || peli.nombre.toLowerCase().includes(titulo)) &&
      (!genero || (peli.genero || '').toLowerCase().includes(genero)) &&
      (!clasif || peli.clasificacion === clasif);
    cardEl.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const conteo = document.getElementById('fil_c_conteo');
  if (conteo) conteo.textContent = visible < _carteleraCards.length ? `${visible} de ${_carteleraCards.length} películas` : '';
}

function limpiarFiltrosCartelera() {
  ['fil_c_titulo', 'fil_c_genero'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const c = document.getElementById('fil_c_clasif'); if (c) c.selectedIndex = 0;
  filtrarCartelera();
}

// ── Modal de selección de función ───────────────────────────
let _sfMovieId       = null;
let _sfFechasActivas = new Set();
let _sfHorasActivas  = new Set();

async function abrirSeleccionFuncion(movieId) {
  _sfMovieId = movieId;
  _sfFechasActivas.clear();
  _sfHorasActivas.clear();

  const peli = funcionesCache.find(f => f.pelicula?.movieId === movieId)?.pelicula;
  if (!peli) return;

  document.getElementById('sf_titulo').textContent = peli.nombre;

  let sfPosterEl = document.getElementById('sf_poster_thumb');
  if (!sfPosterEl) {
    sfPosterEl = document.createElement('img');
    sfPosterEl.id = 'sf_poster_thumb';
    sfPosterEl.style.cssText =
      'width:48px;height:68px;object-fit:cover;border-radius:4px;border:1px solid var(--c-border);flex-shrink:0;';
    const titleEl = document.getElementById('sf_titulo');
    if (titleEl?.parentElement) titleEl.parentElement.insertBefore(sfPosterEl, titleEl);
  }
  if (peli.posterUrl) { sfPosterEl.src = peli.posterUrl; sfPosterEl.style.display = ''; }
  else sfPosterEl.style.display = 'none';

  const sucSet = new Map();
  funcionesCache.filter(f => f.pelicula?.movieId === movieId).forEach(f => {
    const s = f.sala?.sucursal;
    if (s) sucSet.set(s.branId, s.branLocation || `Sucursal #${s.branId}`);
  });
  const sfSuc = document.getElementById('sf_sucursal');
  sfSuc.innerHTML = '<option value="">— Todas las sedes —</option>' +
    [...sucSet.entries()].map(([id, loc]) => `<option value="${id}">${loc}</option>`).join('');

  document.getElementById('sf_tipo').value       = '';
  const sfDesde = document.getElementById('sf_fechaDesde');
  const sfHasta = document.getElementById('sf_fechaHasta');
  if (sfDesde) sfDesde.value = '';
  if (sfHasta) sfHasta.value = '';
  document.getElementById('sf_date_chips_wrap').style.display = 'none';
  document.getElementById('sf_time_chips_wrap').style.display = 'none';
  document.getElementById('modalSelFuncion').style.display = 'flex';
  filtrarFuncionesModal();
}

function cerrarSeleccionFuncion() {
  document.getElementById('modalSelFuncion').style.display = 'none';
}

function limpiarFiltrosSF() {
  document.getElementById('sf_sucursal').selectedIndex = 0;
  document.getElementById('sf_tipo').value       = '';
  document.getElementById('sf_fechaDesde').value = '';
  document.getElementById('sf_fechaHasta').value = '';
  _sfFechasActivas.clear();
  _sfHorasActivas.clear();
  document.getElementById('sf_date_chips_wrap').style.display = 'none';
  document.getElementById('sf_time_chips_wrap').style.display = 'none';
  filtrarFuncionesModal();
}

function onRangoFechaChange() {
  _sfFechasActivas.clear();
  _sfHorasActivas.clear();
  const desde = document.getElementById('sf_fechaDesde').value;
  const hasta = document.getElementById('sf_fechaHasta').value;
  const sucId = document.getElementById('sf_sucursal').value;
  const tipo  = document.getElementById('sf_tipo').value;

  const funcsBase = funcionesCache.filter(f => {
    if (f.pelicula?.movieId !== _sfMovieId) return false;
    if (sucId && String(f.sala?.sucursal?.branId) !== sucId) return false;
    if (tipo  && tipoLabel(f.sala?.tipo) !== tipo) return false;
    return true;
  });

  const fechasDisp = [...new Set(funcsBase.map(f => f.fecha).filter(Boolean))]
    .filter(fecha => {
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    })
    .sort();

  const chipsWrap = document.getElementById('sf_date_chips_wrap');
  const chipsEl   = document.getElementById('sf_date_chips');
  if (!fechasDisp.length || (!desde && !hasta)) {
    chipsWrap.style.display = 'none';
    document.getElementById('sf_time_chips_wrap').style.display = 'none';
    filtrarFuncionesModal();
    return;
  }
  chipsWrap.style.display = 'block';
  chipsEl.innerHTML = fechasDisp.map(f =>
    `<span class="sf-chip" data-fecha="${f}" onclick="toggleFechaChip(this)">${formatFechaCorta(f)}</span>`
  ).join('');
  document.getElementById('sf_time_chips_wrap').style.display = 'none';
  filtrarFuncionesModal();
}

function toggleFechaChip(el) {
  const fecha = el.dataset.fecha;
  if (_sfFechasActivas.has(fecha)) { _sfFechasActivas.delete(fecha); el.classList.remove('active'); }
  else { _sfFechasActivas.add(fecha); el.classList.add('active'); }
  _sfHorasActivas.clear();
  actualizarHoraChips();
  filtrarFuncionesModal();
}

function actualizarHoraChips() {
  const sucId     = document.getElementById('sf_sucursal').value;
  const tipo      = document.getElementById('sf_tipo').value;
  const fechasRef = _sfFechasActivas.size > 0 ? _sfFechasActivas : null;

  const funcsBase = funcionesCache.filter(f => {
    if (f.pelicula?.movieId !== _sfMovieId) return false;
    if (sucId && String(f.sala?.sucursal?.branId) !== sucId) return false;
    if (tipo  && tipoLabel(f.sala?.tipo) !== tipo) return false;
    if (fechasRef && !fechasRef.has(f.fecha)) return false;
    return true;
  });

  const horas    = [...new Set(funcsBase.map(f => (f.horaInicio || '').slice(0, 5)).filter(Boolean))].sort();
  const timeWrap = document.getElementById('sf_time_chips_wrap');
  const timeEl   = document.getElementById('sf_time_chips');

  if (!horas.length || _sfFechasActivas.size === 0) { timeWrap.style.display = 'none'; return; }
  timeWrap.style.display = 'block';
  timeEl.innerHTML = horas.map(h =>
    `<span class="sf-time-chip" data-hora="${h}" onclick="toggleHoraChip(this)">${h}</span>`
  ).join('');
}

function toggleHoraChip(el) {
  const hora = el.dataset.hora;
  if (_sfHorasActivas.has(hora)) { _sfHorasActivas.delete(hora); el.classList.remove('active'); }
  else { _sfHorasActivas.add(hora); el.classList.add('active'); }
  filtrarFuncionesModal();
}

async function filtrarFuncionesModal() {
  const lista  = document.getElementById('sf_lista');
  const sucId  = document.getElementById('sf_sucursal').value;
  const tipo   = document.getElementById('sf_tipo').value;
  const desde  = document.getElementById('sf_fechaDesde').value;
  const hasta  = document.getElementById('sf_fechaHasta').value;
  const hoyStr = new Date().toISOString().split('T')[0];

  let funcs = funcionesCache.filter(f => {
    if (f.pelicula?.movieId !== _sfMovieId) return false;
    if (f.fecha && f.fecha < hoyStr)        return false;
    if (sucId && String(f.sala?.sucursal?.branId) !== sucId) return false;
    if (tipo  && tipoLabel(f.sala?.tipo) !== tipo) return false;
    if (desde && f.fecha < desde) return false;
    if (hasta && f.fecha > hasta) return false;
    if (_sfFechasActivas.size > 0 && !_sfFechasActivas.has(f.fecha)) return false;
    if (_sfHorasActivas.size  > 0 && !_sfHorasActivas.has((f.horaInicio || '').slice(0, 5))) return false;
    return true;
  });

  if (!funcs.length) {
    lista.innerHTML = '<div class="empty-state">No hay funciones con estos filtros.</div>';
    return;
  }
  lista.innerHTML = '<div style="color:var(--c-muted);font-size:12px;margin-bottom:6px;">Cargando ocupación…</div>';

  const rows = await Promise.all(funcs.map(async f => {
    let ocupadas = 0, total = 0;
    try {
      const sillasData = await api(`/sillas/funcion/${f.funcionId}`);
      total    = sillasData.length;
      ocupadas = sillasData.filter(s => s.estado !== 'DISPONIBLE').length;
    } catch (_) {}
    const pct      = total ? Math.round((ocupadas / total) * 100) : 0;
    const barColor = pct > 80 ? 'var(--c-red)' : pct > 40 ? 'var(--c-gold)' : 'var(--c-green)';
    return { f, ocupadas, total, pct, barColor, disponibles: total - ocupadas };
  }));

  rows.sort((a, b) => (a.f.fecha + a.f.horaInicio).localeCompare(b.f.fecha + b.f.horaInicio));

  lista.innerHTML = rows.map(({ f, pct, barColor, disponibles }) => {
    const isFull       = disponibles === 0;
    const isAlmostFull = pct >= 80;
    const statusLabel  = isFull ? 'Sin cupos' : isAlmostFull ? 'Casi lleno' : `${disponibles} disponibles`;
    const statusColor  = isFull ? 'var(--c-red)' : isAlmostFull ? 'var(--c-gold)' : 'var(--c-green)';
    return `
    <div style="background:var(--c-card);border:1px solid var(--c-border);border-radius:10px;overflow:hidden;
         cursor:${isFull ? 'not-allowed' : 'pointer'};transition:border-color 0.2s,transform 0.15s,box-shadow 0.2s;
         opacity:${isFull ? '0.55' : '1'};"
         onmouseenter="if(!${isFull}){this.style.borderColor='var(--c-gold)';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)';}"
         onmouseleave="this.style.borderColor='var(--c-border)';this.style.transform='';this.style.boxShadow='';"
         onclick="${isFull ? '' : `seleccionarFuncion(${f.funcionId})`}">
      <div style="height:3px;background:${barColor};"></div>
      <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:8px;padding:8px 14px;text-align:center;min-width:76px;flex-shrink:0;">
          <div style="font-size:10px;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.4px;">${formatFechaCorta(f.fecha)}</div>
          <div class="mono text-gold" style="font-size:22px;font-weight:700;line-height:1.1;">${(f.horaInicio || '—').slice(0, 5)}</div>
          <div style="font-size:10px;color:var(--c-muted);">${f.fecha || '—'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:100px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:15px;">${f.sala?.nombre || '—'}</span>
            <span class="badge badge-blue" style="font-size:10px;">${tipoLabel(f.sala?.tipo)}</span>
          </div>
          <div style="font-size:12px;color:var(--c-muted);">${f.sala?.sucursal?.branLocation || '—'}</div>
          <div style="margin-top:4px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px;">
              <span style="color:var(--c-muted);">Ocupación ${pct}%</span>
              <span style="color:${statusColor};font-weight:600;">${statusLabel}</span>
            </div>
            <div class="ocup-bar" style="height:4px;"><div class="ocup-fill" style="width:${pct}%;background:${barColor}"></div></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
          <div style="text-align:right;">
            <div style="font-size:10px;color:var(--c-muted);">Por entrada</div>
            <div class="mono text-gold" style="font-size:18px;font-weight:700;">$${(f.precioBoleto || 0).toLocaleString()}</div>
          </div>
          ${isFull
            ? '<span style="font-size:12px;color:var(--c-red);font-weight:600;">Agotado</span>'
            : `<button class="btn btn-primary btn-sm" style="padding:8px 16px;font-size:12px;"
                onclick="event.stopPropagation();seleccionarFuncion(${f.funcionId})">Seleccionar →</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function seleccionarFuncion(fId) {
  cerrarSeleccionFuncion();
  await abrirTaquilla(fId);
}