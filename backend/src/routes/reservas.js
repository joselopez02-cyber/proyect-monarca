import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { parseId, texto } from '../utils/validators.js';
import { ZONA } from '../utils/horarios.js';
import { normalizarCodigos, conTransaccion, asegurarSillas, leerSillasBloqueando } from '../utils/sillas.js';

const router = Router();

const esAdmin = (req) => req.user.rol === 'ADMIN';

const SELECT_RESERVA = `
  SELECT r.res_code, r.estado, r.nombre, r.cont_num, r.fecha, r.tiempo, r.total, r.sillas_texto, r.creado_en,
         r.cust_id, r.funcion_id, c.usuario_id AS duenio_id,
         p.nombre AS pelicula, sa.nombre AS sala
    FROM reserva r
    LEFT JOIN cliente c ON c.cust_id = r.cust_id
    LEFT JOIN funcion f ON f.funcion_id = r.funcion_id
    LEFT JOIN pelicula p ON p.movie_id = f.movie_id
    LEFT JOIN sala sa ON sa.sala_id = f.sala_id`;

const aReserva = (r) => ({
  resCode: Number(r.res_code),
  estado: r.estado,
  nombre: r.nombre,
  contNum: r.cont_num,
  fecha: r.fecha,
  tiempo: r.tiempo,
  total: r.total === null ? null : Number(r.total),
  sillas: r.sillas_texto ? r.sillas_texto.split(',') : [],
  custId: r.cust_id === null ? null : Number(r.cust_id),
  funcionId: r.funcion_id === null ? null : Number(r.funcion_id),
  peliculaNombre: r.pelicula,
  salaNombre: r.sala,
  creadoEn: r.creado_en,
});

const idCampo = (valor, campo) => {
  try { return parseId(valor); } catch { throw new HttpError(400, `${campo}: debe ser un número positivo.`); }
};

// Mis reservas (un ADMIN ve todas)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = esAdmin(req)
    ? await pool.query(`${SELECT_RESERVA} ORDER BY r.res_code DESC`)
    : await pool.query(`${SELECT_RESERVA} WHERE c.usuario_id = $1 ORDER BY r.res_code DESC`, [req.user.usuarioId]);
  res.json(rows.map(aReserva));
});

router.get('/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(`${SELECT_RESERVA} WHERE r.res_code = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Reserva no encontrada con id: ${id}`);
  if (!esAdmin(req) && Number(rows[0].duenio_id) !== req.user.usuarioId) {
    throw new HttpError(403, 'Esta reserva es de otro cliente.');
  }
  res.json(aReserva(rows[0]));
});

