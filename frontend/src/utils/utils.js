/* ============================================================
   utils.js — Helpers compartidos de Cinema Monarca
   ============================================================ */

/**
 * Muestra un toast de notificación.
 * @param {string} msg   Mensaje a mostrar
 * @param {'success'|'error'} type
 */
function showAlert(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return; // null guard: si el DOM aún no existe no crashea
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg; // textContent evita XSS con datos del servidor
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Escapa comillas simples y dobles para usar en atributos HTML inline.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/**
 * Escapa caracteres especiales HTML para evitar XSS.
 * @param {string} s
 * @returns {string}
 */
function escHtml(s) {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formatea el número de tarjeta en grupos de 4 dígitos.
 * @param {HTMLInputElement} input
 */
function formatCardNumber(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 16);
  input.value = v.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Formatea la fecha de vencimiento como MM/AA.
 * @param {HTMLInputElement} input
 */
function formatExpiry(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 4);
  if (v.length >= 3) v = v.substring(0, 2) + '/' + v.substring(2);
  input.value = v;
}

/**
 * Limita el teléfono a 10 dígitos numéricos.
 * @param {HTMLInputElement} input
 */
function formatPhone(input) {
  input.value = input.value.replace(/\D/g, '').substring(0, 10);
}

/**
 * Etiqueta legible para el tipo de sala.
 * @param {string} tipo
 * @returns {string}
 */
function tipoLabel(tipo) {
  if (!tipo) return '—';
  const map = { '2D': '2D', '3D': '3D', 'IMAX': 'IMAX', '4DX': '4DX', 'VIP': 'VIP', 'PREMIUM': 'PREMIUM',
                'PRO': 'PRO', 'TRES_D': '3D', 'DOS_D': '2D' };
  return map[tipo] || tipo;
}

/**
 * Devuelve una fecha ISO corta en formato "Lun 5 Jun".
 * @param {string} iso  Fecha en formato YYYY-MM-DD
 * @returns {string}
 */
function formatFechaCorta(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const dias  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return `${dias[fecha.getDay()]} ${parseInt(d)} ${meses[parseInt(m) - 1]}`;
}

/** Mapa de etiquetas para métodos de pago */
const METODO_LABEL = {
  TARJETA_CREDITO: '💳 Tarjeta Crédito',
  TARJETA_DEBITO:  '💳 Tarjeta Débito',
  NEQUI:           '📱 Nequi',
  PSE:             '🏦 PSE',
  EFECTIVO:        '💵 Efectivo',
};

/** Alias de compatibilidad */
function cargarClientes() { cargarUsuarios(); }