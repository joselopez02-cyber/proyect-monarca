import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { parseId } from '../utils/validators.js';
import { conTransaccion } from '../utils/sillas.js';
import { TIPOS_PAGO, esTarjeta, procesarPago } from '../utils/pagoService.js';

const router = Router();

const esAdmin = (req) => req.user.rol === 'ADMIN';

// KAN-30 (HU17): pagar una reserva PENDIENTE.
// Cuerpo: { "resCode": 7, "tipoPago": "TARJETA_CREDITO", "numeroTarjeta": "4111111111111234" }
//   tipoPago: TARJETA_CREDITO | TARJETA_DEBITO | NEQUI | PSE  (numeroTarjeta solo para tarjetas)
// El monto lo toma el servidor de la reserva (nunca del cliente). En UNA transacción:
// simula la pasarela, registra la transacción (APROBADO/RECHAZADO) y, si se aprobó, confirma la reserva.
// Si se rechaza, la reserva sigue PENDIENTE y se puede reintentar o cancelar.
router.post('/procesar', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  let resCode;
  try { resCode = parseId(b.resCode); } catch { throw new HttpError(400, 'resCode: debe ser un número positivo.'); }

  const tipoPago = typeof b.tipoPago === 'string' ? b.tipoPago.trim().toUpperCase() : '';
  if (!TIPOS_PAGO.includes(tipoPago)) {
    throw new HttpError(400, `tipoPago: debe ser uno de ${TIPOS_PAGO.join(', ')}.`);
  }

  let ultimos4 = null;
  if (esTarjeta(tipoPago)) {
    const num = String(b.numeroTarjeta ?? '').replace(/[\s-]/g, '');
    if (!/^\d{13,19}$/.test(num)) throw new HttpError(400, 'numeroTarjeta: debe tener entre 13 y 19 dígitos.');
    ultimos4 = num.slice(-4); // el número completo NUNCA se guarda
  }

  const resultado = await conTransaccion(async (client) => {
    const { rows } = await client.query(
      `SELECT r.res_code, r.estado, r.total, r.cust_id, c.usuario_id AS duenio_id
         FROM reserva r LEFT JOIN cliente c ON c.cust_id = r.cust_id
        WHERE r.res_code = $1 FOR UPDATE OF r`, [resCode]);
    const r = rows[0];
    if (!r) throw new HttpError(404, `Reserva no encontrada con id: ${resCode}`);
    if (!esAdmin(req) && Number(r.duenio_id) !== req.user.usuarioId) {
      throw new HttpError(403, 'Esta reserva es de otro cliente.');
    }
    if (r.estado === 'CONFIRMADA') throw new HttpError(409, 'Esta reserva ya está pagada.');
    if (r.estado === 'CANCELADA') throw new HttpError(409, 'Esta reserva está cancelada: no se puede pagar.');
    const total = Number(r.total);
    if (!(total > 0)) throw new HttpError(409, 'Esta reserva no tiene un total por pagar.');

    const inicio = new Date().toISOString();
    const pago = procesarPago({ tipoPago, ultimos4, total });
    const final = new Date().toISOString();

    const { rows: t } = await client.query(
      `INSERT INTO transaccion (tipo_pago, pago_total, estado_pago, referencia, ultimos4, fecha_inicio, fecha_final, cust_id, res_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING trans_no, fecha_trans`,
      [tipoPago, total, pago.aprobado ? 'APROBADO' : 'RECHAZADO', pago.referencia, ultimos4, inicio, final, r.cust_id, resCode]);

    if (pago.aprobado) {
      await client.query("UPDATE reserva SET estado = 'CONFIRMADA' WHERE res_code = $1", [resCode]);
    }
    return {
      transNo: Number(t[0].trans_no),
      resCode,
      custId: r.cust_id === null ? null : Number(r.cust_id),
      tipoPago,
      pagoTotal: total,
      estadoPago: pago.aprobado ? 'APROBADO' : 'RECHAZADO',
      referencia: pago.referencia,
      ultimos4,
      mensaje: pago.mensaje,
      estadoReserva: pago.aprobado ? 'CONFIRMADA' : 'PENDIENTE',
      fechaTrans: t[0].fecha_trans,
    };
  });

  res.status(201).json(resultado);
});

export default router;