// KAN-28 (HU15): crear la reserva con las sillas que el cliente bloqueó.
// Cuerpo: { "funcionId": 11, "sillas": ["A1","A2"], "custId": 5 (opcional), "nombre": "...", "contNum": "..." }
// Las sillas deben seguir bloqueadas A TU NOMBRE (sin vencer). Todo ocurre en una sola transacción:
// se crea la reserva (PENDIENTE de pago), las sillas pasan a OCUPADA y se descuentan de la función.
router.post('/', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const funcionId = idCampo(b.funcionId, 'funcionId');
  const codigos = normalizarCodigos(b.sillas, 'sillas');
  const custIdPedido = b.custId === undefined || b.custId === null ? null : idCampo(b.custId, 'custId');
  const nombreIn = texto(b.nombre);
  const contNumIn = texto(b.contNum);
  if (nombreIn && nombreIn.length > 255) throw new HttpError(400, 'nombre: máximo 255 caracteres.');
  if (contNumIn && contNumIn.length > 100) throw new HttpError(400, 'contNum: máximo 100 caracteres.');

  const resCode = await conTransaccion(async (client) => {
    // 1) La función existe y todavía no empieza (hora de Colombia)
    const { rows: fs } = await client.query(
      `SELECT f.fecha, f.hora_inicio, f.precio_boleto,
              ((f.fecha || ' ' || f.hora_inicio)::timestamp < (NOW() AT TIME ZONE $2)) AS ya_empezo
         FROM funcion f WHERE f.funcion_id = $1`, [funcionId, ZONA]);
    if (!fs[0]) throw new HttpError(404, `Función no encontrada con id: ${funcionId}`);
    if (fs[0].ya_empezo) throw new HttpError(409, 'Esta función ya comenzó; no se puede reservar.');

    // 2) El cliente: el indicado (solo si es tuyo, o si eres ADMIN) o, por defecto, el tuyo
    const { rows: cs } = custIdPedido
      ? await client.query('SELECT * FROM cliente WHERE cust_id = $1', [custIdPedido])
      : await client.query('SELECT * FROM cliente WHERE usuario_id = $1', [req.user.usuarioId]);
    if (!cs[0]) {
      throw custIdPedido
        ? new HttpError(404, `Cliente no encontrado con id: ${custIdPedido}`)
        : new HttpError(400, 'Primero registra tus datos de cliente (POST /api/clientes).');
    }
    const cliente = cs[0];
    if (!esAdmin(req) && Number(cliente.usuario_id) !== req.user.usuarioId) {
      throw new HttpError(403, 'No puedes crear reservas a nombre de otro cliente.');
    }

    // 3) Las sillas: se bloquean (FOR UPDATE) y deben estar bloqueadas a tu nombre y vigentes
    await asegurarSillas(client, funcionId);
    const sillas = await leerSillasBloqueando(client, funcionId, codigos);
    const ocupadas = [];
    const deOtro = [];
    const sinBloqueo = [];
    for (const s of sillas) {
      if (s.estado === 'OCUPADA' || (s.estado === 'RESERVADA' && s.reserva_id !== null)) ocupadas.push(s.codigo);
      else if (s.bloqueo_activo && s.bloqueado_por !== req.user.username) deOtro.push(s.codigo);
      else if (!s.bloqueo_activo) sinBloqueo.push(s.codigo);
    }
    if (ocupadas.length || deOtro.length || sinBloqueo.length) {
      const partes = [];
      if (ocupadas.length) partes.push(`ocupada(s): ${ocupadas.join(', ')}`);
      if (deOtro.length) partes.push(`bloqueada(s) por otro cliente: ${deOtro.join(', ')}`);
      if (sinBloqueo.length) partes.push(`sin bloqueo vigente a tu nombre (bloquéalas de nuevo): ${sinBloqueo.join(', ')}`);
      throw new HttpError(409, `No se pudo crear la reserva, ${partes.join('; ')}. No se reservó ninguna silla.`);
    }

    // 4) Crear la reserva y marcar las sillas como ocupadas
    const total = Math.round((Number(fs[0].precio_boleto) || 0) * codigos.length * 100) / 100;
    const { rows: rs } = await client.query(
      `INSERT INTO reserva (nombre, tiempo, fecha, cont_num, estado, funcion_id, cust_id, total, sillas_texto)
       VALUES ($1, $2, $3, $4, 'PENDIENTE', $5, $6, $7, $8) RETURNING res_code`,
      [nombreIn ?? cliente.nombre_cliente, fs[0].hora_inicio, fs[0].fecha, contNumIn ?? cliente.numero_cliente,
       funcionId, cliente.cust_id, total, codigos.map((c) => c.codigo).join(',')]);
    const nuevo = rs[0].res_code;

    await client.query(
      `UPDATE silla SET estado = 'OCUPADA', reserva_id = $1, bloqueado_por = NULL, bloqueado_en = NULL
        WHERE silla_id = ANY($2::bigint[])`, [nuevo, sillas.map((s) => s.silla_id)]);
    await client.query(
      'UPDATE funcion SET asientos_disponibles = GREATEST(asientos_disponibles - $1, 0) WHERE funcion_id = $2',
      [codigos.length, funcionId]);
    return nuevo;
  });

  const { rows } = await pool.query(`${SELECT_RESERVA} WHERE r.res_code = $1`, [resCode]);
  res.status(201).json(aReserva(rows[0]));
});

export default router;
