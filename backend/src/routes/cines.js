import express from 'express';
import * as dbModule from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { validar, texto, PARAM_ID } from '../middleware/validar.js';

// Acepta que db.js exporte el pool directo, { pool } o { query }.
const db = dbModule.pool || dbModule.default?.pool || dbModule.default || dbModule;

const router = express.Router();
router.use(express.json());

// KAN-10: ver es público; crear, editar y eliminar es solo del ADMIN
const soloAdmin = [requireAuth, requireRole('ADMIN')];

// Esquema del cuerpo (KAN-57)
const CINE = { nombreDelCine: texto({ requerido: true, max: 255 }), cineCont: texto({ max: 255 }) };

const COLS = 'cine_id::int AS "cineId", nombre_del_cine AS "nombreDelCine", cine_cont AS "cineCont"';

// Lista de cines (la usa la pantalla Cines & Sucursales)
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${COLS} FROM cine ORDER BY cine_id`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const { rows } = await db.query(`SELECT ${COLS} FROM cine WHERE cine_id = $1`, [id]);
    if (!rows.length) throw new HttpError(404, 'Cine no encontrado con id: ' + id, 'CINE_NO_ENCONTRADO');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// KAN-14: registrar un nuevo cine
router.post('/', ...soloAdmin, validar({ body: CINE }), async (req, res, next) => {
  try {
    const v = req.datos.body;
    const { rows } = await db.query(
      `INSERT INTO cine (nombre_del_cine, cine_cont) VALUES ($1, $2) RETURNING ${COLS}`,
      [v.nombreDelCine, v.cineCont]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// KAN-15: editar un cine
router.put('/:id', ...soloAdmin, validar({ ...PARAM_ID, body: CINE }), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const v = req.datos.body;
    const { rows } = await db.query(
      `UPDATE cine SET nombre_del_cine = $1, cine_cont = $2 WHERE cine_id = $3 RETURNING ${COLS}`,
      [v.nombreDelCine, v.cineCont, id]
    );
    if (!rows.length) throw new HttpError(404, 'Cine no encontrado con id: ' + id, 'CINE_NO_ENCONTRADO');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// KAN-15: eliminar un cine
router.delete('/:id', ...soloAdmin, validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
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
