// Refresca la cartelera solo si la vista está activa
function _refrescarCarteleraCondicional() {
  if (document.getElementById('view-cartelera')?.classList.contains('active')) {
    cargarCartelera();
  }
}
/* ============================================================
   reservas.js — Taquilla, mapa de sillas, pago y historial
   Depende de: api.js, utils.js, silla-lock.js
   ============================================================ */

// ── Estado global de la reserva activa ──────────────────────
let seleccionActual  = [];
let funcionActual    = null;
let ocupadasTemp     = [];
let reservasBaseCache = [];
let _reservasCacheDirty = false; // set true by other views after mutations

// ── Abrir taquilla para una función ─────────────────────────
async function abrirTaquilla(fId) {
  funcionActual = funcionesCache.find(f => f.funcionId == fId);
  if (!funcionActual || !funcionActual.pelicula) {
    showAlert('No se encontró la función.', 'error');
    return;
  }

  document.getElementById('m_tituloPeli').innerText  = funcionActual.pelicula.nombre;
  document.getElementById('m_infoFuncion').innerText =
    `${funcionActual.sala?.nombre || ''} — ${funcionActual.sala?.tipo || ''} | ${funcionActual.fecha || ''} ${funcionActual.horaInicio || ''}`;
  document.getElementById('r_precioBase').innerText  = `$${funcionActual.precioBoleto.toLocaleString()} COP`;
  document.getElementById('r_funcionId').value       = funcionActual.funcionId;

  seleccionActual = [];
  document.getElementById('r_metodoPago').value = '';
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
  actualizarTotales();

  try {
    ocupadasTemp = await api(`/sillas/funcion/${fId}`);
    dibujarMapa();
    document.getElementById('paso1Modal').style.display = 'flex';
    document.getElementById('paso2Modal').style.display = 'none';
    document.getElementById('modalReserva').style.display = 'flex';
  } catch (e) {
    showAlert('Error al cargar la ocupación de la sala.', 'error');
  }
}

