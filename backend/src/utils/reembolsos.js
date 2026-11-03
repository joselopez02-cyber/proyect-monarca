// KAN-40 (HU22): reembolso simulado al cancelar una reserva ya pagada.
// Se llama DENTRO de la transacción de la cancelación (recibe el client) para que todo sea atómico.
// Busca el pago APROBADO de la reserva y registra una transacción de tipo REEMBOLSO por el mismo monto,
// con el mismo método de pago. Si la reserva nunca tuvo un pago aprobado, no hay nada que devolver (null).
export async function registrarReembolso(client, { resCode, custId }) {
  const { rows } = await client.query(
    `SELECT trans_no, tipo_pago, pago_total, ultimos4
       FROM transaccion
      WHERE res_code = $1 AND tipo_trans = 'PAGO' AND estado_pago = 'APROBADO'
      ORDER BY trans_no DESC LIMIT 1`, [resCode]);
  const pago = rows[0];
  if (!pago || !(Number(pago.pago_total) > 0)) return null;

  const ahora = new Date().toISOString();
  const referencia = 'REF-' + Date.now() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const { rows: t } = await client.query(
    `INSERT INTO transaccion (tipo_trans, tipo_pago, pago_total, estado_pago, referencia, ultimos4, fecha_inicio, fecha_final, cust_id, res_code)
     VALUES ('REEMBOLSO', $1, $2, 'APROBADO', $3, $4, $5, $5, $6, $7)
     RETURNING trans_no, fecha_trans`,
    [pago.tipo_pago, pago.pago_total, referencia, pago.ultimos4, ahora, custId, resCode]);

  return {
    transNo: Number(t[0].trans_no),
    resCode: Number(resCode),
    monto: Number(pago.pago_total),
    tipoPago: pago.tipo_pago,
    referencia,
    fechaTrans: t[0].fecha_trans,
  };
}
