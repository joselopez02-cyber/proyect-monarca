import { Router } from 'express';
import pool from '../db.js';
import { paginar, queryPaginacion } from '../utils/paginacion.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validar, idPositivo } from '../middleware/validar.js';

const router = Router();

const esAdmin = (req) => req.user.rol === 'ADMIN';

const ORD_TRANS = { id: 't.trans_no', fecha: 't.fecha_trans', monto: 't.pago_total', estado: 't.estado_pago' };
const ORDEN_TRANS = 't.fecha_trans DESC, t.trans_no DESC';

router.get('/', requireAuth, validar({ query: queryPaginacion(ORD_TRANS) }), async (req, res) => {
  const filtroPropietario = esAdmin(req) ? '' : 'WHERE c.usuario_id = $1';
  const parametros = esAdmin(req) ? [] : [req.user.usuarioId];
  const pagina = await paginar(pool, {
    select: `SELECT t.trans_no, t.tipo_trans, t.estado_pago, t.pago_total, t.fecha_trans, t.tipo_pago,
            t.referencia, t.ultimos4, t.res_code, t.cust_id,
            r.estado AS estado_reserva, r.sillas_texto,
            p.nombre AS pelicula, sa.nombre AS sala, f.fecha AS fecha_funcion, f.hora_inicio AS hora_funcion
       FROM transaccion t
       LEFT JOIN cliente c ON c.cust_id = t.cust_id
       LEFT JOIN reserva r ON r.res_code = t.res_code
       LEFT JOIN funcion f ON f.funcion_id = r.funcion_id
       LEFT JOIN pelicula p ON p.movie_id = f.movie_id
       LEFT JOIN sala sa ON sa.sala_id = f.sala_id
       ${filtroPropietario}`,
    params: parametros, ordenables: ORD_TRANS, ordenDefecto: ORDEN_TRANS, query: req.datos.query,
    mapear: (t) => ({
    transNo: Number(t.trans_no),
    tipoTransaccion: t.tipo_trans, // PAGO | REEMBOLSO (KAN-40)
    estadoPago: t.estado_pago,
    pagoTotal: t.pago_total === null ? null : Number(t.pago_total),
    fechaTrans: t.fecha_trans,
    tipoPago: t.tipo_pago,
    referencia: t.referencia,
    ultimos4: t.ultimos4,
    resCode: t.res_code === null ? null : Number(t.res_code),
    custId: t.cust_id === null ? null : Number(t.cust_id),
    estadoReserva: t.estado_reserva,
    peliculaNombre: t.pelicula,
    salaNombre: t.sala,
    fechaFuncion: t.fecha_funcion,
    horaFuncion: t.hora_funcion,
    sillas: t.sillas_texto ? t.sillas_texto.split(',') : [],
    }),
  });
  res.json(pagina);
});

// KAN-31 (HU18): historial de transacciones de un cliente (solo lectura).
// Cada fila es un intento de pago hecho en POST /api/pagos/procesar, con su estado, monto y fecha.
// Lo ve el dueño de ese cliente o un ADMIN. Nunca incluye el número de tarjeta, solo los últimos 4 dígitos.
router.get('/cliente/:custId', requireAuth, validar({ params: { custId: idPositivo({ requerido: true }) }, query: queryPaginacion(ORD_TRANS) }), async (req, res) => {
  const { custId } = req.datos.params;

  const { rows: cs } = await pool.query('SELECT cust_id, usuario_id FROM cliente WHERE cust_id = $1', [custId]);
  if (!cs[0]) throw new HttpError(404, `Cliente no encontrado con id: ${custId}`, 'CLIENTE_NO_ENCONTRADO');
  if (!esAdmin(req) && Number(cs[0].usuario_id) !== req.user.usuarioId) {
    throw new HttpError(403, 'No puedes ver las transacciones de otro cliente.', 'CLIENTE_AJENO');
  }

  const pagina = await paginar(pool, {
    select: `SELECT t.trans_no, t.tipo_trans, t.estado_pago, t.pago_total, t.fecha_trans, t.tipo_pago, t.referencia, t.ultimos4, t.res_code,
            r.estado AS estado_reserva, r.sillas_texto,
            p.nombre AS pelicula, sa.nombre AS sala, f.fecha AS fecha_funcion, f.hora_inicio AS hora_funcion
       FROM transaccion t
       LEFT JOIN reserva r ON r.res_code = t.res_code
       LEFT JOIN funcion f ON f.funcion_id = r.funcion_id
       LEFT JOIN pelicula p ON p.movie_id = f.movie_id
       LEFT JOIN sala sa ON sa.sala_id = f.sala_id
      WHERE t.cust_id = $1`,
    params: [custId], ordenables: ORD_TRANS, ordenDefecto: ORDEN_TRANS, query: req.datos.query,
    // La más reciente primero. Si la reserva ya no existe, esos campos quedan en null.
    mapear: (t) => ({
    transNo: Number(t.trans_no),
    tipoTransaccion: t.tipo_trans, // PAGO | REEMBOLSO (KAN-40)
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
    }),
  });
  res.json(pagina);
});

export default router;