// ── Cerrar modal de reserva ──────────────────────────────────
function cerrarModal() {
  if (_bloqueoActivo && funcionActual && seleccionActual.length > 0) {
    const clienteKey = sessionStorage.getItem('monarca_username') || '';
    api('/sillas/liberar', 'DELETE', {
      funcionId: funcionActual.funcionId,
      codigos:   seleccionActual,
      clienteKey,
    }).catch(() => {});
  }
  _limpiarBloqueoLocal();

  document.getElementById('modalReserva').style.display = 'none';
  ['r_cliDoc', 'r_cliNom', 'r_cliTel', 'r_cliDir'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('r_metodoPago').value = '';
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
  ['TARJETA', 'NEQUI', 'PSE'].forEach(m => {
    const el = document.getElementById('detalle_' + m);
    if (el) el.style.display = 'none';
  });
}

// ── Dibujar mapa de asientos ─────────────────────────────────
function dibujarMapa() {
  const cont = document.getElementById('mapaContenedor');
  cont.innerHTML = '';
  if (!ocupadasTemp.length) {
    cont.innerHTML = '<div class="empty-state">No hay asientos registrados para esta función.</div>';
    return;
  }

  const porFila = new Map();
  ocupadasTemp.forEach(s => {
    if (!porFila.has(s.fila)) porFila.set(s.fila, []);
    porFila.get(s.fila).push(s);
  });
  const letras = Array.from(porFila.keys()).sort();
  const F      = letras.length;
  const S      = porFila.get(letras[0]).length;

  const Pv = Math.max(0, Math.ceil(S / 14) - 1);
  const Ph = Math.floor(F / 30);

  const alturas = [0];
  for (let n = 1; n < F; n++) {
    const dn  = 6 + n * 0.9;
    const dn1 = 6 + (n - 1) * 0.9;
    alturas.push(dn * (alturas[n - 1] + 0.12) / dn1);
  }
  const hMax = Math.max(...alturas) || 1;

  let bloques = [];
  if (Pv === 0) {
    bloques = [S];
  } else {
    const tam = Math.floor(S / (Pv + 1));
    for (let b = 0; b <= Pv; b++) bloques.push(b < Pv ? tam : S - tam * Pv);
  }
  window._mapa = { letras, alturas, hMax, Pv, Ph, bloques };

  letras.forEach((letra, rowIdx) => {
    if (rowIdx > 0 && Ph > 0 && rowIdx % 30 === 0) {
      const hDiv = document.createElement('div');
      hDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0';
      hDiv.innerHTML = `<div style="flex:1;height:1px;background:repeating-linear-gradient(90deg,rgba(245,197,24,0.5) 0,rgba(245,197,24,0.5) 5px,transparent 5px,transparent 10px)"></div>
        <span style="font-size:9px;color:rgba(245,197,24,0.6);font-family:monospace;letter-spacing:2px">PASILLO</span>
        <div style="flex:1;height:1px;background:repeating-linear-gradient(90deg,rgba(245,197,24,0.5) 0,rgba(245,197,24,0.5) 5px,transparent 5px,transparent 10px)"></div>`;
      cont.appendChild(hDiv);
    }

    const sillas  = porFila.get(letra).sort((a, b) => a.numero - b.numero);
    const hNorm   = alturas[rowIdx] / hMax;
    const visClass = hNorm > 0.75 ? 'vis-high' : hNorm > 0.40 ? 'vis-mid' : 'vis-low';

    const filaDiv = document.createElement('div');
    filaDiv.className = 'seat-row';

    const lblIzq = document.createElement('div');
    lblIzq.className = 'row-label';
    lblIzq.textContent = letra;
    filaDiv.appendChild(lblIzq);

    let seatIdx = 0;
    bloques.forEach((cnt, bIdx) => {
      if (bIdx > 0) {
        const av = document.createElement('div');
        av.className = 'aisle-v-wrap';
        av.innerHTML = '<div class="aisle-v-bar"></div>';
        filaDiv.appendChild(av);
      }
      const grupo = document.createElement('div');
      grupo.className = 'seat-group';
      const bloqueSillas = sillas.slice(seatIdx, seatIdx + cnt);
      seatIdx += cnt;

      bloqueSillas.forEach(sd => {
        const isOcc = sd.estado !== 'DISPONIBLE';
        const el    = document.createElement('div');
        el.className       = 'seat ' + (isOcc ? 'occupied' : visClass);
        el.innerText       = sd.numero;
        el.dataset.codigo  = sd.codigo;
        el.dataset.vis     = visClass;
        el.dataset.elev    = alturas[rowIdx].toFixed(2);
        el.dataset.bloque  = bIdx;
        el.dataset.pv      = Pv;
        if (!isOcc) el.onclick = () => toggleSeleccion(el, sd.codigo);
        grupo.appendChild(el);
      });
      filaDiv.appendChild(grupo);
    });

    const lblDer = document.createElement('div');
    lblDer.className = 'row-label';
    lblDer.textContent = letra;
    filaDiv.appendChild(lblDer);
    cont.appendChild(filaDiv);
  });
}

// ── Toggle de selección de asiento ──────────────────────────
function toggleSeleccion(el, id) {
  const idx = seleccionActual.indexOf(id);
  if (idx > -1) {
    seleccionActual.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    if (seleccionActual.length >= 4) {
      showAlert('Máximo 4 entradas permitidas por pago.', 'error');
      return;
    }
    seleccionActual.push(id);
    el.classList.add('selected');
  }
  actualizarTotales();

  const bar = document.getElementById('seat-info-bar');
  if (!bar) return;
  if (seleccionActual.length === 0) { bar.style.display = 'none'; return; }
  const lastId = seleccionActual[seleccionActual.length - 1];
  const lastEl = document.querySelector(`.seat[data-codigo="${lastId}"]`);
  if (!lastEl) { bar.style.display = 'none'; return; }
  const vis      = lastEl.dataset.vis;
  const visTexto = vis === 'vis-high' ? '👁 Visibilidad alta' : vis === 'vis-mid' ? '👁 Visibilidad media' : '👁 Visibilidad baja';
  const pvVal    = parseInt(lastEl.dataset.pv) || 0;
  const blq      = parseInt(lastEl.dataset.bloque) || 0;
  const pasilloTexto = pvVal === 0 ? '' : ` Bloque ${blq + 1}/${pvVal + 1}`;
  document.getElementById('sib-codigo').textContent = lastId;
  document.getElementById('sib-vis').textContent    = visTexto;
  document.getElementById('sib-elev').textContent   = '↑ ' + lastEl.dataset.elev + ' m';
  document.getElementById('sib-bloque').textContent = pasilloTexto;
  bar.style.display = 'flex';
}

function actualizarTotales() {
  if (!funcionActual) return;
  const num = seleccionActual.length;
  const tot = num * funcionActual.precioBoleto;
  document.getElementById('r_sillasSel').innerText  = num > 0 ? seleccionActual.join(', ') : 'Ninguna';
  document.getElementById('r_total').innerText      = `$${tot.toLocaleString()} COP`;
  document.getElementById('r_precioBase').innerText = `$${(funcionActual.precioBoleto || 0).toLocaleString()} COP`;
}

// ── Método de pago ───────────────────────────────────────────
function seleccionarMetodoPago(btn) {
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const metodo = btn.dataset.metodo;
  document.getElementById('r_metodoPago').value = metodo;
  ['TARJETA', 'NEQUI', 'PSE'].forEach(m => {
    const el = document.getElementById('detalle_' + m);
    if (el) el.style.display = 'none';
  });
  const panel = document.getElementById('detalle_' + metodo);
  if (panel) {
    panel.style.display = 'block';
    const totalText = (document.getElementById('r_total') || {}).textContent || '$0';
    const nM = document.getElementById('nequi_monto');
    const pM = document.getElementById('pse_monto');
    if (nM) nM.textContent = totalText;
    if (pM) pM.textContent = totalText;
  }
}

// ── Procesar pago y crear reserva ────────────────────────────
async function procesarPago() {
  if (seleccionActual.length === 0) { showAlert('Debes seleccionar asientos en el mapa.', 'error'); return; }
  const doc = document.getElementById('r_cliDoc').value.trim();
  if (!doc) { showAlert('La cédula del cliente es obligatoria.', 'error'); return; }

  const metodoPagoUI = document.getElementById('r_metodoPago').value;
  if (!metodoPagoUI) { showAlert('Selecciona un método de pago.', 'error'); return; }

  let tipoPagoBackend = metodoPagoUI;
  if (metodoPagoUI === 'TARJETA') {
    const tipoTarjeta = document.getElementById('t_tipo')?.value || 'CREDITO';
    tipoPagoBackend   = tipoTarjeta === 'DEBITO' ? 'TARJETA_DEBITO' : 'TARJETA_CREDITO';
  }

  if (metodoPagoUI === 'TARJETA') {
    const num = (document.getElementById('t_numero')?.value || '').replace(/\s/g, '');
    if (num.length < 16) { showAlert('Ingresa un número de tarjeta válido (16 dígitos).', 'error'); return; }
    if (!(document.getElementById('t_titular')?.value || '').trim()) { showAlert('Ingresa el nombre del titular de la tarjeta.', 'error'); return; }
    if (!/^\d{2}\/\d{2}$/.test((document.getElementById('t_venc')?.value || '').trim())) { showAlert('Ingresa una fecha de vencimiento válida (MM/AA).', 'error'); return; }
    if ((document.getElementById('t_cvv')?.value || '').trim().length < 3) { showAlert('Ingresa el CVV de la tarjeta.', 'error'); return; }
  }
  if (metodoPagoUI === 'NEQUI') {
    if ((document.getElementById('n_numero')?.value || '').replace(/\s/g, '').length < 10) { showAlert('Ingresa un número de celular Nequi válido (10 dígitos).', 'error'); return; }
  }
  if (metodoPagoUI === 'PSE') {
    if (!(document.getElementById('p_banco')?.value || '').trim()) { showAlert('Selecciona tu banco para continuar con PSE.', 'error'); return; }
    const em = (document.getElementById('p_email')?.value || '').trim();
    if (!em || !em.includes('@')) { showAlert('Ingresa un correo electrónico válido para PSE.', 'error'); return; }
  }

  const username      = sessionStorage.getItem('monarca_username') || '';
  const nomFormulario = document.getElementById('r_cliNom').value.trim();
  const nombreCliente = username || nomFormulario;
  if (!nombreCliente) { showAlert('No se pudo identificar el cliente.', 'error'); return; }

  let custId = null;
  try {
    const clientes = await api('/clientes');
    const existente = clientes.find(c => c.numeroCliente === doc || c.custId == doc);
    if (existente) {
      custId = existente.custId;
      if (existente.nombreCliente !== nombreCliente) {
        await api(`/clientes/${custId}`, 'PUT', { ...existente, nombreCliente }).catch(() => {});
      }
    } else {
      const nuevo = await api('/clientes', 'POST', {
        nombreCliente,
        numeroCliente:    doc,
        direccionCliente: document.getElementById('r_cliDir').value.trim() || null,
      });
      custId = nuevo.custId;
    }
  } catch (_) { showAlert('Error al registrar el cliente.', 'error'); return; }

  const payload = {
    custId,
    funcionId: Number(document.getElementById('r_funcionId').value),
    sillas:    seleccionActual,
    fecha:     funcionActual.fecha || '',
    tiempo:    funcionActual.horaInicio || '',
  };

  try {
    const reservaResp = await api('/reservas', 'POST', payload);
    const rCode = reservaResp?.resCode || reservaResp?.id || null;

    if (rCode && custId) {
      const ultimos4 = metodoPagoUI === 'TARJETA'
        ? (document.getElementById('t_numero')?.value || '').replace(/\s/g, '').slice(-4)
        : null;
      const transBody = {
        tipoPago:   tipoPagoBackend,
        pagoTotal:  seleccionActual.length * (funcionActual?.precioBoleto || 0),
        estadoPago: 'SIMULADO',
        referencia: 'SIM-' + Date.now(),
        fechaTrans: new Date().toISOString().split('T')[0],
        ...(ultimos4 ? { ultimos4 } : {}),
      };
      api(`/transacciones?custId=${custId}&resCode=${rCode}`, 'POST', transBody)
        .then(() => console.log('[Monarca] Transaccion persistida'))
        .catch(err => console.warn('[Monarca] Transaccion no guardada:', err.message));
    }

    showAlert(`¡Pago con ${METODO_LABEL[tipoPagoBackend] || tipoPagoBackend} procesado!`);
    _limpiarBloqueoLocal();
    cerrarModal();
    _refrescarCarteleraCondicional();
    if (document.getElementById('view-reservas')?.classList.contains('active')) {
      cargarReservas();
    }
  } catch (e) {
    showAlert('Error al procesar la reserva: ' + e.message, 'error');
  }
}

// ── Historial de reservas ─────────────────────────────────────
async function cargarReservas() {
  const tbody = document.getElementById('reservasTable');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--c-muted)">Cargando…</td></tr>';
  try {
    const [reservas, transacciones] = await Promise.all([
      api('/reservas'),
      api('/transacciones').catch(() => []),
    ]);
    const transMap = {};
    (transacciones || []).forEach(t => {
      if (t.reserva?.resCode) transMap[t.reserva.resCode] = t;
      else if (t.resCode) transMap[t.resCode] = t;
    });
    reservasBaseCache = reservas.map(r => {
      const t = transMap[r.resCode];
      if (t) {
        r.metodoPago = t.tipoPago   || r.metodoPago;
        r.estadoPago = t.estadoPago;
        r.referencia = t.referencia;
        r.pagoTotal  = t.pagoTotal;
      }
      // Normalise sillasSeleccionadas: back-end may return objects like
      // { fila, numero } instead of pre-formatted strings, or the field
      // may be absent altogether when the relation is not eagerly loaded.
      const raw = r.sillasSeleccionadas || r.sillas || [];
      r.sillasSeleccionadas = raw.map(s =>
        typeof s === 'string' ? s : (s.fila && s.numero != null ? `${s.fila}${s.numero}` : String(s))
      ).filter(Boolean);
      return r;
    });
    _poblarFiltrosReservas();
    _reservasCacheDirty = false;
    renderTablaReservas();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ff6b6b">Error: ${e.message}</td></tr>`;
  }
}

