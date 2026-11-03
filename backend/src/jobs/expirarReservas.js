import pool from '../db.js';
import { conTransaccion } from '../utils/sillas.js';

// KAN-38 (HU21): cancelar las reservas PENDIENTES que superaron el tiempo límite de pago.
// Tiempo límite (minutos) y cada cuánto se revisa (segundos); se pueden cambiar por variables de entorno.
export const RESERVA_TTL_MIN = Number(process.env.RESERVA_TTL_MIN) > 0 ? Number(process.env.RESERVA_TTL_MIN) : 15;
const INTERVALO_SEG = Number(process.env.LIMPIEZA_INTERVALO_SEG) > 0 ? Number(process.env.LIMPIEZA_INTERVALO_SEG) : 60;

// Todo en una transacción: la reserva pasa a CANCELADA, sus sillas a DISPONIBLE y la función
// recupera los asientos. SKIP LOCKED evita pisar una reserva que se esté pagando o cancelando.
export async function expirarReservasPendientes() {
  return conTransaccion(async (client) => {
    const { rows: vencidas } = await client.query(
      `SELECT res_code FROM reserva
        WHERE estado = 'PENDIENTE'
          AND creado_en < CURRENT_TIMESTAMP - make_interval(secs => $1::double precision)
          FOR UPDATE SKIP LOCKED`, [RESERVA_TTL_MIN * 60]);
    if (vencidas.length === 0) return 0;
    const ids = vencidas.map((r) => r.res_code);

    const { rows: liberadas } = await client.query(
      `UPDATE silla SET estado = 'DISPONIBLE', reserva_id = NULL, bloqueado_por = NULL, bloqueado_en = NULL
        WHERE reserva_id = ANY($1::bigint[]) RETURNING funcion_id`, [ids]);

    const porFuncion = new Map();
    for (const s of liberadas) porFuncion.set(s.funcion_id, (porFuncion.get(s.funcion_id) ?? 0) + 1);
    for (const [funcionId, n] of porFuncion) {
      await client.query(
        'UPDATE funcion SET asientos_disponibles = LEAST(asientos_disponibles + $1, capacidad_total) WHERE funcion_id = $2',
        [n, funcionId]);
    }

    await client.query("UPDATE reserva SET estado = 'CANCELADA' WHERE res_code = ANY($1::bigint[])", [ids]);
    return ids.length;
  });
}

let corriendo = false;

// Limpieza periódica: una vez al arrancar (útil si Render durmió el servicio) y luego cada INTERVALO_SEG.
export function iniciarLimpiezaReservas() {
  const ejecutar = async () => {
    if (corriendo) return; // no se solapan dos pasadas
    corriendo = true;
    try {
      const n = await expirarReservasPendientes();
      if (n > 0) console.log(`[HU21] ${n} reserva(s) pendiente(s) vencida(s) cancelada(s); sillas liberadas.`);
    } catch (err) {
      console.error('[HU21] Error al expirar reservas:', err.message);
    } finally {
      corriendo = false;
    }
  };
  ejecutar();
  return setInterval(ejecutar, INTERVALO_SEG * 1000).unref();
}
