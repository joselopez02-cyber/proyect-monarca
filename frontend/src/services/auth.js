/* ============================================================
   auth.js — Autenticación, sesión y control de acceso
   Depende de: api.js, utils.js
   ============================================================ */

'use strict';

// ── Constantes ───────────────────────────────────────────────
const AUTH_TIMEOUT_MS   = 12_000;
const CONFIG_TIMEOUT_MS = 10_000;
const SESSION_TTL_MS    = 8 * 60 * 60 * 1000; // 8 horas

const SESSION_KEYS = [
  'monarca_token', 'monarca_token_exp', 'monarca_email',
  'monarca_rol',   'monarca_username',  'monarca_doc',
  'monarca_usuarioId',
];

// ── Utilidades internas ──────────────────────────────────────

/**
 * Realiza un POST a la API de autenticación con timeout configurable.
 * @param {string} endpoint  - Ruta relativa, ej. '/api/auth/login'
 * @param {object} body      - Payload JSON
 * @param {number} timeoutMs - Tiempo límite en ms
 * @returns {Promise<object>} Datos de la respuesta
 */
async function _authPost(endpoint, body, timeoutMs = AUTH_TIMEOUT_MS) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);

    if (res.status === 429) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Demasiados intentos. Espera unos minutos.');
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Credenciales inválidas.');
    }

    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Persiste los datos de sesión en localStorage y sessionStorage.
 * @param {object} data - Respuesta del servidor tras autenticar
 */
function _persistirSesion(data) {
  JWT_TOKEN = data.token;

  const session = {
    monarca_token:     JWT_TOKEN,
    monarca_token_exp: String(Date.now() + SESSION_TTL_MS),
    monarca_email:     data.email      || '',
    monarca_rol:       data.rol        || 'USER',
    monarca_username:  data.username   || '',
    monarca_usuarioId: data.usuarioId  ? String(data.usuarioId) : '',
    monarca_doc:       data.cliDoc || data.documento || data.username || '',
  };

  Object.entries(session).forEach(([k, v]) => {
    localStorage.setItem(k, v);
    sessionStorage.setItem(k, v);
  });
}

/**
 * Muestra los datos del usuario autenticado en el sidebar.
 * @param {object} data - Datos de sesión
 */
function _mostrarUsuarioSidebar(data) {
  const username = data.username || data.email || 'Usuario';
  const rol      = data.rol || 'USER';

  const elAvatar   = document.getElementById('sidebar-avatar-letter');
  const elUsername = document.getElementById('sidebar-username-label');
  const elRol      = document.getElementById('sidebar-rol-label');

  if (elAvatar)   elAvatar.textContent   = username[0].toUpperCase();
  if (elUsername) elUsername.textContent = username;
  if (elRol)      elRol.textContent      = rol === 'ADMIN' ? 'Administrador' : 'Cliente';
}

/**
 * Oculta la pantalla de login con transición.
 */
function _ocultarLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  if (!loginScreen) return;
  loginScreen.style.opacity = '0';
  setTimeout(() => { loginScreen.style.visibility = 'hidden'; }, 500);
}

/**
 * Muestra un mensaje de error en un elemento del DOM.
 * @param {HTMLElement} el  - Elemento donde mostrar el error
 * @param {string}      msg - Mensaje de error
 */
function _mostrarError(el, msg) {
  if (!el) return;
  el.textContent    = msg;
  el.style.display  = 'block';
}

/**
 * Normaliza un error de fetch en un mensaje legible.
 * @param {Error} err
 * @returns {string}
 */
function _mensajeError(err) {
  if (err.name === 'AbortError') return 'Tiempo de espera agotado. Intenta de nuevo.';
  if (!navigator.onLine)         return 'Sin conexión a internet.';
  return err.message || 'Error inesperado. Verifica el servidor.';
}

