import express from 'express';
import * as dbModule from '../db.js';

// Acepta que db.js exporte el pool directo, { pool } o { query }.
const db = dbModule.pool || dbModule.default?.pool || dbModule.default || dbModule;

const router = express.Router();
router.use(express.json());

// Misma forma que el frontend espera: branId, branLocation, cine {..}, salas [..]
const SELECT_SUCURSAL = `
  SELECT s.bran_id::int AS "branId",
         s.bran_location AS "branLocation",
         CASE WHEN c.cine_id IS NULL THEN NULL
              ELSE json_build_object('cineId', c.cine_id::int,
                                     'nombreDelCine', c.nombre_del_cine,
                                     'cineCont', c.cine_cont) END AS cine,
         COALESCE((SELECT json_agg(json_build_object('salaId', sa.sala_id::int, 'nombre', sa.nombre)
                                   ORDER BY sa.sala_id)
                   FROM sala sa WHERE sa.sucursal_id = s.bran_id), '[]'::json) AS salas
  FROM sucursal s
  LEFT JOIN cine c ON c.cine_id = s.cine_id`;

function idValido(valor, nombre, res) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: nombre + ' invalido.' });
    return null;
  }
  return id;
}

// El cine puede llegar como { cine: { cineId } }, { cineId } o ?cineId=
function leerCineId(req) {
  return req.body?.cine?.cineId ?? req.body?.cineId ?? req.query?.cineId;
}

function leerUbicacion(body) {
  const u = typeof body?.branLocation === 'string' ? body.branLocation.trim() : '';
  if (!u) return { error: 'La ubicacion de la sucursal es obligatoria.' };
  if (u.length > 255) return { error: 'La ubicacion no puede superar 255 caracteres.' };
  return { ubicacion: u };
}

async function existeCine(cineId) {
  const r = await db.query('SELECT 1 FROM cine WHERE cine_id = $1', [cineId]);
  return r.rowCount > 0;
}

async function obtenerSucursal(id) {
  const { rows } = await db.query(`${SELECT_SUCURSAL} WHERE s.bran_id = $1`, [id]);
  return rows[0];
}

// Lista de todas las sucursales
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`${SELECT_SUCURSAL} ORDER BY s.bran_id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Sucursales de un cine
router.get('/cine/:cineId', async (req, res, next) => {
  try {
    const cineId = idValido(req.params.cineId, 'Id de cine', res); if (cineId === null) return;
    const { rows } = await db.query(`${SELECT_SUCURSAL} WHERE s.cine_id = $1 ORDER BY s.bran_id`, [cineId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sucursal', res); if (id === null) return;
    const s = await obtenerSucursal(id);
    if (!s) return res.status(404).json({ error: 'Sucursal no encontrada con id: ' + id });
    res.json(s);
  } catch (e) { next(e); }
});

// KAN-16: registrar una sucursal asociada a un cine existente
router.post('/', async (req, res, next) => {
  try {
    const u = leerUbicacion(req.body);
    if (u.error) return res.status(400).json({ error: u.error });
    const rawCine = leerCineId(req);
    if (rawCine === undefined || rawCine === null || rawCine === '') {
      return res.status(400).json({ error: 'Debes indicar el cine de la sucursal.' });
    }
    const cineId = idValido(rawCine, 'Id de cine', res); if (cineId === null) return;
    if (!(await existeCine(cineId))) {
      return res.status(404).json({ error: 'Cine no encontrado con id: ' + cineId });
    }
    const ins = await db.query(
      'INSERT INTO sucursal (bran_location, cine_id) VALUES ($1, $2) RETURNING bran_id',
      [u.ubicacion, cineId]
    );
    res.status(201).json(await obtenerSucursal(ins.rows[0].bran_id));
  } catch (e) { next(e); }
});

// Editar una sucursal (ubicacion y, si se envia, el cine)
router.put('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sucursal', res); if (id === null) return;
    const u = leerUbicacion(req.body);
    if (u.error) return res.status(400).json({ error: u.error });
    const rawCine = leerCineId(req);
    let cineId = null;
    if (rawCine !== undefined && rawCine !== null && rawCine !== '') {
      cineId = idValido(rawCine, 'Id de cine', res); if (cineId === null) return;
      if (!(await existeCine(cineId))) {
        return res.status(404).json({ error: 'Cine no encontrado con id: ' + cineId });
      }
    }
    const r = await db.query(
      'UPDATE sucursal SET bran_location = $1, cine_id = COALESCE($2, cine_id) WHERE bran_id = $3',
      [u.ubicacion, cineId, id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Sucursal no encontrada con id: ' + id });
    res.json(await obtenerSucursal(id));
  } catch (e) { next(e); }
});

// Eliminar una sucursal
router.delete('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sucursal', res); if (id === null) return;
    const r = await db.query('DELETE FROM sucursal WHERE bran_id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Sucursal no encontrada con id: ' + id });
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar: la sucursal tiene datos asociados.' });
    }
    next(e);
  }
});

export default router;
