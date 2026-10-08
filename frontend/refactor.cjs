const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const html = fs.readFileSync('index.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

// Extract Styles
const styles = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML).join('\n');
fs.writeFileSync('src/styles.css', styles);

// Directories
ensureDir('src/pages/login');
ensureDir('src/pages/splash');
ensureDir('src/components/sidebar');
ensureDir('src/components/topbar');
ensureDir('src/pages/admin/views');

// Extract elements
function extractAndRemove(idOrSelector, filePath) {
  const el = document.querySelector(idOrSelector);
  if (el) {
    fs.writeFileSync(filePath, el.outerHTML);
    el.remove();
    console.log(`Extracted ${idOrSelector} to ${filePath}`);
  }
}

extractAndRemove('#splashScreen', 'src/pages/splash/splash.html');
extractAndRemove('#loginScreen', 'src/pages/login/login.html');
extractAndRemove('.sidebar', 'src/components/sidebar/sidebar.html');
extractAndRemove('.topbar', 'src/components/topbar/topbar.html');

// Extract views inside main-content
const views = [
  'view-peliculas', 'view-salas', 'view-funciones', 
  'view-reservas', 'view-sucursales', 'view-usuarios', 'view-config'
];
for (const viewId of views) {
  extractAndRemove(`#${viewId}`, `src/pages/admin/views/${viewId}.html`);
}

// Extract carteleraList and content-area?
extractAndRemove('.content-area', 'src/pages/cartelera/content-area.html');

// Create the new base index.html
const newIndexHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="data:,">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cinema Monarca — App Producción</title>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/src/styles.css">
</head>
<body>
  <!-- Global Toasts -->
  <div id="toast-container" style="position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;"></div>
  
  <!-- Root Container for Navigo Router -->
  <div id="root"></div>

  <!-- Global Modals (Left here temporarily to avoid breaking JS) -->
  <div id="modals-container">
    ${document.getElementById('modalSillas') ? document.getElementById('modalSillas').outerHTML : ''}
    ${document.getElementById('modalSelFuncion') ? document.getElementById('modalSelFuncion').outerHTML : ''}
    ${document.getElementById('modalDetallesGrupo') ? document.getElementById('modalDetallesGrupo').outerHTML : ''}
    ${document.getElementById('modalEditFuncionInd') ? document.getElementById('modalEditFuncionInd').outerHTML : ''}
    ${document.getElementById('modalReserva') ? document.getElementById('modalReserva').outerHTML : ''}
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

fs.writeFileSync('index.html', newIndexHtml);
console.log('Refactoring complete. New index.html created.');
