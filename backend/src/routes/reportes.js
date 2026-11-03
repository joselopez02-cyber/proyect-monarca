import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { leerRango, consultarVentas } from '../utils/reporteVentas.js';
import { texto, numero, aCsv } from '../utils/csv.js';

const router = Router();

// KAN-42 (HU24): reporte de ventas por película y función en un rango de fechas. Solo ADMIN.
//   GET /api/reportes/ventas?desde=2026-11-01&hasta=2026-11-30
router.get('/ventas', requireAuth, requireRole('ADMIN'), async (req, res) => {
  res.json(await consultarVentas(leerRango(req.query)));
});

// KAN-51 (HU28): el mismo reporte como CSV. Usa la misma consulta que la pantalla, así las filas
// y los totales coinciden siempre. Una fila por función y una fila final TOTAL.
//   GET /api/reportes/ventas/csv?desde=2026-11-01&hasta=2026-11-30
router.get('/ventas/csv', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const rango = leerRango(req.query);
  const rep = await consultarVentas(rango);

  const filas = [['Película', 'Función', 'Fecha función', 'Hora', 'Sala', 'Boletas', 'Ingresos', 'Reembolsos', 'Neto']];
  for (const f of rep.filas) {
    filas.push([
      texto(f.pelicula), f.funcionId, texto(f.fecha), texto(f.horaInicio), texto(f.sala),
      f.boletas, numero(f.ingresos), numero(f.reembolsos), numero(f.neto),
    ]);
  }
  const t = rep.totales;
  filas.push(['TOTAL', '', '', '', '', t.boletas, numero(t.ingresos), numero(t.reembolsos), numero(t.neto)]);

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="ventas_${rango.desde}_${rango.hasta}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.send(aCsv(filas));
});

export default router;