function _poblarFiltrosReservas() {
  const sucursales = new Map(), generos = new Set(), clasifs = new Set();
  reservasBaseCache.forEach(r => {
    const suc = r.funcion?.sala?.sucursal;
    if (suc?.branId) sucursales.set(suc.branId, suc.branLocation || 'Sucursal #' + suc.branId);
    const peli = r.funcion?.pelicula;
    if (peli?.genero) generos.add(peli.genero);
    if (peli?.clasificacion) clasifs.add(peli.clasificacion);
  });
  const selSuc = document.getElementById('filtro-res-suc');
  const selGen = document.getElementById('filtro-res-genero');
  const selCla = document.getElementById('filtro-res-clasif');
  const [vS, vG, vC] = [selSuc?.value, selGen?.value, selCla?.value];
  if (selSuc) selSuc.innerHTML = '<option value="">—Todas —</option>' + Array.from(sucursales.entries()).map(([id, loc]) => `<option value="${id}">${loc}</option>`).join('');
  if (selGen) selGen.innerHTML = '<option value="">— Todos —</option>' + Array.from(generos).sort().map(g => `<option value="${g}">${g}</option>`).join('');
  if (selCla) selCla.innerHTML = '<option value="">—Todas —</option>' + Array.from(clasifs).sort().map(c => `<option value="${c}">${c}</option>`).join('');
  if (vS && selSuc) selSuc.value = vS;
  if (vG && selGen) selGen.value = vG;
  if (vC && selCla) selCla.value = vC;
}

