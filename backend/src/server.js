import 'dotenv/config';
import app from './app.js';
import { iniciarLimpiezaReservas, RESERVA_TTL_MIN } from './jobs/expirarReservas.js';

// 8080 es el puerto al que apunta el proxy de Vite en el frontend
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`API de Monarca lista en http://localhost:${PORT}/api/health`);
  iniciarLimpiezaReservas();
  console.log(`Limpieza activa: las reservas PENDIENTES se cancelan a los ${RESERVA_TTL_MIN} min sin pagar.`);
});
