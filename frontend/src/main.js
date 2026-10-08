import router, { initRouter } from './router.js';

// Importar los estilos globales extraídos
import './styles.css';

// IMPORTANTE: Para que los scripts antiguos sigan funcionando mientras
// terminamos de refactorizarlos a módulos ES6 puros (bajo acoplamiento),
// los importamos aquí. Como Vite los procesará, eventualmente deberemos
// cambiar funciones globales (window.handleLogin) por exports/imports reales.

import './utils/utils.js';
import './services/api.js';
import './services/auth.js';
import './pages/cartelera/cartelera.js';
import './pages/sillas/silla-lock.js';
import './pages/reservas/reservas.js';
import './pages/funciones/funciones.js';
import './pages/admin/admin.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log("Aplicación inicializada con Navigo.");
  
  // Exponer variables/funciones temporalmente a window si es necesario 
  // para que los archivos no modulares no se rompan
  
  initRouter();
});
