import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { leerRango, consultarVentas } from '../utils/reporteVentas.js';

const router = Router();

// KAN-42 (HU24): reporte de ventas por película y función en un rango de fechas. Solo ADMIN.
//   GET /api/reportes/ventas?desde=2026-11-01&hasta=2026-11-30
router.get('/ventas', requireAuth, requireRole('ADMIN'), async (req, res) => {
  res.json(await consultarVentas(leerRango(req.query)));
});

export default router;
