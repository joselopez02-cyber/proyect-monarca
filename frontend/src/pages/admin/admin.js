/* ============================================================
   admin.js — Panel, navegación, películas, salas, sucursales,
              usuarios, cines, agrupación de funciones
   Depende de: api.js, utils.js, funciones.js, cartelera.js,
               reservas.js, silla-lock.js
   ============================================================ */

// ── Estado global compartido ─────────────────────────────────
let peliculasCache   = [];
let funcionesCache   = [];
let salasCache       = [];
let usuariosCache    = [];
let seleccionadasIds = new Set();
let mdgSeleccionadas = new Set();
let mdgGrupoKeyActual = null;
let _gruposActuales  = {};
let _filtroSucCineId = null;
let _posterBase64    = null;

// ── Navegación de vistas ─────────────────────────────────────
function switchView(viewId, element) {
  const _mc = document.querySelector('.main-content');
  if (_mc) _mc.scrollTop = 0;
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const sectionNames = {
    dashboard:'Panel Principal', cartelera:'Taquilla', peliculas:'Catálogo Películas',
    salas:'Programar Salas', funciones:'Programar Funciones', reservas:'Historial',
    sucursales:'Cines & Sucursales', usuarios:'Gestión de Usuarios', config:'Configuración'
  };
  const secEl = document.getElementById('topbar-section-name');
  if (secEl) secEl.textContent = sectionNames[viewId] || viewId;
  document.getElementById('view-' + viewId)?.classList.add('active');
  if (element) element.classList.add('active');
  if (viewId === 'dashboard')  cargarDashboard();
  if (viewId === 'cartelera')  cargarCartelera();
  if (viewId === 'peliculas')  cargarPeliculas();
  if (viewId === 'salas')      cargarSalasAdmin();
  if (viewId === 'funciones')  cargarFunciones();
  if (viewId === 'reservas')   cargarReservas();
  if (viewId === 'sucursales') { _filtroSucCineId = null; cargarSucursales(); }
  if (viewId === 'usuarios')   cargarUsuarios();
  if (viewId === 'config')     testConexion();
  syncBottomNav(viewId);
}

function syncBottomNav(viewId) {
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
}

// ── Dashboard ────────────────────────────────────────────────
async function cargarDashboard() {
  try {
    const [pelis, funcs, clis, resv] = await Promise.all([
      api('/peliculas').catch(() => []), api('/funciones').catch(() => []),
      api('/clientes').catch(() => []),  api('/reservas').catch(() => [])
    ]);
    document.getElementById('stat-pelis').innerText = pelis.length || 0;
    document.getElementById('stat-funcs').innerText = funcs.length || 0;
    document.getElementById('stat-clis').innerText  = clis.length  || 0;
    document.getElementById('stat-res').innerText   = resv.length  || 0;
  } catch (e) { showAlert('Error al cargar el panel de control.', 'error'); }
}

