/* ============================================================
   cambiar-password.js — Cambiar mi contraseña (KAN-48, HU25)
   Usa PATCH /api/auth/password con la contraseña actual y la nueva.
   Depende de: api.js, utils.js
   ============================================================ */

import { api } from '../../services/api.js';
import { showAlert } from '../../utils/utils.js';

const ids = ['pwd_actual', 'pwd_nueva', 'pwd_repetir'];

function mostrarError(mensaje) {
  const el = document.getElementById('pwd_error');
  if (!el) return;
  el.textContent = mensaje || '';
  el.style.display = mensaje ? 'block' : 'none';
}

export async function cambiarPassword() {
  const [actual, nueva, repetir] = ids.map((id) => document.getElementById(id)?.value ?? '');
  mostrarError('');

  // Las mismas reglas que valida el servidor, para avisar antes de enviar
  if (!actual || !nueva || !repetir) return mostrarError('Completa los tres campos.');
  if (nueva.length < 6) return mostrarError('La nueva contraseña debe tener mínimo 6 caracteres.');
  if (nueva !== repetir) return mostrarError('La confirmación no coincide con la nueva contraseña.');
  if (nueva === actual) return mostrarError('La nueva contraseña debe ser distinta a la actual.');

  const boton = document.getElementById('pwd_btn');
  if (boton) boton.disabled = true;
  try {
    await api('/auth/password', 'PATCH', { passwordActual: actual, passwordNueva: nueva });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    showAlert('Contraseña actualizada. Úsala en tu próximo inicio de sesión.');
  } catch (e) {
    mostrarError(e.message);
  } finally {
    if (boton) boton.disabled = false;
  }
}

Object.assign(window, { cambiarPassword });