function filtrarReservas() { renderTablaReservas(); }

function limpiarFiltrosReservas() {
  ['filtro-res-suc', 'filtro-res-nombre', 'filtro-res-genero', 'filtro-res-clasif', 'filtro-res-estado', 'filtro-res-metodo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderTablaReservas();
}

function renderTablaReservas() {
  // If another view mutated data, re-fetch before rendering.
  if (_reservasCacheDirty) { _reservasCacheDirty = false; cargarReservas(); return; }
  const tbody   = document.getElementById('reservasTable');
  const vSuc    = document.getElementById('filtro-res-suc')?.value    || '';
  const vNombre = (document.getElementById('filtro-res-nombre')?.value || '').toLowerCase().trim();
  const vGenero = document.getElementById('filtro-res-genero')?.value  || '';
  const vClasif = document.getElementById('filtro-res-clasif')?.value  || '';
  const vEstado = document.getElementById('filtro-res-estado')?.value  || '';
  const vMetodo = document.getElementById('filtro-res-metodo')?.value  || '';

  let lista = reservasBaseCache;
  if (vSuc)    lista = lista.filter(r => String(r.funcion?.sala?.sucursal?.branId) === vSuc);
  if (vNombre) lista = lista.filter(r => (r.peliculaNombre || r.funcion?.pelicula?.nombre || '').toLowerCase().includes(vNombre));
  if (vGenero) lista = lista.filter(r => r.funcion?.pelicula?.genero === vGenero);
  if (vClasif) lista = lista.filter(r => r.funcion?.pelicula?.clasificacion === vClasif);
  if (vEstado) lista = lista.filter(r => r.estado === vEstado);
  if (vMetodo) lista = lista.filter(r => r.metodoPago === vMetodo);

  const contador = document.getElementById('res-contador');
  if (contador) contador.textContent = `Mostrando ${lista.length} de ${reservasBaseCache.length} registros`;

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No hay registros para los filtros seleccionados.</td></tr>';
    return;
  }

  const MC_COLOR = { TARJETA_CREDITO: '#3b82f6', TARJETA_DEBITO: '#6366f1', NEQUI: '#8b5cf6', PSE: '#0ea5e9', EFECTIVO: '#22c55e' };

  tbody.innerHTML = lista.map(r => {
    const fecha     = ((r.fecha || '') + ' ' + (r.tiempo || '')).trim();
    const peli      = r.peliculaNombre || r.funcion?.pelicula?.nombre || 'Desconocida';
    const sala      = r.salaNombre     || r.funcion?.sala?.nombre     || '—';
    const sucNombre = r.funcion?.sala?.sucursal?.branLocation         || '—';
    const cliNombre = r.cliente ? r.cliente.nombreCliente : (r.nombre || '—');
    const cliDoc    = r.cliente ? (r.cliente.numeroCliente || r.cliente.custId || '') : '';
    const badgeCls  = r.estado === 'CONFIRMADA' ? 'badge-green' : r.estado === 'CANCELADA' ? 'badge-red' : 'badge-blue';
    const _metodo   = r.metodoPago || null;
    const metodoHtml = _metodo
      ? `<span style="background:${MC_COLOR[_metodo] || '#888'};color:#fff;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;">${METODO_LABEL[_metodo] || _metodo}</span>`
      : `<span style="color:var(--c-muted);font-size:12px">—</span>`;

    return `
      <tr>
        <td class="mono" style="font-weight:bold;font-size:15px;white-space:nowrap">TK-${r.resCode}</td>
        <td>
          <div style="display:flex;gap:4px;align-items:center;white-space:nowrap">
            <button class="btn btn-sm" title="Ver detalle" onclick="verDetalleReserva(${r.resCode})" style="padding:5px 9px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button class="btn btn-sm" title="Copiar ticket" onclick="copiarTicket(${r.resCode}, event)" style="padding:5px 9px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            ${r.estado === 'CONFIRMADA' ? `<button class="btn btn-sm btn-danger" onclick="cancelarReserva(${r.resCode})" style="white-space:nowrap">✕ Anular</button>` : ''}
          </div>
        </td>
        <td class="mono text-muted" style="font-size:12px;white-space:nowrap">${fecha}</td>
        <td>${cliNombre}<br><span class="mono text-muted" style="font-size:10px">CC: ${cliDoc}</span></td>
        <td>
          <strong>${peli}</strong>
          <br><span class="text-muted" style="font-size:11px">${r.funcion?.pelicula?.genero || ''} · ${r.funcion?.pelicula?.clasificacion || ''}</span>
        </td>
        <td>
          <span style="font-size:13px">${sala}</span>
          <br><span class="text-muted" style="font-size:11px">📍 ${sucNombre}</span>
        </td>
        <td>
          ${(r.sillasSeleccionadas || []).length
            ? (r.sillasSeleccionadas || []).map(s =>
                `<span style="display:inline-block;background:rgba(245,197,24,0.12);border:1px solid rgba(245,197,24,0.35);
                 color:var(--c-gold);border-radius:4px;padding:2px 6px;font-family:var(--f-mono);
                 font-size:11px;margin:2px;font-weight:600">${s}</span>`
              ).join('')
            : '<span style="color:var(--c-muted);font-size:12px">—</span>'}
        </td>
        <td class="mono" style="font-weight:600">$${(r.total || 0).toLocaleString()}</td>
        <td>${metodoHtml}</td>
        <td><span class="badge ${badgeCls}">${r.estado}</span></td>
      </tr>`;
  }).join('');
}

async function cancelarReserva(id) {
  if (!confirm(`¿Cancelar el tiquete #${id}? Se liberarán los asientos y no se puede deshacer.`)) return;
  try {
    await api(`/reservas/${id}/cancelar`, 'PATCH');
    showAlert('Tiquete cancelado y sillas liberadas.');
    cargarReservas(); _refrescarCarteleraCondicional();
  } catch (e) {
    try { await api(`/reservas/${id}`, 'DELETE'); showAlert('Tiquete cancelado y sillas liberadas.'); cargarReservas(); _refrescarCarteleraCondicional(); }
    catch (err) { showAlert('Error al cancelar: ' + err.message, 'error'); }
  }
}

