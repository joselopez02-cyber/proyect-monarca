/* ============================================================
   mis-pagos.js — Historial de transacciones del cliente (HU20)
   Usa GET /api/transacciones/cliente/{custId}
   Depende de: api.js, utils.js
   ============================================================ */

import { api } from '../../services/api.js';
import { escHtml, showAlert, METODO_LABEL } from '../../utils/utils.js';

const BADGE_ESTADO = { APROBADO: 'badge-green', RECHAZADO: 'badge-red' };

function formatearFecha(valor) {
  const d = new Date(valor);
  if (!valor || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export async function cargarMisPagos() {
  const tbody = document.getElementById('misPagosTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--c-muted)">Cargando…</td></tr>';
  try {
    // Cada cuenta ve solo sus clientes; se pide el historial de cada uno y se juntan.
    const clientes = await api('/clientes');
    const listas = await Promise.all(
      (clientes || []).map((c) => api(`/transacciones/cliente/${c.custId}`)),
    );
    const pagos = listas.flat().sort((a, b) =>
      new Date(b.fechaTrans) - new Date(a.fechaTrans) || b.transNo - a.transNo);

    if (!pagos.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aún no tienes transacciones registradas.</td></tr>';
      return;
    }

    tbody.innerHTML = pagos.map((t) => `
      <tr>
        <td class="mono" style="white-space:nowrap">${escHtml(formatearFecha(t.fechaTrans))}</td>
        <td>
          ${t.resCode ? `<span class="mono">TK-${t.resCode}</span>` : '—'}
          ${t.peliculaNombre ? `<br><span style="font-size:11px;color:var(--c-muted)">${escHtml(t.peliculaNombre)}</span>` : ''}
        </td>
        <td>${escHtml(METODO_LABEL[t.tipoPago] || t.tipoPago || '—')}</td>
        <td class="mono">${t.pagoTotal === null ? '—' : '$' + Number(t.pagoTotal).toLocaleString('es-CO')}</td>
        <td><span class="badge ${BADGE_ESTADO[t.estadoPago] || 'badge-gold'}">${escHtml(t.estadoPago || '—')}</span></td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No se pudo cargar tu historial.</td></tr>';
    showAlert('Error al cargar tus pagos: ' + e.message, 'error');
  }
}

Object.assign(window, { cargarMisPagos });
