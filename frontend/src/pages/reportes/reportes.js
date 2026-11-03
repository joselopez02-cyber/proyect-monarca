/* ============================================================
   reportes.js — Reporte de ventas (KAN-42, HU24)
   Depende de: api.js, utils.js
   ============================================================ */

import { api } from '../../services/api.js';
import { escHtml, showAlert } from '../../utils/utils.js';

const fmt = (n) => (Number(n) < 0 ? '-$' : '$') + Math.abs(Number(n || 0)).toLocaleString('es-CO');
const hoyColombia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

// Rango del reporte que se está viendo en pantalla

function mostrarError(msg) {
  const el = document.getElementById('rep-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function tarjeta(titulo, valor, color) {
  return `<div class="card" style="padding:12px 14px;">
    <div style="font-size:11px;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.5px;">${titulo}</div>
    <div class="mono" style="font-size:20px;margin-top:4px;${color ? `color:${color};` : ''}">${valor}</div>
  </div>`;
}

function pintarReporte(rep) {
  const t = rep.totales;
  document.getElementById('rep-resumen').innerHTML =
    tarjeta('Boletas', Number(t.boletas).toLocaleString('es-CO')) +
    tarjeta('Ingresos', fmt(t.ingresos)) +
    tarjeta('Reembolsos', fmt(t.reembolsos)) +
    tarjeta('Neto', fmt(t.neto), 'var(--c-gold)');
  document.getElementById('rep-rango').textContent = `Mostrando: ${rep.desde} a ${rep.hasta} (hora de Colombia)`;

  const tbody = document.getElementById('reporteTbody');
  if (!rep.filas.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--c-muted);padding:24px;">No hay ventas en este rango.</td></tr>';
    return;
  }
  let html = '';
  for (const p of rep.porPelicula) {
    html += `<tr><td colspan="5" style="padding-top:14px;"><strong>${escHtml(p.pelicula)}</strong></td></tr>`;
    for (const f of rep.filas.filter((x) => x.peliculaId === p.peliculaId)) {
      html += `<tr>
        <td style="padding-left:24px;">${escHtml(f.fecha)} ${escHtml(f.horaInicio)} · ${escHtml(f.sala || 'Sala')} <span style="color:var(--c-muted);">(F${f.funcionId})</span></td>
        <td class="mono">${f.boletas}</td>
        <td class="mono">${fmt(f.ingresos)}</td>
        <td class="mono">${fmt(f.reembolsos)}</td>
        <td class="mono">${fmt(f.neto)}</td>
      </tr>`;
    }
    html += `<tr style="font-weight:700;">
      <td style="padding-left:24px;color:var(--c-muted);">Subtotal ${escHtml(p.pelicula)}</td>
      <td class="mono">${p.boletas}</td><td class="mono">${fmt(p.ingresos)}</td>
      <td class="mono">${fmt(p.reembolsos)}</td><td class="mono">${fmt(p.neto)}</td>
    </tr>`;
  }
  html += `<tr style="font-weight:700;border-top:2px solid var(--c-gold);">
    <td>TOTAL</td><td class="mono">${t.boletas}</td><td class="mono">${fmt(t.ingresos)}</td>
    <td class="mono">${fmt(t.reembolsos)}</td><td class="mono">${fmt(t.neto)}</td>
  </tr>`;
  tbody.innerHTML = html;
}

export async function cargarReporteVentas() {
  const desde = document.getElementById('rep-desde')?.value;
  const hasta = document.getElementById('rep-hasta')?.value;
  mostrarError('');
  if (!desde || !hasta) return mostrarError('Elige las fechas "desde" y "hasta".');
  if (desde > hasta) return mostrarError('"Desde" no puede ser posterior a "hasta".');

  const boton = document.getElementById('rep-consultar');
  if (boton) boton.disabled = true;
  try {
    const rep = await api(`/reportes/ventas?desde=${desde}&hasta=${hasta}`);
    pintarReporte(rep);
  } catch (e) {
    mostrarError(e.message);
  } finally {
    if (boton) boton.disabled = false;
  }
}

// Al abrir la vista: rango por defecto = del 1 del mes a hoy, y se consulta de una vez
export function iniciarReportes() {
  const desde = document.getElementById('rep-desde');
  const hasta = document.getElementById('rep-hasta');
  if (desde && !desde.value) desde.value = hoyColombia().slice(0, 8) + '01';
  if (hasta && !hasta.value) hasta.value = hoyColombia();
  cargarReporteVentas();
}

Object.assign(window, { cargarReporteVentas, iniciarReportes });