// ── Modal de detalle de reserva ──────────────────────────────
function verDetalleReserva(resCode) {
  const r = reservasBaseCache?.find(x => x.resCode == resCode);
  if (!r) { showAlert('Reserva no encontrada.', 'error'); return; }

  const _esAdminVista = (sessionStorage.getItem('monarca_rol') || 'USER') === 'ADMIN';
  if (_esAdminVista && (!usuariosCache || !usuariosCache.length)) {
    api('/usuarios').then(data => {
      usuariosCache = data;
      const cliDoc     = r.cliente?.numeroCliente || r.contNum || '';
      const cliUsername = r.nombre || r.cliente?.nombreCliente || '';
      const uMatch = data.find(u => u.username === cliUsername || u.cedula === cliDoc);
      if (uMatch?.nombreCompleto) {
        const ncEl = document.getElementById('ms_cli_nombreCompleto');
        if (ncEl) ncEl.textContent = uMatch.nombreCompleto;
      }
    }).catch(() => {});
  }

  document.getElementById('ms_titulo').textContent = 'TK-' + r.resCode;
  document.getElementById('ms_sub').textContent    = ((r.fecha || '') + ' ' + (r.tiempo || '')).trim() || '—';

  const _peli  = r.peliculaNombre || r.funcion?.pelicula?.nombre || '—';
  const _sala  = r.salaNombre     || r.funcion?.sala?.nombre     || '';
  const _tipo  = r.tipoSala       || tipoLabel(r.funcion?.sala?.tipo) || '';
  const _fecha = r.funcionFecha   || r.funcion?.fecha            || '';
  const _hora  = r.funcionHora    || r.funcion?.horaInicio       || '';
  document.getElementById('ms_pelicula').textContent    = _peli;
  document.getElementById('ms_funcion_info').textContent =
    [_sala, _tipo, _fecha, _hora].filter(Boolean).join(' · ') || '—';

  const sillas = r.sillasSeleccionadas || [];
  document.getElementById('ms_mapa').innerHTML = sillas.length
    ? sillas.map(s => `
        <div style="width:52px;height:52px;border-radius:8px 8px 6px 6px;
          background:rgba(245,197,24,0.15);border:2px solid var(--c-gold);
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          font-family:var(--f-mono);color:var(--c-gold);position:relative">
          <div style="position:absolute;bottom:4px;left:6px;right:6px;height:3px;background:var(--c-gold);border-radius:2px"></div>
          <span style="font-size:9px;opacity:0.7">${s.charAt(0)}</span>
          <span style="font-size:16px;font-weight:bold;line-height:1">${s.slice(1)}</span>
        </div>`).join('')
    : '<span style="color:var(--c-muted);font-size:13px">Sin sillas registradas</span>';

  const cliUsername = r.nombre || r.cliente?.nombreCliente || '—';
  document.getElementById('ms_cli_nombre').textContent = cliUsername;
  const hdr = document.getElementById('ms_cli_header'); if (hdr) hdr.textContent = cliUsername;

  const cliDoc = r.cliente?.numeroCliente || r.contNum || '';
  let nombreCompleto = '—';
  if (usuariosCache && usuariosCache.length) {
    const uMatch = usuariosCache.find(u =>
      u.username === cliUsername || u.cedula === cliDoc ||
      u.nombreCompleto?.toLowerCase() === cliUsername.toLowerCase()
    );
    if (uMatch?.nombreCompleto) nombreCompleto = uMatch.nombreCompleto;
  }
  if (nombreCompleto === '—' && r.cliente?.nombreCliente && r.cliente.nombreCliente !== cliUsername) {
    nombreCompleto = r.cliente.nombreCliente;
  }
  const ncEl = document.getElementById('ms_cli_nombreCompleto');
  if (ncEl) ncEl.textContent = nombreCompleto;
  document.getElementById('ms_cli_cedula').textContent = cliDoc || '—';
  document.getElementById('ms_cli_tel').textContent    = r.cliente?.telefonoCliente || '—';
  document.getElementById('ms_cli_dir').textContent    = r.cliente?.direccionCliente || '—';

  const totalVal = r.pagoTotal || r.snapTotal || r.total || 0;
  document.getElementById('ms_total').textContent = '$' + Number(totalVal).toLocaleString('es-CO') + ' COP';
  const estadoMap = { CONFIRMADA: 'badge-green', CANCELADA: 'badge-red', PENDIENTE: 'badge-gold' };
  document.getElementById('ms_estado_wrap').innerHTML =
    `<span class="badge ${estadoMap[r.estado] || 'badge-blue'}">${r.estado || '—'}</span>`;

  const MC_C   = { TARJETA_CREDITO: '#3b82f6', TARJETA_DEBITO: '#6366f1', NEQUI: '#8b5cf6', PSE: '#0ea5e9', EFECTIVO: '#22c55e' };
  const metodo = r.metodoPago || null;
  const wrap   = document.getElementById('ms_metodo_wrap');
  if (metodo) {
    const c          = MC_C[metodo] || '#888';
    const estadoPago = r.estadoPago || 'SIMULADO';
    const badgeColor = estadoPago === 'APROBADO' ? '#22c55e' : estadoPago === 'RECHAZADO' ? '#ef4444' : '#f59e0b';
    wrap.innerHTML = `
      <span style="background:${c};color:#fff;padding:5px 16px;border-radius:20px;font-size:13px;font-weight:700;">${METODO_LABEL[metodo] || metodo}</span>
      <span style="background:${badgeColor};color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:6px;">${estadoPago}</span>
      ${r.referencia ? `<div style="font-size:11px;color:var(--c-muted);margin-top:4px;font-family:monospace">Ref: ${r.referencia}</div>` : ''}`;
  } else {
    wrap.innerHTML = `<span style="color:var(--c-muted);font-size:13px;font-style:italic;">Sin registro de pago</span>`;
  }

  document.getElementById('modalSillas').style.display = 'flex';

  const btnWrap = document.getElementById('ms_btn_anular_wrap');
  if (r.estado === 'CONFIRMADA') {
    btnWrap.innerHTML = `<button class="btn btn-danger" onclick="anularDesdeModal(${r.resCode})" style="gap:6px;">✕ Anular Tiquete</button>`;
  } else {
    btnWrap.innerHTML = '';
  }
}

