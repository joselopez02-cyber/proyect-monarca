import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// En producción el frontend compilado (frontend/dist) se sirve desde este mismo servidor:
// una sola URL para la web y la API, y el frontend usa su propio origen como dirección de la API.
// Si frontend/dist no existe (por ejemplo, en desarrollo con Vite), no hace nada.
export default function servirFrontend(app) {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return;

  app.use(express.static(dist));
  // Cualquier ruta que no sea de la API devuelve la página principal (el router del frontend decide qué mostrar)
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
