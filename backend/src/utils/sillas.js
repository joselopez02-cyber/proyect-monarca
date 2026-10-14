import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';

// Cuánto dura el bloqueo de una silla mientras el cliente decide (5 minutos).
// Para probar la expiración sin esperar: SILLAS_TTL_SEG=10 npm run dev
export const TTL_SEG = Number(process.env.SILLAS_TTL_SEG) > 0 ? Number(process.env.SILLAS_TTL_SEG) : 300;
export const MAX_SILLAS_POR_BLOQUEO = 10;

export const textoTtl = () =>
  TTL_SEG >= 60 ? `${Math.round(TTL_SEG / 60)} minuto(s)` : `${TTL_SEG} segundos`;

// ["a1", "A2"] -> [{ codigo: "A1", fila: "A", numero: 1 }, ...] (valida formato, quita repetidas)
export function normalizarCodigos(valor) {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new HttpError(400, 'codigos: indica al menos una silla, por ejemplo ["A1","A2"].');
  }
  if (valor.length > MAX_SILLAS_POR_BLOQUEO) {
    throw new HttpError(400, `codigos: máximo ${MAX_SILLAS_POR_BLOQUEO} sillas por solicitud.`);
  }
  const vistos = new Map();
  for (const c of valor) {
    const m = typeof c === 'string' ? /^([A-Za-z])(\d{1,2})$/.exec(c.trim()) : null;
    if (!m || Number(m[2]) < 1) {
      throw new HttpError(400, `codigos: "${String(c).slice(0, 20)}" no es un código de silla válido (ejemplo: A1).`);
    }
    const fila = m[1].toUpperCase();
    const numero = Number(m[2]);
    vistos.set(`${fila}${numero}`, { codigo: `${fila}${numero}`, fila, numero });
  }
  return [...vistos.values()];
}

// Ejecuta fn(client) dentro de una transacción (COMMIT si sale bien, ROLLBACK si lanza error)
export async function conTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Las sillas de una función se crean la primera vez que se necesitan, a partir de filas x columnas
// de su sala (A1, A2 ... B1 ...). Si ya existen no hace nada, y es seguro con peticiones simultáneas.
export async function asegurarSillas(client, funcionId) {
  const { rowCount } = await client.query('SELECT 1 FROM funcion WHERE funcion_id = $1', [funcionId]);
  if (!rowCount) throw new HttpError(404, `Función no encontrada con id: ${funcionId}`);
  await client.query(
    `INSERT INTO silla (funcion_id, fila, numero)
     SELECT f.funcion_id, chr(64 + r), c
       FROM funcion f
       JOIN sala s ON s.sala_id = f.sala_id,
            generate_series(1, LEAST(COALESCE(s.filas, 0), 26)) AS r,
            generate_series(1, COALESCE(s.columnas, 0)) AS c
      WHERE f.funcion_id = $1
     ON CONFLICT (funcion_id, fila, numero) DO NOTHING`,
    [funcionId]);
}

// Trae y BLOQUEA (FOR UPDATE) las sillas pedidas. Dos clientes que pidan la misma silla a la vez
// se turnan: el segundo espera al primero y ya la ve bloqueada. Siempre en el mismo orden (sin interbloqueos).
// Un bloqueo cuenta como activo solo si no ha vencido el TTL.
export async function leerSillasBloqueando(client, funcionId, codigos) {
  const { rows } = await client.query(
    `SELECT silla_id, fila, numero, estado, reserva_id, bloqueado_por,
            (fila || numero::text) AS codigo,
            (estado = 'RESERVADA' AND reserva_id IS NULL AND bloqueado_en IS NOT NULL
             AND bloqueado_en >= LOCALTIMESTAMP - make_interval(secs => $3::float8)) AS bloqueo_activo
       FROM silla
      WHERE funcion_id = $1 AND (fila || numero::text) = ANY($2::text[])
      ORDER BY fila, numero
        FOR UPDATE`,
    [funcionId, codigos.map((c) => c.codigo), TTL_SEG]);

  const porCodigo = new Map(rows.map((r) => [r.codigo, r]));
  const faltan = codigos.filter((c) => !porCodigo.has(c.codigo)).map((c) => c.codigo);
  if (faltan.length) {
    throw new HttpError(404, `La(s) silla(s) ${faltan.join(', ')} no existe(n) en esta función.`);
  }
  return rows;
}
