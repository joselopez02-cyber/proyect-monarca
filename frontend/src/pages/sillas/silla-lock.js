/* ============================================================
   silla-lock.js — Bloqueo de sillas y countdown de reserva
   Depende de: api.js, utils.js, reservas.js (dibujarMapa, actualizarTotales)
   ============================================================ */

// ── Estado del bloqueo ───────────────────────────────────────
let _bloqueoActivo   = false;
let _bloqueoInterval = null;
let _bloqueoExpiraEn = null;

// ── Paso 1 → Paso 2: bloquear sillas y avanzar ──────────────
async function irPaso2() {
  if (seleccionActual.length === 0) {
    showAlert('Selecciona al menos un asiento.', 'error');
    return;
  }

  const clienteKey   = sessionStorage.getItem('monarca_username') || '';
  const btnContinuar = document.querySelector('#paso1Modal .btn-primary');
  if (btnContinuar) { btnContinuar.disabled = true; btnContinuar.textContent = 'Bloqueando…'; }

  try {
    const resp = await api('/sillas/bloquear', 'POST', {
      funcionId:  funcionActual.funcionId,
      codigos:    seleccionActual,
      clienteKey,
    });
    _bloqueoActivo = true;
    _iniciarCountdown(resp.ttlSegundos || 420);
  } catch (e) {
    // Filtrar errores técnicos de Redis — el sistema sigue funcionando sin él
    const esRedis = e.message && (
      e.message.includes('Redis') ||
      e.message.includes('Unable to connect') ||
      e.message.includes('Connection refused')
    );
    const msg = esRedis
      ? 'No se pudieron bloquear las sillas. Por favor inténtalo de nuevo.'
      : (e.message || 'No se pudieron reservar los asientos. Por favor inténtalo de nuevo.');
    showAlert(msg, 'error');
    ocupadasTemp = await api(`/sillas/funcion/${funcionActual.funcionId}`).catch(() => ocupadasTemp);
    dibujarMapa();
    if (btnContinuar) { btnContinuar.disabled = false; btnContinuar.textContent = 'Continuar pago →'; }
    return;
  }

  if (btnContinuar) { btnContinuar.disabled = false; btnContinuar.textContent = 'Continuar pago →'; }

  document.getElementById('paso1Modal').style.display = 'none';
  const paso2 = document.getElementById('paso2Modal');
  paso2.style.display = 'flex';
  document.getElementById('p2_sillas').textContent = seleccionActual.join(', ');
  document.getElementById('p2_num').textContent    = seleccionActual.length;

  if (funcionActual) {
    const tot = seleccionActual.length * funcionActual.precioBoleto;
    document.getElementById('r_total').innerText      = `$${tot.toLocaleString()} COP`;
    document.getElementById('r_precioBase').innerText = `$${(funcionActual.precioBoleto || 0).toLocaleString()} COP`;
  }
}

// ── Paso 2 → Paso 1: liberar bloqueo y volver al mapa ───────
async function volverPaso1() {
  if (_bloqueoActivo && funcionActual && seleccionActual.length > 0) {
    const clienteKey = sessionStorage.getItem('monarca_username') || '';
    api('/sillas/liberar', 'DELETE', {
      funcionId:  funcionActual.funcionId,
      codigos:    seleccionActual,
      clienteKey,
    }).catch(() => {});
  }
  _limpiarBloqueoLocal();

  document.getElementById('paso2Modal').style.display = 'none';
  document.getElementById('paso1Modal').style.display = 'flex';

  seleccionActual = [];
  actualizarTotales();
  ocupadasTemp = await api(`/sillas/funcion/${funcionActual.funcionId}`).catch(() => ocupadasTemp);
  dibujarMapa();
}

// ── Countdown visual ─────────────────────────────────────────
function _iniciarCountdown(ttlSegundos) {
  _bloqueoExpiraEn = Date.now() + ttlSegundos * 1000;
  const cdEl = document.getElementById('bloqueo-countdown');
  if (!cdEl) return;
  cdEl.style.display = 'flex';

  const tick = () => {
    const restante = Math.max(0, Math.round((_bloqueoExpiraEn - Date.now()) / 1000));
    const m    = String(Math.floor(restante / 60)).padStart(2, '0');
    const s    = String(restante % 60).padStart(2, '0');
    const span = document.getElementById('bloqueo-timer-val');
    if (span) span.textContent = `${m}:${s}`;
    if (cdEl) cdEl.style.borderColor = restante < 60 ? 'rgba(229,57,53,0.5)' : 'rgba(245,197,24,0.3)';

    if (restante === 0) {
      _limpiarBloqueoLocal();
      showAlert('⏰ El tiempo de reserva expiró. Por favor selecciona los asientos nuevamente.', 'error');
      volverPaso1();
      if (funcionActual) {
        api(`/sillas/funcion/${funcionActual.funcionId}`)
          .then(data => { ocupadasTemp = data; dibujarMapa(); })
          .catch(() => {});
      }
    }
  };

  tick();
  _bloqueoInterval = setInterval(tick, 1000);
}

// ── Limpiar estado de bloqueo local ─────────────────────────
function _limpiarBloqueoLocal() {
  _bloqueoActivo   = false;
  _bloqueoExpiraEn = null;
  if (_bloqueoInterval) { clearInterval(_bloqueoInterval); _bloqueoInterval = null; }
  const cdEl = document.getElementById('bloqueo-countdown');
  if (cdEl) cdEl.style.display = 'none';
}