// ── Login ────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('l_user')?.value.trim();
  const password = document.getElementById('l_pass')?.value;

  try {
    const data = await _authPost('/api/auth/login', { username, password });

    _persistirSesion(data);
    _mostrarUsuarioSidebar(data);
    _ocultarLoginScreen();
    iniciarApp();
    showAlert('Autenticación exitosa.');
  } catch (err) {
    showAlert(_mensajeError(err), 'error');
  }
}

// ── Registro ─────────────────────────────────────────────────

async function handleRegister(e) {
  e.preventDefault();

  const errEl = document.getElementById('registerError');
  errEl.style.display = 'none';

  const pass  = document.getElementById('r_password')?.value;
  const pass2 = document.getElementById('r_password2')?.value;

  if (pass !== pass2) {
    _mostrarError(errEl, 'Las contraseñas no coinciden.');
    return;
  }

  const payload = {
    username:        document.getElementById('r_username')?.value.trim(),
    email:           document.getElementById('r_email')?.value.trim(),
    password:        pass,
    nombreCompleto:  document.getElementById('r_nombreCompleto')?.value.trim(),
    cedula:          document.getElementById('r_cedula')?.value.trim(),
    telefono:        document.getElementById('r_telefono')?.value.trim(),
    direccion:       document.getElementById('r_direccion')?.value.trim(),
    fechaNacimiento: document.getElementById('r_fechaNac')?.value,
  };

  try {
    const data = await _authPost('/api/auth/register', payload);

    _persistirSesion(data);
    _ocultarLoginScreen();
    iniciarApp();
    showAlert(`¡Cuenta creada! Bienvenido, ${data.username}.`);
  } catch (err) {
    _mostrarError(errEl, err.message || 'Error al registrar.');
  }
}

// ── Logout ───────────────────────────────────────────────────

function logout() {
  sessionStorage.clear();
  SESSION_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ── Tabs del formulario de autenticación ─────────────────────

function switchAuthTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

  btn.classList.add('active');
  document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
  document.getElementById('registerError').style.display = 'none';
}

// ── Iniciar app ──────────────────────────────────────────────

function iniciarApp() {
  mostrarSplash(() => {
    testConexion();
    aplicarNavPorRol();
    cargarDashboard();
  });
}

// ── Pantalla de carga (splash) ───────────────────────────────

function mostrarSplash(onDone) {
  const splash = document.getElementById('splashScreen');
  const bar    = document.getElementById('splashBar');
  const audio  = document.getElementById('splashAudio');

  if (!splash) { onDone?.(); return; }

  // Limpiar estado previo
  splash.style.removeProperty('display');
  splash.classList.remove('visible', 'hiding');
  if (bar) bar.style.width = '0%';

  // Forzar reflow antes de añadir la clase para que la animación reinicie
  void splash.offsetWidth;
  splash.classList.add('visible');

  if (audio) {
    audio.currentTime = 0;
    audio.volume      = 0.7;
    audio.play().catch(() => {/* autoplay bloqueado por el navegador */});
  }

  // Animar barra de progreso (~2 s en 40 pasos de 50 ms)
  let progress = 0;
  const STEPS    = 40;
  const INTERVAL = 50;

  const progressTimer = setInterval(() => {
    progress = Math.min(progress + (100 / STEPS), 100);
    if (bar) bar.style.width = `${progress}%`;
    if (progress >= 100) clearInterval(progressTimer);
  }, INTERVAL);

  // Ocultar con fade-out y ejecutar callback
  setTimeout(() => {
    splash.classList.add('hiding');
    setTimeout(() => {
      splash.classList.remove('visible', 'hiding');
      splash.style.setProperty('display', 'none');
      onDone?.();
    }, 600);
  }, 2600);
}

// ── Navegación por rol ───────────────────────────────────────

