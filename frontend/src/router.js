import Navigo from 'navigo';
import { handleLogin, handleRegister, logout, switchAuthTab } from './services/auth.js';
import { switchView } from './pages/admin/admin.js';

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

const router = new Navigo('/', { hash: true });
const adminViewsHtml = [
  peliculasHtml,
  salasHtml,
  funcionesHtml,
  reservasHtml,
  sucursalesHtml,
  usuariosHtml,
  configHtml,
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
}

export default router;
