import Navigo from 'navigo';
import { handleLogin, handleRegister, logout, switchAuthTab } from './services/auth.js';
import { switchView } from './pages/admin/admin.js';
import { showAlert } from './utils/utils.js';

// Importación de HTML como texto puro (característica de Vite con ?raw)
import loginHtml from './pages/login/login.html?raw';
import sidebarHtml from './components/sidebar/sidebar.html?raw';
import contentAreaHtml from './pages/cartelera/content-area.html?raw';
import peliculasHtml from './pages/admin/views/view-peliculas.html?raw';
import salasHtml from './pages/admin/views/view-salas.html?raw';
import funcionesHtml from './pages/admin/views/view-funciones.html?raw';
import reservasHtml from './pages/admin/views/view-reservas.html?raw';
import sucursalesHtml from './pages/admin/views/view-sucursales.html?raw';
import usuariosHtml from './pages/admin/views/view-usuarios.html?raw';
import configHtml from './pages/admin/views/view-config.html?raw';
import ocupacionHtml from './pages/admin/views/view-ocupacion.html?raw';
import misPagosHtml from './pages/admin/views/view-mis-pagos.html?raw';

const router = new Navigo('/', { hash: true });
const adminViewsHtml = [
  peliculasHtml,
  salasHtml,
  funcionesHtml,
  reservasHtml,
  sucursalesHtml,
  usuariosHtml,
  configHtml,
  ocupacionHtml,
  misPagosHtml,
].join('\n');

function render(htmlContent) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = htmlContent;
  }
}

export function initRouter() {
  const root = document.getElementById('root');
  root?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const navItem = event.target.closest('[data-view]');
    if (navItem && root.contains(navItem)) {
      switchView(navItem.dataset.view, navItem);
      return;
    }

    if (event.target.closest('[data-action="logout"]')) logout();
  });

  router
    .on({
      '/': () => {
        console.log('Ruta: Login');
        render(loginHtml);
        document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
        document.getElementById('loginSubmit')?.addEventListener('click', handleLogin);
        document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
        document.querySelectorAll('.auth-tab').forEach((button, index) => {
          button.addEventListener('click', () => switchAuthTab(index === 0 ? 'login' : 'register', button));
        });
      },
      '/dashboard': () => {
        console.log('Ruta: Dashboard / Cartelera');
        // Sin sesión vigente no hay panel: se vuelve al inicio de sesión
        const exp = Number(localStorage.getItem('monarca_token_exp') || 0);
        if (!localStorage.getItem('monarca_token') || (exp && exp < Date.now())) {
          router.navigate('/');
          return;
        }
        // Renderizamos el sidebar y el área de contenido
        render(`
          <div style="display:flex;">
            ${sidebarHtml}
            <main class="main-content" style="flex:1;">
              ${contentAreaHtml}
              <div class="content-area">${adminViewsHtml}</div>
            </main>
          </div>
        `);
      }
    })
    .resolve();

  window.addEventListener('monarca:authenticated', () => router.navigate('/dashboard'));

  // Si el servidor responde 401 (token vencido o inválido) se vuelve al inicio de sesión,
  // en vez de dejar el panel abierto con el error "Sesión expirada" en cada tabla.
  window.addEventListener('monarca:session-expired', () => {
    if (document.getElementById('loginForm')) return;
    showAlert('Tu sesión expiró. Inicia sesión de nuevo.', 'error');
    router.navigate('/');
  });
}

export default router;
