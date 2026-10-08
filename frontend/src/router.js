import Navigo from 'navigo';

// Importación de HTML como texto puro (característica de Vite con ?raw)
import loginHtml from './pages/login/login.html?raw';
import sidebarHtml from './components/sidebar/sidebar.html?raw';
import contentAreaHtml from './pages/cartelera/content-area.html?raw';
// Podríamos importar los views del admin aquí también

const router = new Navigo('/', { hash: true });

function render(htmlContent) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = htmlContent;
  }
}

export function initRouter() {
  router
    .on({
      '/': () => {
        console.log('Ruta: Login');
        render(loginHtml);
        
        // Inicializar eventos de login
        // Como los JS todavía son globales o necesitan ser refactorizados a módulos:
        const loginForm = document.getElementById('loginForm');
        if (loginForm && window.handleLogin) {
          loginForm.addEventListener('submit', window.handleLogin);
        }
      },
      '/dashboard': () => {
        console.log('Ruta: Dashboard / Cartelera');
        // Renderizamos el sidebar y el área de contenido
        render(`
          <div style="display:flex;">
            ${sidebarHtml}
            <main class="main-content" style="flex:1;">
              ${contentAreaHtml}
            </main>
          </div>
        `);
      }
    })
    .resolve();
}

export default router;
