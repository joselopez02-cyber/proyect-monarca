import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { parseId } from '../utils/validators.js';

const router = Router();

const esAdmin = (req) => req.user.rol === 'ADMIN';

// KAN-31 (HU18): historial de transacciones de un cliente (solo lectura).
// Cada fila es un intento de pago hecho en POST /api/pagos/procesar, con su estado, monto y fecha.
// Lo ve el dueño de ese cliente o un ADMIN. Nunca incluye el número de tarjeta, solo los últimos 4 dígitos.
router.get('/cliente/:custId', requireAuth, async (req, res) => {
  const custId = parseId(req.params.custId);

  const { rows: cs } = await pool.query('SELECT cust_id, usuario_id FROM cliente WHERE cust_id = $1', [custId]);
  if (!cs[0]) throw new HttpError(404, `Cliente no encontrado con id: ${custId}`);
  if (!esAdmin(req) && Number(cs[0].usuario_id) !== req.user.usuarioId) {
    throw new HttpError(403, 'No puedes ver las transacciones de otro cliente.');
  }

  const { rows } = await pool.query(
    `SELECT t.trans_no, t.estado_pago, t.pago_total, t.fecha_trans, t.tipo_pago, t.referencia, t.ultimos4, t.res_code,
            r.estado AS estado_reserva, r.sillas_texto,
            p.nombre AS pelicula, sa.nombre AS sala, f.fecha AS fecha_funcion, f.hora_inicio AS hora_funcion
       FROM transaccion t
       LEFT JOIN reserva r ON r.res_code = t.res_code
       LEFT JOIN funcion f ON f.funcion_id = r.funcion_id
       LEFT JOIN pelicula p ON p.movie_id = f.movie_id
       LEFT JOIN sala sa ON sa.sala_id = f.sala_id
      WHERE t.cust_id = $1
      ORDER BY t.fecha_trans DESC, t.trans_no DESC`, [custId]);

  // La más reciente primero. Si la reserva ya no existe, esos campos quedan en null.
  res.json(rows.map((t) => ({
    transNo: Number(t.trans_no),
    estadoPago: t.estado_pago,
    pagoTotal: t.pago_total === null ? null : Number(t.pago_total),
    fechaTrans: t.fecha_trans,
    tipoPago: t.tipo_pago,
    referencia: t.referencia,
    ultimos4: t.ultimos4,
    resCode: t.res_code === null ? null : Number(t.res_code),
    estadoReserva: t.estado_reserva,
    peliculaNombre: t.pelicula,
    salaNombre: t.sala,
    fechaFuncion: t.fecha_funcion,
    horaFuncion: t.hora_funcion,
    sillas: t.sillas_texto ? t.sillas_texto.split(',') : [],
  })));
});

export default router;
