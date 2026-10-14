import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { parseId } from '../utils/validators.js';
import {
  TTL_SEG, textoTtl, normalizarCodigos, conTransaccion, asegurarSillas, leerSillasBloqueando, estadoVisible,
} from '../utils/sillas.js';

const router = Router();

function leerPeticion(body = {}) {
  let funcionId;
  try { funcionId = parseId(body.funcionId); } catch { throw new HttpError(400, 'funcionId: debe ser un número positivo.'); }
  return { funcionId, codigos: normalizarCodigos(body.codigos) };
}

// KAN-26 (HU13): mapa de sillas de una función, con el estado de cada una.
// Es público (como la cartelera) y no revela quién bloqueó cada silla.
router.get('/funcion/:funcionId', async (req, res) => {
  const funcionId = parseId(req.params.funcionId);

  // Si es la primera vez que se consulta la función, sus sillas se crean aquí
  await conTransaccion((client) => asegurarSillas(client, funcionId));

  const { rows: info } = await pool.query(
    `SELECT s.sala_id, s.nombre, s.tipo, s.filas, s.columnas
       FROM funcion f JOIN sala s ON s.sala_id = f.sala_id WHERE f.funcion_id = $1`, [funcionId]);
  const { rows } = await pool.query(
    `SELECT silla_id, fila, numero, estado, reserva_id,
            (estado = 'RESERVADA' AND reserva_id IS NULL AND bloqueado_en IS NOT NULL
             AND bloqueado_en >= LOCALTIMESTAMP - make_interval(secs => $2::float8)) AS bloqueo_activo
       FROM silla WHERE funcion_id = $1 ORDER BY fila, numero`,
    [funcionId, TTL_SEG]);

  const sillas = rows.map((r) => ({
    sillaId: Number(r.silla_id),
    fila: r.fila,
    numero: r.numero,
    codigo: `${r.fila}${r.numero}`,
    estado: estadoVisible(r),
  }));
  const cuenta = (e) => sillas.filter((s) => s.estado === e).length;

  res.json({
    funcionId,
    sala: info[0] && {
      salaId: Number(info[0].sala_id), nombre: info[0].nombre, tipo: info[0].tipo,
      filas: info[0].filas, columnas: info[0].columnas,
    },
    ttlSegundos: TTL_SEG,
    resumen: { total: sillas.length, disponibles: cuenta('DISPONIBLE'), bloqueadas: cuenta('BLOQUEADA'), ocupadas: cuenta('OCUPADA') },
    sillas,
  });
});

// KAN-11 / KAN-27: bloquear sillas por un tiempo (TTL) mientras el cliente completa su compra.
// Cuerpo: { "funcionId": 11, "codigos": ["A1", "A2"] }. Todo o nada.
// Si otro cliente ya la bloqueó (o está ocupada) responde 409. Si el cliente no confirma,
// el bloqueo vence solo a los TTL_SEG segundos (o se libera antes con DELETE /api/sillas/liberar).
router.post('/bloquear', requireAuth, async (req, res) => {
  const { funcionId, codigos } = leerPeticion(req.body);
  const cliente = req.user.username;

  await conTransaccion(async (client) => {
    await asegurarSillas(client, funcionId);
    const sillas = await leerSillasBloqueando(client, funcionId, codigos);

    const ocupadas = sillas.filter((s) => s.estado === 'OCUPADA').map((s) => s.codigo);
    const deOtro = sillas.filter((s) => s.estado !== 'OCUPADA' && s.bloqueo_activo && s.bloqueado_por !== cliente)
      .map((s) => s.codigo);
    if (ocupadas.length || deOtro.length) {
      const partes = [];
      if (ocupadas.length) partes.push(`ocupada(s): ${ocupadas.join(', ')}`);
      if (deOtro.length) partes.push(`bloqueada(s) por otro cliente: ${deOtro.join(', ')}`);
      throw new HttpError(409, `No se pudo bloquear, ${partes.join('; ')}. No se bloqueó ninguna silla.`);
    }

    // Disponibles, vencidas o ya bloqueadas por ti (en ese caso se renueva el tiempo)
    await client.query(
      `UPDATE silla SET estado = 'RESERVADA', bloqueado_por = $2, bloqueado_en = LOCALTIMESTAMP
        WHERE silla_id = ANY($1::bigint[])`,
      [sillas.map((s) => s.silla_id), cliente]);
  });

  const lista = codigos.map((c) => c.codigo);
  res.json({
    funcionId,
    sillasBloqueadas: lista,
    sillasBlockeadas: lista, // mismo dato con el nombre que usaba el backend anterior, por compatibilidad
    ttlSegundos: TTL_SEG,
    mensaje: `Sillas bloqueadas por ${textoTtl()}. Completa la reserva antes de que expire el tiempo.`,
  });
});

// Liberar antes de que venza el TTL. Solo libera sillas bloqueadas por el cliente que llama.
// Cuerpo: { "funcionId": 11, "codigos": ["A1", "A2"] }
router.delete('/liberar', requireAuth, async (req, res) => {
  const { funcionId, codigos } = leerPeticion(req.body);
  const cliente = req.user.username;

  await conTransaccion(async (client) => {
    await asegurarSillas(client, funcionId);
    const sillas = await leerSillasBloqueando(client, funcionId, codigos);

    const ocupadas = sillas.filter((s) => s.estado === 'OCUPADA').map((s) => s.codigo);
    if (ocupadas.length) {
      throw new HttpError(409, `La(s) silla(s) ${ocupadas.join(', ')} ya está(n) ocupada(s) y no se puede(n) liberar.`);
    }
    const deOtro = sillas.filter((s) => s.bloqueo_activo && s.bloqueado_por !== cliente).map((s) => s.codigo);
    if (deOtro.length) {
      throw new HttpError(403, `La(s) silla(s) ${deOtro.join(', ')} está(n) bloqueada(s) por otro cliente.`);
    }

    // Las que estaban disponibles o vencidas ya están libres: no hay nada que hacer con ellas
    const mias = sillas.filter((s) => s.estado === 'RESERVADA' && s.reserva_id === null).map((s) => s.silla_id);
    if (mias.length) {
      await client.query(
        `UPDATE silla SET estado = 'DISPONIBLE', bloqueado_por = NULL, bloqueado_en = NULL
          WHERE silla_id = ANY($1::bigint[])`, [mias]);
    }
  });

  res.json({ mensaje: 'Sillas liberadas correctamente.', funcionId, codigos: codigos.map((c) => c.codigo) });
});

export default router;
