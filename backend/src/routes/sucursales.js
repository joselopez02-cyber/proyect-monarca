import express from 'express';
import * as dbModule from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { validar, texto, idPositivo, PARAM_ID } from '../middleware/validar.js';

// Acepta que db.js exporte el pool directo, { pool } o { query }.
const db = dbModule.pool || dbModule.default?.pool || dbModule.default || dbModule;

const router = express.Router();
router.use(express.json());

// KAN-10: ver es público; crear, editar y eliminar es solo del ADMIN
const soloAdmin = [requireAuth, requireRole('ADMIN')];

// Misma forma que el frontend espera: branId, branLocation, cine {..}, salas [..]
// Esquemas del cuerpo (KAN-57). El cine puede venir como { cine: { cineId } }, como cineId en el cuerpo
// o como ?cineId= en la URL (formatos del backend anterior).
const UBICACION = { branLocation: texto({ requerido: true, max: 255 }) };
const CINE_OPCIONAL = { cineId: idPositivo({ alias: ['cine.cineId'] }) };
const cineDelCuerpoOUrl = (d) => { d.body.cineId = d.body.cineId ?? d.query.cineId ?? null; };
const CREAR = {
  query: { cineId: idPositivo() },
  body: { ...UBICACION, ...CINE_OPCIONAL },
  cruzada: (d, err) => {
    cineDelCuerpoOUrl(d);
    if (d.body.cineId === null) err('cineId', 'es obligatorio (el cine de la sucursal)');
  },
};
const EDITAR = {
  ...PARAM_ID,
  query: { cineId: idPositivo() },
  body: { ...UBICACION, ...CINE_OPCIONAL },
  cruzada: cineDelCuerpoOUrl,
};

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

// El cine puede llegar como { cine: { cineId } }, { cineId } o ?cineId=
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
router.get('/cine/:cineId', validar({ params: { cineId: idPositivo({ requerido: true }) } }), async (req, res, next) => {
  try {
    const { cineId } = req.datos.params;
    const { rows } = await db.query(`${SELECT_SUCURSAL} WHERE s.cine_id = $1 ORDER BY s.bran_id`, [cineId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const s = await obtenerSucursal(id);
    if (!s) throw new HttpError(404, 'Sucursal no encontrada con id: ' + id, 'SUCURSAL_NO_ENCONTRADA');
    res.json(s);
  } catch (e) { next(e); }
});

// KAN-16: registrar una sucursal asociada a un cine existente
router.post('/', ...soloAdmin, validar(CREAR), async (req, res, next) => {
  try {
    const { branLocation, cineId } = req.datos.body;
    if (!(await existeCine(cineId))) {
      throw new HttpError(404, 'Cine no encontrado con id: ' + cineId, 'CINE_NO_ENCONTRADO');
    }
    const ins = await db.query(
      'INSERT INTO sucursal (bran_location, cine_id) VALUES ($1, $2) RETURNING bran_id',
      [branLocation, cineId]
    );
    res.status(201).json(await obtenerSucursal(ins.rows[0].bran_id));
  } catch (e) { next(e); }
});

// Editar una sucursal (ubicacion y, si se envia, el cine)
router.put('/:id', ...soloAdmin, validar(EDITAR), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const { branLocation, cineId } = req.datos.body;
    if (cineId !== null && !(await existeCine(cineId))) {
      throw new HttpError(404, 'Cine no encontrado con id: ' + cineId, 'CINE_NO_ENCONTRADO');
    }
    const r = await db.query(
      'UPDATE sucursal SET bran_location = $1, cine_id = COALESCE($2, cine_id) WHERE bran_id = $3',
      [branLocation, cineId, id]
    );
    if (!r.rowCount) throw new HttpError(404, 'Sucursal no encontrada con id: ' + id, 'SUCURSAL_NO_ENCONTRADA');
    res.json(await obtenerSucursal(id));
  } catch (e) { next(e); }
});

// Eliminar una sucursal
router.delete('/:id', ...soloAdmin, validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const r = await db.query('DELETE FROM sucursal WHERE bran_id = $1', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Sucursal no encontrada con id: ' + id, 'SUCURSAL_NO_ENCONTRADA');
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') {
      return next(new HttpError(409, 'No se puede eliminar: la sucursal tiene datos asociados.', 'SUCURSAL_CON_DATOS_ASOCIADOS'));
    }
    next(e);
  }
});

export default router;
