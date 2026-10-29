import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// KAN-50 (HU27): ocupación y reservas de las funciones de la sucursal del gestor.
// La sucursal sale del gestor autenticado (tabla gestor), nunca de un parámetro del cliente:
// así un gestor no puede ver datos de otras sucursales.
//   vendidas    = sillas de reservas CONFIRMADA
//   disponibles = asientos_disponibles de la función (los que de verdad se pueden reservar)
//   ocupación % = vendidas / capacidad_total
router.get('/', requireAuth, requireRole('GESTOR'), async (req, res) => {
  const { rows: gs } = await pool.query(
    `SELECT g.sucursal_id, s.bran_location
       FROM gestor g LEFT JOIN sucursal s ON s.bran_id = g.sucursal_id
      WHERE g.usuario_id = $1`, [req.user.usuarioId]);
  if (!gs[0] || gs[0].sucursal_id === null) {
    throw new HttpError(403, 'No tienes una sucursal asignada. Pide al administrador que te asigne una.');
  }
  const sucursalId = Number(gs[0].sucursal_id);

  const { rows } = await pool.query(
    `SELECT f.funcion_id, f.fecha, f.hora_inicio, f.capacidad_total, f.asientos_disponibles,
            p.nombre AS pelicula, sa.nombre AS sala,
            COALESCE(v.reservas, 0) AS reservas, COALESCE(v.sillas, 0) AS vendidas
       FROM funcion f
       JOIN pelicula p ON p.movie_id = f.movie_id
       JOIN sala sa ON sa.sala_id = f.sala_id
       LEFT JOIN (
         SELECT r.funcion_id, COUNT(DISTINCT r.res_code) AS reservas, COUNT(s.silla_id) AS sillas
           FROM reserva r
           JOIN silla s ON s.reserva_id = r.res_code
          WHERE r.estado = 'CONFIRMADA'
          GROUP BY r.funcion_id
       ) v ON v.funcion_id = f.funcion_id
      WHERE sa.sucursal_id = $1
      ORDER BY f.fecha, f.hora_inicio, f.funcion_id`, [sucursalId]);

  res.json({
    sucursalId,
    sucursal: gs[0].bran_location,
    funciones: rows.map((r) => {
      const capacidad = Number(r.capacidad_total);
      const vendidas = Number(r.vendidas);
      return {
        funcionId: Number(r.funcion_id),
        pelicula: r.pelicula,
        sala: r.sala,
        fecha: r.fecha,
        horaInicio: r.hora_inicio,
        capacidadTotal: capacidad,
        reservas: Number(r.reservas),
        vendidas,
        disponibles: Number(r.asientos_disponibles),
        ocupacionPct: capacidad > 0 ? Math.round((vendidas / capacidad) * 1000) / 10 : 0,
      };
    }),
  });
});

export default router;
