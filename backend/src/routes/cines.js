import express from 'express';
import * as dbModule from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

// Acepta que db.js exporte el pool directo, { pool } o { query }.
const db = dbModule.pool || dbModule.default?.pool || dbModule.default || dbModule;

const router = express.Router();
router.use(express.json());

// KAN-10: ver es público; crear, editar y eliminar es solo del ADMIN
const soloAdmin = [requireAuth, requireRole('ADMIN')];

const COLS = 'cine_id::int AS "cineId", nombre_del_cine AS "nombreDelCine", cine_cont AS "cineCont"';

function validar(body) {
  const nombre = typeof body?.nombreDelCine === 'string' ? body.nombreDelCine.trim() : '';
  if (!nombre) return { error: 'El nombre del cine es obligatorio.' };
  if (nombre.length > 255) return { error: 'El nombre del cine no puede superar 255 caracteres.' };
  let cont = body.cineCont;
  cont = typeof cont === 'string' && cont.trim() ? cont.trim() : null;
  if (cont && cont.length > 255) return { error: 'El contacto no puede superar 255 caracteres.' };
  return { nombre, cont };
}

function idValido(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id de cine invalido.', 'ID_INVALIDO');
  return id;
}

// Lista de cines (la usa la pantalla Cines & Sucursales)
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${COLS} FROM cine ORDER BY cine_id`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = idValido(req);
    const { rows } = await db.query(`SELECT ${COLS} FROM cine WHERE cine_id = $1`, [id]);
    if (!rows.length) throw new HttpError(404, 'Cine no encontrado con id: ' + id, 'CINE_NO_ENCONTRADO');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// KAN-14: registrar un nuevo cine
router.post('/', ...soloAdmin, async (req, res, next) => {
  try {
    const v = validar(req.body);
    if (v.error) throw new HttpError(400, v.error, 'DATOS_INVALIDOS');
    const { rows } = await db.query(
      `INSERT INTO cine (nombre_del_cine, cine_cont) VALUES ($1, $2) RETURNING ${COLS}`,
      [v.nombre, v.cont]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// KAN-15: editar un cine
router.put('/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const id = idValido(req);
    const v = validar(req.body);
    if (v.error) throw new HttpError(400, v.error, 'DATOS_INVALIDOS');
    const { rows } = await db.query(
      `UPDATE cine SET nombre_del_cine = $1, cine_cont = $2 WHERE cine_id = $3 RETURNING ${COLS}`,
      [v.nombre, v.cont, id]
    );
    if (!rows.length) throw new HttpError(404, 'Cine no encontrado con id: ' + id, 'CINE_NO_ENCONTRADO');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// KAN-15: eliminar un cine
router.delete('/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const id = idValido(req);
    const r = await db.query('DELETE FROM cine WHERE cine_id = $1', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Cine no encontrado con id: ' + id, 'CINE_NO_ENCONTRADO');
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') {
      return next(new HttpError(409, 'No se puede eliminar: el cine tiene datos asociados.', 'CINE_CON_DATOS_ASOCIADOS'));
    }
    next(e);
  }
});

export default router;