async function anularDesdeModal(resCode) {
  if (!confirm(`¿Anular el tiquete TK-${resCode}? Se liberarán los asientos y no se puede deshacer.`)) return;
  document.getElementById('modalSillas').style.display = 'none';
  await cancelarReserva(resCode);
}

// Alias
function verSillasReserva(resCode) { verDetalleReserva(resCode); }

// ── Copiar resumen de ticket al portapapeles ─────────────────
function copiarTicket(resCode, evt) {
  evt && evt.stopPropagation();
  const r = reservasBaseCache?.find(x => x.resCode == resCode);
  if (!r) return;

  const peli    = r.peliculaNombre || r.funcion?.pelicula?.nombre || '—';
  const sala    = r.salaNombre     || r.funcion?.sala?.nombre     || '—';
  const suc     = r.funcion?.sala?.sucursal?.branLocation         || '—';
  const fecha   = r.funcion?.fecha   || '—';
  const hora    = r.funcion?.horaInicio?.slice(0,5) || '—';
  const sillas  = (r.sillasSeleccionadas || []).join(', ') || '—';
  const total   = '$' + (r.total || 0).toLocaleString('es-CO') + ' COP';
  const cliente = r.nombre || r.cliente?.nombreCliente || '—';

  const texto = [
    `CINEMA MONARCA — Tiquete TK-${resCode}`,
    `──────────────────────────`,
    `Película : ${peli}`,
    `Sala     : ${sala} · ${suc}`,
    `Fecha    : ${fecha} ${hora}`,
    `Sillas   : ${sillas}`,
    `Total    : ${total}`,
    `Cliente  : ${cliente}`,
    `Estado   : ${r.estado || '—'}`,
  ].join('\n');

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto)
      .then(() => showAlert('Ticket copiado al portapapeles.'))
      .catch(() => _copiarFallback(texto));
  } else {
    _copiarFallback(texto);
  }
}

function _copiarFallback(texto) {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showAlert('Ticket copiado al portapapeles.');
  } catch (_) {
    showAlert('No se pudo copiar. Revisa los permisos del navegador.', 'error');
  }
  document.body.removeChild(ta);
}