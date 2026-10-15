/* ============================================================
   silla-lock.js — Bloqueo de sillas y countdown de reserva
   ============================================================ */

import { api } from '../../services/api.js';
import { showAlert } from '../../utils/utils.js';
import { reservationState } from '../reservation-state.js';
import { actualizarTotales, dibujarMapa } from '../reservas/reservas.js';

let _bloqueoInterval = null;
let _bloqueoExpiraEn = null;

export async function irPaso2() {
  const { selectedSeats, currentFunction } = reservationState;
  if (!selectedSeats.length) {
    showAlert('Selecciona al menos un asiento.', 'error');
    return;
  }

  const clienteKey = sessionStorage.getItem('monarca_username') || '';
  const btnContinuar = document.querySelector('#paso1Modal .btn-primary');
  if (btnContinuar) {
    btnContinuar.disabled = true;
    btnContinuar.textContent = 'Bloqueando…';
  }

  try {
    const resp = await api('/sillas/bloquear', 'POST', {
      funcionId: currentFunction.funcionId,
      codigos: selectedSeats,
      clienteKey,
    });
    reservationState.lockActive = true;
    _iniciarCountdown(resp.ttlSegundos || 420);
  } catch (e) {
    const message = e.message || 'No se pudieron reservar las sillas. Intenta de nuevo.';
    showAlert(message, 'error');
    const respuesta = await api(`/sillas/funcion/${currentFunction.funcionId}`).catch(() => null);
    if (respuesta && Array.isArray(respuesta.sillas)) {
      reservationState.occupiedSeats = respuesta.sillas;
    }
    dibujarMapa();
    if (btnContinuar) {
      btnContinuar.disabled = false;
      btnContinuar.textContent = 'Continuar pago →';
    }
    return;
  }

  if (btnContinuar) {
    btnContinuar.disabled = false;
    btnContinuar.textContent = 'Continuar pago →';
  }

  document.getElementById('paso1Modal').style.display = 'none';
  document.getElementById('paso2Modal').style.display = 'flex';
  document.getElementById('p2_sillas').textContent = selectedSeats.join(', ');
  document.getElementById('p2_num').textContent = selectedSeats.length;
  const total = selectedSeats.length * currentFunction.precioBoleto;
  document.getElementById('r_total').textContent = `$${total.toLocaleString()} COP`;
  document.getElementById('r_precioBase').textContent = `$${(currentFunction.precioBoleto || 0).toLocaleString()} COP`;
}

export async function volverPaso1() {
  const { selectedSeats, currentFunction } = reservationState;
  if (reservationState.lockActive && currentFunction && selectedSeats.length) {
    const clienteKey = sessionStorage.getItem('monarca_username') || '';
    api('/sillas/liberar', 'DELETE', {
      funcionId: currentFunction.funcionId,
      codigos: selectedSeats,
      clienteKey,
    }).catch(() => {});
  }
  limpiarBloqueoLocal();

  document.getElementById('paso2Modal').style.display = 'none';
  document.getElementById('paso1Modal').style.display = 'flex';
  selectedSeats.length = 0;
  actualizarTotales();
  const respuesta = await api(`/sillas/funcion/${currentFunction.funcionId}`).catch(() => null);
  if (respuesta && Array.isArray(respuesta.sillas)) {
    reservationState.occupiedSeats = respuesta.sillas;
  }
  dibujarMapa();
}

function _iniciarCountdown(ttlSegundos) {
  _bloqueoExpiraEn = Date.now() + ttlSegundos * 1000;
  const cdEl = document.getElementById('bloqueo-countdown');
  if (!cdEl) return;
  cdEl.style.display = 'flex';

  const tick = () => {
    const restante = Math.max(0, Math.round((_bloqueoExpiraEn - Date.now()) / 1000));
    const m = String(Math.floor(restante / 60)).padStart(2, '0');
    const s = String(restante % 60).padStart(2, '0');
    const span = document.getElementById('bloqueo-timer-val');
    if (span) span.textContent = `${m}:${s}`;
    if (cdEl) cdEl.style.borderColor = restante < 60 ? 'rgba(229,57,53,0.5)' : 'rgba(245,197,24,0.3)';

    if (restante === 0) {
      limpiarBloqueoLocal();
      showAlert('⏰ El tiempo de reserva expiró. Por favor selecciona las sillas nuevamente.', 'error');
      volverPaso1();
    }
  };

  tick();
  _bloqueoInterval = setInterval(tick, 1000);
}

export function limpiarBloqueoLocal() {
  reservationState.lockActive = false;
  _bloqueoExpiraEn = null;
  if (_bloqueoInterval) {
    clearInterval(_bloqueoInterval);
    _bloqueoInterval = null;
  }
  const cdEl = document.getElementById('bloqueo-countdown');
  if (cdEl) cdEl.style.display = 'none';
}

Object.assign(window, { irPaso2, volverPaso1 });
