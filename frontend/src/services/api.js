/* ============================================================
   api.js — Cliente HTTP y manejo de conexión
   Depende de: utils.js (showAlert), auth.js (logout)
   ============================================================ */

// ── Configuración de API_BASE ────────────────────────────────
if (typeof _AZURE_URL === 'undefined') var _AZURE_URL = 'https://monarca-e4cfe8dyfvaddhcj.brazilsouth-01.azurewebsites.net';
if (typeof _autoBase === 'undefined') var _autoBase = window.location.origin;

(function () {
  const saved = localStorage.getItem('monarca_api_base');
  if (!saved) return; // nada guardado, no hay nada que limpiar
  const _isLocal =
    saved.includes('localhost') ||
    saved.includes('127.0.0.1') ||
    saved.startsWith('http://') && !/^http:\/\/192\.168\.|^http:\/\/10\.|^http:\/\/172\.(1[6-9]|2[0-9]|3[01])\./.test(saved);
  if (_isLocal) localStorage.removeItem('monarca_api_base');
})();

if (typeof _savedBase === 'undefined') var _savedBase = localStorage.getItem('monarca_api_base');
if (typeof API_BASE === 'undefined') var API_BASE = (_savedBase || _autoBase || _AZURE_URL).replace(/\/api$/, '').replace(/\/$/, '');

// ── Token JWT ────────────────────────────────────────────────
let JWT_TOKEN = (function () {
  const ss = sessionStorage.getItem('monarca_token');
  if (ss) return ss;

  const ls  = localStorage.getItem('monarca_token');
  const exp = parseInt(localStorage.getItem('monarca_token_exp') || '0');

  if (ls && Date.now() < exp) {
    sessionStorage.setItem('monarca_token',     ls);
    sessionStorage.setItem('monarca_email',     localStorage.getItem('monarca_email')     || '');
    sessionStorage.setItem('monarca_rol',       localStorage.getItem('monarca_rol')       || '');
    sessionStorage.setItem('monarca_username',  localStorage.getItem('monarca_username')  || '');
    sessionStorage.setItem('monarca_usuarioId', localStorage.getItem('monarca_usuarioId') || '');
    return ls;
  }

  // Token expirado o ausente — limpiar storage
  ['monarca_token', 'monarca_token_exp', 'monarca_email', 'monarca_rol',
   'monarca_username', 'monarca_doc', 'monarca_usuarioId']
    .forEach(k => localStorage.removeItem(k));

  return null;
})();

// ── Función principal de fetch ───────────────────────────────
/**
 * Realiza una petición autenticada a la API REST.
 * @param {string} path       Ruta relativa, ej: '/funciones'
 * @param {string} method     Método HTTP (GET, POST, PUT, DELETE, PATCH)
 * @param {object|null} body  Cuerpo JSON
 * @returns {Promise<any>}
 */
async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (JWT_TOKEN) headers['Authorization'] = `Bearer ${JWT_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body ? JSON.stringify(body) : null,
    });

    clearTimeout(timer);

    if (res.status === 401) {
      _handleSessionExpired();
      throw new Error('Sesión expirada. Inicia sesión de nuevo.');
    }

    if (res.status === 403) {
      const t = await res.text();
      throw new Error(t || 'No tienes permiso para esta operación.');
    }

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = `Error HTTP: ${res.status}`;
      try {
        const json = JSON.parse(text);
        errorMessage = json.error || json.message || errorMessage;
      } catch {
        errorMessage = text || errorMessage;
      }
      throw new Error(errorMessage);
    }

    setStatus(true);
    const ct = res.headers.get('content-type');
    return ct && ct.includes('application/json') ? await res.json() : await res.text();

  } catch (e) {
    clearTimeout(timer);
    setStatus(false);
    if (e.name === 'AbortError') throw new Error('Tiempo de espera agotado. Verifica tu conexión.');
    if (!navigator.onLine)       throw new Error('Sin conexión a internet.');
    throw e;
  }
}

// ── Manejo de sesión expirada ────────────────────────────────
/**
 * Limpia el storage y notifica a la UI cuando el token caduca (401).
 * Usa un CustomEvent en lugar de llamar logout() directamente para
 * evitar dependencia circular con auth.js.
 */
function _handleSessionExpired() {
  JWT_TOKEN = null;
  sessionStorage.clear();
  ['monarca_token', 'monarca_token_exp', 'monarca_email', 'monarca_rol',
   'monarca_username', 'monarca_doc', 'monarca_usuarioId']
    .forEach(k => localStorage.removeItem(k));
  window.dispatchEvent(new CustomEvent('monarca:session-expired'));
}

// ── Indicador de estado de conexión ─────────────────────────
function setStatus(ok) {
  const dot = document.getElementById('apiStatusDot');
  const txt = document.getElementById('apiStatusText');
  if (!dot || !txt) return;
  dot.className = 'status-dot ' + (ok ? 'online' : 'offline');
  if (ok) {
    txt.textContent = 'API Conectada';
    txt.style.color = 'var(--c-green)';
  } else {
    txt.textContent = navigator.onLine ? 'API Desconectada' : 'Sin internet';
    txt.style.color = 'var(--c-red)';
  }
}

async function testConexion() {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(API_BASE + '/api/peliculas', {
      headers: JWT_TOKEN ? { 'Authorization': 'Bearer ' + JWT_TOKEN } : {},
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    setStatus(res.ok || res.status === 401);
  } catch (e) { clearTimeout(timer); setStatus(false); }
}

window.addEventListener('online',  () => { setStatus(false); testConexion(); });
window.addEventListener('offline', () => setStatus(false));

// ── Guardar/cambiar API_BASE desde Configuración ─────────────
function guardarConfig() {
  const inputVal = document.getElementById('apiBaseInput').value.trim().replace(/\/api$/, '').replace(/\/$/, '');
  API_BASE = inputVal || window.location.origin;
  if (API_BASE !== window.location.origin) {
    localStorage.setItem('monarca_api_base', API_BASE);
  } else {
    localStorage.removeItem('monarca_api_base');
  }
  showAlert('Configuración de URL guardada.');
  const swLink = document.getElementById('cfg_swagger_link');
  if (swLink && API_BASE) { swLink.href = API_BASE + '/swagger-ui/index.html'; swLink.style.display = 'flex'; }
  const urlDisp = document.getElementById('cfg_url_display');
  if (urlDisp) urlDisp.textContent = API_BASE || window.location.origin;
  testConexion();
}

// Alias para compatibilidad con botón en config
function guardarApiBase() { guardarConfig(); }