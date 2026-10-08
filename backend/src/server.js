import 'dotenv/config';
import app from './app.js';

// 8080 es el puerto al que apunta el proxy de Vite en el frontend
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`API de Monarca lista en http://localhost:${PORT}/api/health`);
});