// ── Películas ────────────────────────────────────────────────
async function cargarPeliculas() {
  const tbody = document.getElementById('peliculasTable');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Cargando catálogo...</td></tr>';
  try {
    peliculasCache = await api('/peliculas');
    tbody.innerHTML = peliculasCache.map(p => `
      <tr>
        <td class="mono text-muted">#${p.movieId}</td>
        <td>
          ${p.tienePoster
            ? `<img src="${API_BASE}/api/peliculas/${p.movieId}/poster" class="poster-thumb" alt="poster" loading="lazy">`
            : `<div class="poster-placeholder" title="Sin poster" onclick="cargarEdicionPelicula(${p.movieId})"></div>`}
        </td>
        <td style="font-weight:600;">${p.nombre}</td>
        <td>${p.genero}</td>
        <td>${p.duracionMin} min</td>
        <td><span class="badge badge-blue">${p.clasificacion}</span></td>
        <td>
          <div style="display:flex; gap: 4px; flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="cargarEdicionPelicula(${p.movieId})">Editar</button>
            ${p.tienePoster
              ? `<button class="poster-del-btn" onclick="eliminarPosterPelicula(${p.movieId})">🗑 Poster</button>`
              : ''}
            <button class="btn btn-sm btn-danger" onclick="eliminarEntidad('/peliculas/${p.movieId}', cargarPeliculas)">Eliminar</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${e.message}</td></tr>`;
  }
}

function cargarEdicionPelicula(id) {
  const p = peliculasCache.find(x => x.movieId == id);
  if (!p) return;
  document.getElementById('p_id').value       = p.movieId;
  document.getElementById('p_titulo').value   = p.nombre;
  document.getElementById('p_genero').value   = p.genero || '';
  document.getElementById('p_duracion').value = p.duracionMin || '';
  document.getElementById('p_clasif').value   = p.clasificacion || 'A';
  document.getElementById('p_desc').value     = p.descripcion || '';
  document.getElementById('lbl-form-pelicula').innerText = 'Editar Título #' + p.movieId;
  document.getElementById('btn-save-p').innerText = 'Actualizar Película';
  document.getElementById('btn-cancel-p').style.display = 'inline-flex';
  _posterBase64 = null;
  if (p.tienePoster) {
    fetch(`${API_BASE}/api/peliculas/${p.movieId}/poster`).then(r => r.json())
      .then(d => { if (d && d.posterUrl) mostrarPosterPreview(d.posterUrl); }).catch(() => {});
  } else { limpiarPosterForm(); }
  document.getElementById('p_titulo').focus();
  document.getElementById('formPelicula').scrollIntoView({ behavior: 'smooth' });
}

function mostrarPosterPreview(dataUrl, filename) {
  const prev = document.getElementById('posterPreview');
  prev.innerHTML = `
    <img src="${dataUrl}" style="max-height:150px;border-radius:6px;margin-top:4px;display:block;margin-left:auto;margin-right:auto;">
    ${filename ? `<div style="font-size:10px;color:var(--c-muted);margin-top:4px;">${filename}</div>` : ''}
    <button type="button" onclick="document.getElementById('posterFileInput').click()" style="margin-top:6px;background:none;border:1px solid var(--c-border);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--c-muted);cursor:pointer;">🔄 Cambiar</button>`;
  document.getElementById('btn-clear-poster').style.display = 'block';
}

function limpiarPosterForm() {
  _posterBase64 = null;
  document.getElementById('posterPreview').innerHTML = `
    <div style="font-size:28px;margin-bottom:4px;">🖼️</div>
    <div style="font-size:12px;margin-bottom:10px;color:var(--c-muted);">JPG · PNG · WEBP · GIF</div>
    <button type="button" onclick="document.getElementById('posterFileInput').click()" style="background:var(--c-gold);color:#000;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;">📂 Elegir archivo</button>
    <div style="font-size:10px;margin-top:6px;color:var(--c-muted);">o arrastra la imagen aquí</div>`;
  document.getElementById('btn-clear-poster').style.display = 'none';
  document.getElementById('posterFileInput').value = '';
}

function handlePosterFile(input) {
  const file = input.files ? input.files[0] : input;
  if (!file) return;
  if (!file.type.startsWith('image/')) { showAlert('Solo se permiten imágenes (JPG, PNG, WEBP, GIF, etc.)', 'error'); return; }
  if (file.size > 2 * 1024 * 1024) { showAlert('El archivo supera 2 MB. Elige una imagen más pequeña.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => { _posterBase64 = ev.target.result; mostrarPosterPreview(_posterBase64, file.name); };
  reader.readAsDataURL(file);
}

function handlePosterDrop(e) {
  e.preventDefault();
  document.getElementById('posterDropzone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showAlert('Solo se permiten imágenes.', 'error'); return; }
  if (file.size > 2 * 1024 * 1024) { showAlert('El archivo supera 2 MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => { _posterBase64 = ev.target.result; mostrarPosterPreview(_posterBase64); };
  reader.readAsDataURL(file);
}

async function eliminarPosterPelicula(id) {
  if (!confirm('¿Eliminar el poster de esta película?')) return;
  try { await api('/peliculas/' + id + '/poster', 'DELETE'); showAlert('Poster eliminado.'); cargarPeliculas(); }
  catch (e) { showAlert('Error al eliminar poster: ' + e.message, 'error'); }
}

function cancelarEdicionPelicula() {
  document.getElementById('p_id').value = '';
  document.getElementById('formPelicula').reset();
  document.getElementById('lbl-form-pelicula').innerText = 'Registrar Nuevo Título';
  document.getElementById('btn-save-p').innerText = 'Guardar Película';
  document.getElementById('btn-cancel-p').style.display = 'none';
  limpiarPosterForm();
}

async function savePelicula(e) {
  e.preventDefault();
  const id = document.getElementById('p_id').value;
  const p = {
    nombre:        document.getElementById('p_titulo').value,
    genero:        document.getElementById('p_genero').value,
    duracionMin:   parseInt(document.getElementById('p_duracion').value),
    clasificacion: document.getElementById('p_clasif').value,
    descripcion:   document.getElementById('p_desc').value || null,
  };
  try {
    let savedId = id;
    if (id) { await api(`/peliculas/${id}`, 'PUT', p); }
    else { const created = await api('/peliculas', 'POST', p); savedId = created.movieId; }
    if (_posterBase64 && savedId) {
      await api(`/peliculas/${savedId}/poster`, 'POST', { posterUrl: _posterBase64 });
    }
    showAlert(id ? 'Película actualizada.' : 'Película guardada.');
    cancelarEdicionPelicula(); cargarPeliculas(); cargarFunciones();
  } catch (e) { showAlert('Error al guardar película: ' + e.message, 'error'); }
}

// ── Salas ────────────────────────────────────────────────────
function calcularCapacidad() {
  const filas = parseInt(document.getElementById('s_filas').value) || 0;
  const cols  = parseInt(document.getElementById('s_columnas').value) || 0;
  document.getElementById('s_capacidad').value = filas * cols;
  renderSalaPreview();
}

function renderSalaPreview() {
  const filas  = parseInt(document.getElementById('s_filas').value) || 0;
  const cols   = parseInt(document.getElementById('s_columnas').value) || 0;
  const tipo   = document.getElementById('s_tipo').value;
  const nombre = document.getElementById('s_nombre').value || 'Vista previa';
  const wrap   = document.getElementById('sala-preview-wrap');
  const grid   = document.getElementById('sala-preview-grid');
  const label  = document.getElementById('sala-preview-label');
  if (!wrap || !grid || !filas || !cols) { if (wrap) wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  if (label) label.textContent = `${nombre}${tipo ? ' — ' + tipoLabel(tipo) : ''} (${filas * cols} asientos)`;
  const colorMap = { PRO: 'rgba(245,197,24,0.45)', TRES_D: 'rgba(41,121,255,0.45)', DOS_D: 'rgba(0,230,118,0.35)' };
  const color = colorMap[tipo] || 'rgba(255,255,255,0.15)';
  const rows = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < Math.min(filas, 12); r++) {
    const seats = [];
    for (let c = 1; c <= Math.min(cols, 20); c++) {
      seats.push(`<div style="width:14px;height:12px;border-radius:3px 3px 2px 2px;background:${color};display:inline-block;margin:1px;"></div>`);
    }
    if (cols > 20) seats.push(`<span style="font-size:9px;color:var(--c-muted);margin-left:2px;">+${cols-20}</span>`);
    rows.push(`<div style="display:flex;align-items:center;gap:2px;margin-bottom:1px;"><span style="font-size:9px;font-family:monospace;color:var(--c-muted);width:14px;">${letters[r]}</span>${seats.join('')}</div>`);
  }
  if (filas > 12) rows.push(`<div style="font-size:9px;color:var(--c-muted);margin-top:4px;">... y ${filas-12} filas más</div>`);
  grid.innerHTML = rows.join('');
}

async function cargarSalasAdmin() {
  try {
    const [salas, sucursales] = await Promise.all([api('/salas'), api('/sucursales').catch(() => [])]);
    salasCache = salas;
    const selSuc = document.getElementById('s_sucursal');
    if (selSuc) selSuc.innerHTML = '<option value="">-- Seleccionar sucursal --</option>' +
      sucursales.map(s => `<option value="${s.branId}">${s.branLocation || 'Sucursal #' + s.branId}</option>`).join('');
    renderTablaSalas();
  } catch (e) {
    const tb = document.getElementById('salasTable');
    if (tb) tb.innerHTML = `<tr><td colspan="8" class="empty-state">Error: ${e.message}</td></tr>`;
  }
}

function filtrarTablaSalas() { renderTablaSalas(); }

function renderTablaSalas() {
  const tbody = document.getElementById('salasTable');
  if (!tbody) return;
  const sucId = document.getElementById('filtro-suc-salas')?.value || '';
  const lista = sucId ? salasCache.filter(s => String(s.sucursal?.branId) === sucId) : salasCache;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay salas.</td></tr>'; return; }
  tbody.innerHTML = lista.map(s => `
    <tr>
      <td class="mono text-muted">#${s.salaId}</td>
      <td style="font-weight:600;">${s.nombre}</td>
      <td><span class="badge badge-blue">${tipoLabel(s.tipo)}</span></td>
      <td class="mono">${s.filas ?? '—'}</td>
      <td class="mono">${s.columnas ?? '—'}</td>
      <td class="mono text-gold">${s.capacidad}</td>
      <td>${s.sucursal?.branLocation || '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="cargarEdicionSala(${s.salaId})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarEntidad('/salas/${s.salaId}', cargarSalasAdmin)">Eliminar</button>
        </div>
      </td>
    </tr>`).join('');
}

function cargarEdicionSala(id) {
  const s = salasCache.find(x => x.salaId == id);
  if (!s) return;
  document.getElementById('s_id').value       = s.salaId;
  document.getElementById('s_nombre').value   = s.nombre;
  document.getElementById('s_tipo').value     = s.tipo || '';
  document.getElementById('s_filas').value    = s.filas || '';
  document.getElementById('s_columnas').value = s.columnas || '';
  document.getElementById('s_capacidad').value = s.capacidad || '';
  document.getElementById('s_sucursal').value = s.sucursal?.branId || '';
  document.getElementById('lbl-form-sala').innerText = 'Editar Sala #' + s.salaId;
  document.getElementById('btn-cancel-s').style.display = 'inline-flex';
  calcularCapacidad();
}

function cancelarEdicionSala() {
  document.getElementById('s_id').value = '';
  ['s_nombre','s_filas','s_columnas','s_capacidad'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('s_tipo').value     = '';
  document.getElementById('s_sucursal').value = '';
  document.getElementById('lbl-form-sala').innerText = 'Nueva Sala';
  document.getElementById('btn-cancel-s').style.display = 'none';
  const wrap = document.getElementById('sala-preview-wrap');
  if (wrap) wrap.style.display = 'none';
}

async function saveSala() {
  const id     = document.getElementById('s_id').value;
  const nombre = document.getElementById('s_nombre').value.trim();
  const tipo   = document.getElementById('s_tipo').value;
  const filas  = parseInt(document.getElementById('s_filas').value);
  const cols   = parseInt(document.getElementById('s_columnas').value);
  const sucId  = parseInt(document.getElementById('s_sucursal').value);
  if (!nombre) { showAlert('El nombre de la sala es obligatorio.', 'error'); return; }
  if (!tipo)   { showAlert('Selecciona el tipo de sala.', 'error'); return; }
  if (!sucId)  { showAlert('Selecciona una sucursal.', 'error'); return; }
  const payload = { nombre, tipo, filas, columnas: cols, capacidad: filas * cols, sucursal: { branId: sucId } };
  try {
    if (id) { await api(`/salas/${id}`, 'PUT', payload); showAlert('Sala actualizada.'); }
    else    { await api('/salas', 'POST', payload);      showAlert('Sala creada.'); }
    cancelarEdicionSala(); cargarSalasAdmin(); cargarFunciones();
  } catch (e) { showAlert('Error al guardar sala: ' + e.message, 'error'); }
}

// ── Cines & Sucursales ───────────────────────────────────────
async function cargarCines() {
  const tbody = document.getElementById('tbl-cines');
  try {
    const cines = await api('/cines');
    tbody.innerHTML = cines.map(c => `
      <tr>
        <td class="mono text-muted">#${c.cineId}</td>
        <td style="font-weight:600;">${c.nombreDelCine || c.nombre || '—'}</td>
        <td>${c.cineCont || c.contacto || '—'}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm" title="Ver sucursales" onclick="verSucursalesDeCine(${c.cineId},'${esc(c.nombreDelCine||c.nombre||'')}')">👁</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarEntidad('/cines/${c.cineId}', cargarSucursales)">Eliminar</button>
          </div>
        </td>
      </tr>`).join('');
    const selCine = document.getElementById('sucCineId');
    if (selCine) selCine.innerHTML = '<option value="">— Seleccionar cine —</option>' +
      cines.map(c => `<option value="${c.cineId}">${c.nombreDelCine || c.nombre || 'Cine #' + c.cineId}</option>`).join('');
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Error: ${e.message}</td></tr>`;
  }
}

async function crearCine() {
  const nombre = document.getElementById('cineNombre').value.trim();
  const cont   = document.getElementById('cineCont').value.trim();
  if (!nombre) { showAlert('El nombre del cine es obligatorio.', 'error'); return; }
  try {
    await api('/cines', 'POST', { nombreDelCine: nombre, cineCont: cont || null });
    showAlert('Cine creado correctamente.');
    document.getElementById('cineNombre').value = '';
    document.getElementById('cineCont').value = '';
    cargarSucursales();
  } catch (e) { showAlert('Error al crear cine: ' + e.message, 'error'); }
}

async function cargarSucursales() {
  await cargarCines();
  const tbody = document.getElementById('tbl-sucursales');
  try {
    let sucursales = await api('/sucursales');
    if (_filtroSucCineId) sucursales = sucursales.filter(s => s.cine?.cineId == _filtroSucCineId);
    tbody.innerHTML = sucursales.map(s => `
      <tr>
        <td class="mono text-muted">#${s.branId}</td>
        <td style="font-weight:600;">${s.branLocation || '—'}</td>
        <td>${s.cine?.nombreDelCine || s.cine?.nombre || '—'}</td>
        <td class="mono">${s.salas?.length ?? '—'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="eliminarEntidad('/sucursales/${s.branId}', cargarSucursales)">Eliminar</button>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error: ${e.message}</td></tr>`;
  }
}

function verSucursalesDeCine(cineId, nombre) {
  _filtroSucCineId = cineId;
  showAlert(`Mostrando sucursales de: ${nombre}`);
  cargarSucursales();
}

async function crearSucursal() {
  const cineId = parseInt(document.getElementById('sucCineId').value);
  const ubic   = document.getElementById('sucUbicacion').value.trim();
  if (!cineId) { showAlert('Selecciona un cine.', 'error'); return; }
  if (!ubic)   { showAlert('La ubicación es obligatoria.', 'error'); return; }
  try {
    await api('/sucursales', 'POST', { branLocation: ubic, cine: { cineId } });
    showAlert('Sucursal creada correctamente.');
    document.getElementById('sucUbicacion').value = '';
    document.getElementById('sucCineId').selectedIndex = 0;
    cargarSucursales();
  } catch (e) { showAlert('Error al crear sucursal: ' + e.message, 'error'); }
}

// ── Usuarios ─────────────────────────────────────────────────
function calcularEdad(fechaNac) {
  if (!fechaNac) return null;
  const hoy   = new Date();
  const nac   = new Date(fechaNac);
  let edad    = hoy.getFullYear() - nac.getFullYear();
  const m     = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

async function cargarUsuarios() {
  const tbody = document.getElementById('tbl-usuarios');
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Cargando…</td></tr>';
  try {
    usuariosCache = await api('/usuarios');
    tbody.innerHTML = usuariosCache.map(u => `
      <tr>
        <td class="mono text-muted">#${u.usuarioId}</td>
        <td style="font-weight:600;">@${u.username}</td>
        <td>${u.email || '—'}</td>
        <td class="mono">${u.cedula || '—'}</td>
        <td>${u.telefono || '—'}</td>
        <td><span class="badge ${u.rol === 'ADMIN' ? 'badge-red' : 'badge-blue'}">${u.rol}</span></td>
        <td><span class="badge ${u.activo !== false ? 'badge-green' : 'badge-red'}">${u.activo !== false ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="verDetalleUsuario(${u.usuarioId})">👁 Ver</button>
            <button class="btn btn-sm" onclick="abrirEditarUsuario(${u.usuarioId})">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarUsuario(${u.usuarioId})">Eliminar</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Error: ${e.message}</td></tr>`;
  }
}

async function verDetalleUsuario(id) {
  const u = usuariosCache.find(x => x.usuarioId == id);
  if (!u) return;
  const edad = calcularEdad(u.fechaNacimiento);
  document.getElementById('mu_titulo').textContent = '@' + (u.username || '—');
  document.getElementById('mu_contenido').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Nombre completo</div><div style="font-weight:600;">${u.nombreCompleto || '—'}</div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Email</div><div>${u.email || '—'}</div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Cédula</div><div class="mono">${u.cedula || '—'}</div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Teléfono</div><div>${u.telefono || '—'}</div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Dirección</div><div>${u.direccion || '—'}</div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Edad</div><div>${edad !== null ? edad + ' años' : '—'}</div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Rol</div><div><span class="badge ${u.rol === 'ADMIN' ? 'badge-red' : 'badge-blue'}">${u.rol}</span></div></div>
      <div><div style="font-size:10px;color:var(--c-muted);margin-bottom:2px;">Estado</div><div><span class="badge ${u.activo !== false ? 'badge-green' : 'badge-red'}">${u.activo !== false ? 'Activo' : 'Inactivo'}</span></div></div>
    </div>`;
  document.getElementById('mu_acciones').innerHTML = `
    <button class="btn" onclick="cambiarRolUsuario(${u.usuarioId},'${u.rol}')">
      ${u.rol === 'ADMIN' ? '⬇ Bajar a USER' : '⬆ Subir a ADMIN'}
    </button>
    <button class="btn btn-danger" onclick="eliminarUsuario(${u.usuarioId});cerrarModalUsuario()">Eliminar cuenta</button>`;
  document.getElementById('modalUsuario').style.display = 'flex';
}

function cerrarModalUsuario() { document.getElementById('modalUsuario').style.display = 'none'; }

function abrirModalNuevoUsuario() {
  document.getElementById('nu_id').value     = '';
  document.getElementById('mnu_titulo').textContent = 'REGISTRAR USUARIO';
  document.getElementById('nu_btn').textContent     = 'Registrar Usuario';
  ['nu_username','nu_nombre','nu_email','nu_cedula','nu_tel','nu_dir','nu_pass'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const fnac = document.getElementById('nu_fnac'); if (fnac) fnac.value = '';
  document.getElementById('nu_rol').value   = 'USER';
  document.getElementById('nu_error').style.display = 'none';
  document.getElementById('modalNuevoUsuario').style.display = 'flex';
}

function cerrarModalNuevoUsuario() { document.getElementById('modalNuevoUsuario').style.display = 'none'; }

function abrirEditarUsuario(id) {
  const u = usuariosCache.find(x => x.usuarioId == id);
  if (!u) return;
  document.getElementById('nu_id').value       = u.usuarioId;
  document.getElementById('nu_username').value = u.username || '';
  document.getElementById('nu_nombre').value   = u.nombreCompleto || '';
  document.getElementById('nu_email').value    = u.email || '';
  document.getElementById('nu_cedula').value   = u.cedula || '';
  document.getElementById('nu_tel').value      = u.telefono || '';
  document.getElementById('nu_dir').value      = u.direccion || '';
  document.getElementById('nu_fnac').value     = u.fechaNacimiento || '';
  document.getElementById('nu_rol').value      = u.rol || 'USER';
  document.getElementById('nu_pass').value     = '';
  document.getElementById('mnu_titulo').textContent = 'EDITAR USUARIO #' + u.usuarioId;
  document.getElementById('nu_btn').textContent     = 'Guardar Cambios';
  document.getElementById('nu_error').style.display = 'none';
  document.getElementById('modalNuevoUsuario').style.display = 'flex';
}

async function guardarNuevoUsuario() {
  const id       = document.getElementById('nu_id').value;
  const username = document.getElementById('nu_username').value.trim();
  const email    = document.getElementById('nu_email').value.trim();
  const pass     = document.getElementById('nu_pass').value;
  const errEl    = document.getElementById('nu_error');
  errEl.style.display = 'none';
  if (!username || !email) { errEl.textContent = 'Username y email son obligatorios.'; errEl.style.display = 'block'; return; }
  if (!id && !pass)        { errEl.textContent = 'La contraseña es obligatoria.';       errEl.style.display = 'block'; return; }
  const payload = {
    username,
    email,
    nombreCompleto:  document.getElementById('nu_nombre').value.trim() || null,
    cedula:          document.getElementById('nu_cedula').value.trim() || null,
    telefono:        document.getElementById('nu_tel').value.trim()    || null,
    direccion:       document.getElementById('nu_dir').value.trim()    || null,
    fechaNacimiento: document.getElementById('nu_fnac').value          || null,
    rol:             document.getElementById('nu_rol').value,
    ...(pass ? { password: pass } : {}),
  };
  try {
    if (id) { await api(`/usuarios/${id}`, 'PUT', payload); showAlert('Usuario actualizado.'); }
    else    { await api('/usuarios', 'POST', payload);       showAlert('Usuario registrado.'); }
    cerrarModalNuevoUsuario(); cargarUsuarios();
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}

async function cambiarRolUsuario(id, rolActual) {
  const nuevoRol = rolActual === 'ADMIN' ? 'USER' : 'ADMIN';
  if (!confirm(`¿Cambiar rol a ${nuevoRol}?`)) return;
  try {
    await api(`/usuarios/${id}/rol`, 'PATCH', { rol: nuevoRol });
    showAlert(`Rol cambiado a ${nuevoRol}.`);
    cerrarModalUsuario(); cargarUsuarios();
  } catch (e) { showAlert('Error al cambiar rol: ' + e.message, 'error'); }
}

async function eliminarUsuario(id) {
  if (!confirm('¿Eliminar esta cuenta de usuario permanentemente?')) return;
  try { await api(`/usuarios/${id}`, 'DELETE'); showAlert('Usuario eliminado.'); cargarUsuarios(); }
  catch (e) { showAlert('Error al eliminar usuario: ' + e.message, 'error'); }
}

// ── Funciones — agrupación y modales admin ───────────────────
function toggleGrupo(ids, checked) {
  ids.forEach(id => { checked ? seleccionadasIds.add(id) : seleccionadasIds.delete(id); });
  actualizarBatchUI();
}

function actualizarBatchUI() {
  const n   = seleccionadasIds.size;
  const bar = document.getElementById('batch_actions');
  if (bar) {
    bar.style.display = n > 0 ? 'flex' : 'none';
    const cnt = document.getElementById('batch_count');
    if (cnt) cnt.innerText = `${n} seleccionada${n !== 1 ? 's' : ''}`;
  }
}

async function eliminarSeleccionadas() {
  const ids = [...seleccionadasIds];
  if (!ids.length) return;
  if (!confirm(`¿Eliminar ${ids.length} función${ids.length !== 1 ? 'es' : ''}?`)) return;
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await api(`/funciones/${id}`, 'DELETE'); ok++; } catch { fail++; }
  }
  showAlert(`${ok} eliminada${ok !== 1 ? 's' : ''}.${fail ? ' ' + fail + ' fallaron (referencias activas).' : ''}`);
  if (ok > 0 && typeof _reservasCacheDirty !== 'undefined') _reservasCacheDirty = true;
  cargarFunciones();
}

async function eliminarGrupo(ids) {
  if (!confirm(`¿Eliminar las ${ids.length} funciones de este grupo?`)) return;
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await api(`/funciones/${id}`, 'DELETE'); ok++; } catch { fail++; }
  }
  showAlert(`${ok} eliminada${ok !== 1 ? 's' : ''}.${fail ? ' ' + fail + ' fallaron.' : ''}`);
  if (ok > 0 && typeof _reservasCacheDirty !== 'undefined') _reservasCacheDirty = true;
  cargarFunciones();
}

function renderFuncionesAgrupadas(funciones) {
  const container = document.getElementById('funcionesAgrupadas');
  if (!container) return;
  seleccionadasIds.clear(); actualizarBatchUI(); _gruposActuales = {};
  if (!funciones.length) { container.innerHTML = '<div class="empty-state">No hay funciones programadas.</div>'; return; }
  const grupos = {};
  funciones.forEach(f => {
    const key = `${f.sala?.salaId || 0}_${f.pelicula?.movieId || 0}`;
    if (!grupos[key]) grupos[key] = { sala: f.sala, pelicula: f.pelicula, funciones: [] };
    grupos[key].funciones.push(f);
  });
  _gruposActuales = grupos;
  const filSuc  = document.getElementById('fil_f_sucursal')?.value || '';
  const filPeli = document.getElementById('fil_f_peli')?.value     || '';
  const filSala = document.getElementById('fil_f_sala')?.value     || '';
  const filDesde= document.getElementById('fil_f_desde')?.value    || '';
  const filHasta= document.getElementById('fil_f_hasta')?.value    || '';
  let totalVis = 0;
  const html = Object.entries(grupos).map(([key, g]) => {
    let funcs = g.funciones;
    if (filSuc  && String(funcs[0]?.sala?.sucursal?.branId) !== filSuc)  return '';
    if (filPeli && String(funcs[0]?.pelicula?.movieId)       !== filPeli) return '';
    if (filSala && String(funcs[0]?.sala?.salaId)            !== filSala) return '';
    if (filDesde || filHasta) {
      funcs = funcs.filter(f => (!filDesde || f.fecha >= filDesde) && (!filHasta || f.fecha <= filHasta));
      if (!funcs.length) return '';
    }
    totalVis += funcs.length;
    const sorted   = [...funcs].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
    const ids      = funcs.map(f => f.funcionId);
    const upcoming = funcs.filter(f => f.fecha >= new Date().toISOString().split('T')[0]).length;
    return `
    <div class="card mb-2" style="padding:0;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--c-card);border-bottom:1px solid var(--c-border);flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
          <input type="checkbox" style="accent-color:var(--c-gold);width:14px;height:14px;cursor:pointer;flex-shrink:0;"
            onchange="toggleGrupo([${ids.join(',')}], this.checked)">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.pelicula?.nombre || '—'}</div>
            <div style="font-size:11px;color:var(--c-muted);">${g.sala?.nombre || '—'} · <span class="badge badge-blue" style="font-size:9px;">${tipoLabel(g.sala?.tipo)}</span> · 📍 ${g.sala?.sucursal?.branLocation || '—'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span class="badge badge-gold">${funcs.length} funciones</span>
          <span class="badge badge-green">${upcoming} próximas</span>
          <button class="btn btn-sm" title="Ver & Editar" onclick="abrirDetallesGrupo('${key}')" style="padding:5px 10px;font-size:16px;line-height:1;">👁</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarGrupo([${ids.join(',')}])">🗑</button>
        </div>
      </div>
      <div style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:6px;">
        ${sorted.slice(0, 8).map(f => `
          <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:6px;padding:5px 10px;font-family:monospace;font-size:11px;cursor:pointer;transition:border-color 0.2s;"
               onmouseenter="this.style.borderColor='var(--c-gold)'" onmouseleave="this.style.borderColor='var(--c-border)'"
               onclick="abrirEditFuncionInd(${f.funcionId})">
            <span style="color:var(--c-muted);">${f.fecha}</span> <span style="color:var(--c-gold);font-weight:700;">${(f.horaInicio||'').slice(0,5)}</span>
          </div>`).join('')}
        ${sorted.length > 8 ? `<div style="background:var(--c-bg);border:1px dashed var(--c-border);border-radius:6px;padding:5px 10px;font-size:11px;color:var(--c-muted);cursor:pointer;" onclick="abrirDetallesGrupo('${key}')">+${sorted.length - 8} más…</div>` : ''}
      </div>
    </div>`;
  }).join('');
  const filConteo = document.getElementById('fil_f_conteo');
  if (filConteo) filConteo.textContent = totalVis < funciones.length ? `${totalVis} de ${funciones.length} funciones` : '';
  container.innerHTML = html || '<div class="empty-state">No hay funciones con estos filtros.</div>';
}

// ── Modal detalles de grupo ──────────────────────────────────
function toggleMDGSeleccion(id, checked) {
  checked ? mdgSeleccionadas.add(id) : mdgSeleccionadas.delete(id);
  actualizarBatchBarMDG();
}

function toggleTodosMDG(checked) {
  document.querySelectorAll('.mdg-ck-funcion').forEach(ck => {
    ck.checked = checked;
    checked ? mdgSeleccionadas.add(parseInt(ck.dataset.id)) : mdgSeleccionadas.delete(parseInt(ck.dataset.id));
  });
  actualizarBatchBarMDG();
}

function actualizarBatchBarMDG() {
  const n   = mdgSeleccionadas.size;
  const bar = document.getElementById('mdg_batch_bar');
  if (bar) {
    bar.style.display = n > 0 ? 'flex' : 'none';
    const cnt = document.getElementById('mdg_batch_count');
    if (cnt) cnt.innerText = `${n} función${n !== 1 ? 'es' : ''} seleccionada${n !== 1 ? 's' : ''}`;
  }
}

async function eliminarSeleccionadasMDG() {
  const ids = [...mdgSeleccionadas];
  if (!ids.length) return;
  if (!confirm(`¿Eliminar ${ids.length} función${ids.length !== 1 ? 'es' : ''}?`)) return;
  let ok = 0, fail = 0;
  for (const id of ids) { try { await api(`/funciones/${id}`, 'DELETE'); ok++; } catch { fail++; } }
  showAlert(`${ok} eliminada${ok !== 1 ? 's' : ''}.${fail ? ' ' + fail + ' fallaron.' : ''}`);
  recargarGrupoEnModal(mdgGrupoKeyActual);
  cargarFunciones();
}

async function recargarGrupoEnModal(grupoKey) {
  try {
    const funciones = await api('/funciones');
    funcionesCache = funciones;
    const grupos = {};
    funciones.forEach(f => {
      const key = `${f.sala?.salaId || 0}_${f.pelicula?.movieId || 0}`;
      if (!grupos[key]) grupos[key] = { sala: f.sala, pelicula: f.pelicula, funciones: [] };
      grupos[key].funciones.push(f);
    });
    _gruposActuales = grupos;
    renderFuncionesAgrupadas(funciones);
    if (grupos[grupoKey]) abrirDetallesGrupo(grupoKey);
    else cerrarModalDetalles();
  } catch (e) { cerrarModalDetalles(); cargarFunciones(); }
}

function abrirDetallesGrupo(grupoKey) {
  const g = _gruposActuales[grupoKey];
  if (!g) return;
  mdgGrupoKeyActual = grupoKey;
  document.getElementById('mdg_titulo').innerText = `${g.pelicula?.nombre || '—'} — ${g.sala?.nombre || '—'}`;
  document.getElementById('mdg_pelicula').value   = g.pelicula?.movieId || '';
  document.getElementById('mdg_sucursal').value   = g.sala?.sucursal?.branId || '';
  filtrarSalasMDG();
  document.getElementById('mdg_sala').value       = g.sala?.salaId || '';
  document.getElementById('mdg_grupoKey').value   = grupoKey;
  mdgSeleccionadas.clear(); actualizarBatchBarMDG();
  const ckAll = document.getElementById('mdg_ck_all'); if (ckAll) ckAll.checked = false;
  const sorted = [...g.funciones].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
  document.getElementById('mdg_tabla').innerHTML = sorted.map(f => `
    <tr id="mdg_row_${f.funcionId}">
      <td style="padding:5px 8px;width:32px;"><input type="checkbox" class="mdg-ck-funcion" data-id="${f.funcionId}"
        style="accent-color:var(--c-gold);width:14px;height:14px;cursor:pointer;"
        onchange="toggleMDGSeleccion(${f.funcionId}, this.checked)"></td>
      <td class="mono text-muted" style="font-size:12px;padding:5px 8px;">#${f.funcionId}</td>
      <td class="mono" style="font-size:12px;padding:5px 8px;">${f.fecha || '—'}</td>
      <td class="mono text-gold" style="font-size:12px;padding:5px 8px;">${f.horaInicio || '—'}</td>
      <td class="mono" style="font-size:12px;padding:5px 8px;">$${(f.precioBoleto || 0).toLocaleString()}</td>
      <td style="padding:4px 6px;">
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" style="padding:2px 8px;font-size:11px;" onclick="abrirEditFuncionInd(${f.funcionId})">✏ Editar</button>
          <button class="btn btn-sm btn-danger" style="padding:2px 7px;font-size:11px;"
            onclick="eliminarEntidad('/funciones/${f.funcionId}', ()=>{recargarGrupoEnModal('${grupoKey}');})">🗑</button>
        </div>
      </td>
    </tr>`).join('');
  document.getElementById('modalDetallesGrupo').style.display = 'flex';
}

function cerrarModalDetalles() { document.getElementById('modalDetallesGrupo').style.display = 'none'; }

function filtrarSalasMDG() {
  const sucId = document.getElementById('mdg_sucursal').value;
  const opts  = salasCache.filter(s => !sucId || String(s.sucursal?.branId) === sucId);
  document.getElementById('mdg_sala').innerHTML = '<option value="">-- Selecciona sala --</option>' +
    opts.map(s => `<option value="${s.salaId}">${s.nombre} — ${tipoLabel(s.tipo)}</option>`).join('');
}

async function guardarEdicionGrupo() {
  const grupoKey = document.getElementById('mdg_grupoKey').value;
  const g        = _gruposActuales[grupoKey];
  if (!g) return;
  const movieId  = parseInt(document.getElementById('mdg_pelicula').value);
  const salaId   = parseInt(document.getElementById('mdg_sala').value);
  if (!movieId || !salaId) { showAlert('Selecciona película y sala.', 'error'); return; }
  let ok = 0, fail = 0;
  for (const f of g.funciones) {
    try {
      await api(`/funciones/${f.funcionId}`, 'PUT', {
        pelicula: { movieId }, sala: { salaId },
        fecha: f.fecha, horaInicio: f.horaInicio, precioBoleto: f.precioBoleto,
      });
      ok++;
    } catch { fail++; }
  }
  showAlert(`${ok} actualizada${ok !== 1 ? 's' : ''}.${fail ? ' ' + fail + ' fallaron.' : ''}`);
  cerrarModalDetalles(); cargarFunciones();
}

// ── Mini-modal editar función individual ─────────────────────
function abrirEditFuncionInd(funcionId) {
  const f = funcionesCache.find(x => x.funcionId == funcionId);
  if (!f) return;
  document.getElementById('efi_id').value    = f.funcionId;
  document.getElementById('efi_titulo').innerText = `Editar Función #${f.funcionId}`;
  // Populate pelicula select
  const efiPeli = document.getElementById('efi_peli');
  efiPeli.innerHTML = '<option value="">-- Selecciona --</option>' +
    peliculasCache.map(p => `<option value="${p.movieId}"${p.movieId == f.pelicula?.movieId ? ' selected' : ''}>${p.nombre}</option>`).join('');
  // Populate sucursal + sala
  const efiSuc = document.getElementById('efi_sucursal');
  const sucursalesUnicas = Object.values(salasCache.reduce((acc, s) => { if (s.sucursal) acc[s.sucursal.branId] = s.sucursal; return acc; }, {}));
  efiSuc.innerHTML = '<option value="">—Todas —</option>' +
    sucursalesUnicas.map(s => `<option value="${s.branId}"${s.branId == f.sala?.sucursal?.branId ? ' selected' : ''}>${s.branLocation}</option>`).join('');
  filtrarSalasEFI();
  document.getElementById('efi_sala').value  = f.sala?.salaId || '';
  document.getElementById('efi_fecha').value = f.fecha || '';
  document.getElementById('efi_hora').value  = (f.horaInicio || '').slice(0, 5);
  document.getElementById('efi_precio').value = f.precioBoleto || '';
  document.getElementById('modalEditFuncionInd').style.display = 'flex';
}

function cerrarEditFuncionInd() { document.getElementById('modalEditFuncionInd').style.display = 'none'; }

function filtrarSalasEFI() {
  const sucId = document.getElementById('efi_sucursal').value;
  const opts  = salasCache.filter(s => !sucId || String(s.sucursal?.branId) === sucId);
  document.getElementById('efi_sala').innerHTML = '<option value="">-- Selecciona sala --</option>' +
    opts.map(s => `<option value="${s.salaId}">${s.nombre} — ${tipoLabel(s.tipo)}</option>`).join('');
}

async function guardarEditFuncionInd() {
  const id      = document.getElementById('efi_id').value;
  const movieId = parseInt(document.getElementById('efi_peli').value);
  const salaId  = parseInt(document.getElementById('efi_sala').value);
  const fecha   = document.getElementById('efi_fecha').value;
  const hora    = document.getElementById('efi_hora').value;
  const precio  = parseInt(document.getElementById('efi_precio').value);
  if (!movieId || !salaId || !fecha || !hora) { showAlert('Completa todos los campos.', 'error'); return; }
  try {
    await api(`/funciones/${id}`, 'PUT', {
      pelicula: { movieId }, sala: { salaId },
      fecha, horaInicio: hora, precioBoleto: precio,
    });
    showAlert('Función actualizada.');
    cerrarEditFuncionInd();
    recargarGrupoEnModal(mdgGrupoKeyActual);
    cargarFunciones();
  } catch (e) { showAlert('Error: ' + e.message, 'error'); }
}

// ── Utilidades compartidas ───────────────────────────────────
async function eliminarEntidad(path, callback) {
  try { await api(path, 'DELETE'); showAlert('Eliminado correctamente.'); if (callback) callback(); }
  catch (e) { showAlert('Error al eliminar: ' + e.message, 'error'); }
}