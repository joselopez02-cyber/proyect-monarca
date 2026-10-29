/* ============================================================
   ocupacion.js — Panel de ocupación de la sucursal del gestor (KAN-50 / HU27)
   Depende de: api.js, utils.js
   ============================================================ */

import { api } from '../../services/api.js';
import { escHtml, showAlert } from '../../utils/utils.js';

export async function cargarOcupacion() {
  const tbody = document.getElementById('ocupacionTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--c-muted)">Cargando…</td></tr>';
  try {
    const data = await api('/ocupacion');
    const titulo = document.getElementById('ocupacion-sucursal');
    if (titulo) titulo.textContent = `Sucursal: ${data.sucursal || '—'}`;

    if (!data.funciones.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Tu sucursal no tiene funciones programadas.</td></tr>';
      return;
    }

    tbody.innerHTML = data.funciones.map((f) => {
      const pct = Math.min(Math.max(f.ocupacionPct, 0), 100);
      const color = pct >= 80 ? 'var(--c-green)' : pct >= 40 ? 'var(--c-gold)' : 'var(--c-muted)';
      return `
        <tr>
          <td><strong>${escHtml(f.pelicula)}</strong></td>
          <td>${escHtml(f.sala)}</td>
          <td class="mono" style="white-space:nowrap">${escHtml(f.fecha)}</td>
          <td class="mono">${escHtml((f.horaInicio || '').slice(0, 5))}</td>
          <td class="mono">${f.reservas}</td>
          <td class="mono">${f.vendidas} / ${f.capacidadTotal}</td>
          <td class="mono">${f.disponibles}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:6px;background:var(--c-dim);border-radius:3px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${color};"></div>
              </div>
              <span class="mono" style="font-size:12px;min-width:44px;text-align:right;">${f.ocupacionPct}%</span>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No se pudo cargar la ocupación.</td></tr>';
    showAlert('Error al cargar la ocupación: ' + e.message, 'error');
  }
}

Object.assign(window, { cargarOcupacion });