function aplicarNavPorRol() {
  const isAdmin = (sessionStorage.getItem('monarca_rol') || 'USER') === 'ADMIN';

  // Mostrar / ocultar ítems según rol
  document.querySelectorAll('[data-rol]').forEach(el => {
    const requiereAdmin = el.getAttribute('data-rol') === 'ADMIN';
    el.style.display = requiereAdmin && !isAdmin ? 'none' : '';
  });

  // El dashboard solo es visible para admins
  const navDashboard = document.querySelector('.nav-item[data-view="dashboard"]');
  if (navDashboard) navDashboard.style.display = isAdmin ? '' : 'none';

  // Etiquetas contextuales según rol
  const navTaquilla  = document.querySelector('.nav-item[data-view="cartelera"]');
  const navHistorial = document.querySelector('.nav-item[data-view="reservas"]');

  if (navTaquilla)  navTaquilla.textContent  = isAdmin ? 'Taquilla & Ventas' : 'Taquilla';
  if (navHistorial) navHistorial.textContent = isAdmin ? 'Historial Ventas'  : 'Historial';
}

// ── Config / Token para Swagger ──────────────────────────────

let _cfgToken = null;

function switchAuthConfigTab(tab) {
  const isLogin = tab === 'login';

  const btnLogin  = document.getElementById('auth_tab_login');
  const btnToken  = document.getElementById('auth_tab_token');
  const panelLogin = document.getElementById('auth_panel_login');
  const panelToken = document.getElementById('auth_panel_token');

  const setTabStyle = (btn, active) => {
    if (!btn) return;
    btn.style.background = active ? 'var(--c-gold)'  : 'transparent';
    btn.style.color      = active ? '#07070f'         : 'var(--c-text)';
  };

  setTabStyle(btnLogin, isLogin);
  setTabStyle(btnToken, !isLogin);

  if (panelLogin) panelLogin.style.display = isLogin  ? 'flex' : 'none';
  if (panelToken) panelToken.style.display = !isLogin ? 'flex' : 'none';
}

async function obtenerTokenConfig() {
  const user  = document.getElementById('cfg_auth_user')?.value.trim();
  const pass  = document.getElementById('cfg_auth_pass')?.value;
  const errEl = document.getElementById('cfg_auth_error');

  if (!user || !pass) {
    _mostrarError(errEl, 'Completa usuario y contraseña.');
    return;
  }

  errEl.style.display = 'none';

  try {
    const data = await _authPost('/api/auth/login', { username: user, password: pass }, CONFIG_TIMEOUT_MS);
    _cfgToken  = data.token;

    // Activar pestaña de token
    const btnToken = document.getElementById('auth_tab_token');
    if (btnToken) {
      Object.assign(btnToken, { disabled: false, title: '', textContent: 'Mi Token' });
      Object.assign(btnToken.style, { cursor: 'pointer', opacity: '1', color: 'var(--c-text)', background: 'transparent' });
    }

    // Rellenar campos de información
    const elTokenDisplay = document.getElementById('cfg_token_display');
    const elTokenUser    = document.getElementById('cfg_token_user');
    const elTokenRol     = document.getElementById('cfg_token_rol');
    const elSwaggerLink  = document.getElementById('cfg_swagger_token_link');

    if (elTokenDisplay) elTokenDisplay.textContent = data.token;
    if (elTokenUser)    elTokenUser.textContent    = data.username || user;
    if (elTokenRol) {
      elTokenRol.textContent = data.rol || 'USER';
      elTokenRol.style.color = data.rol === 'ADMIN' ? 'var(--c-red)' : 'var(--c-blue)';
    }
    if (elSwaggerLink) elSwaggerLink.href = `${API_BASE}/swagger-ui/index.html`;

    switchAuthConfigTab('token');
    showAlert(`Token obtenido para ${data.username || user}.`);
  } catch (err) {
    _mostrarError(errEl, _mensajeError(err));
  }
}

function copiarToken() {
  if (!_cfgToken) return;

  navigator.clipboard.writeText(_cfgToken)
    .then(() => showAlert('Token copiado al portapapeles.'))
    .catch(() => {
      // Fallback: seleccionar texto manualmente
      const el = document.getElementById('cfg_token_display');
      if (!el) return;
      const range = document.createRange();
      range.selectNode(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
}