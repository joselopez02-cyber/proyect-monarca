import express from 'express';
import * as dbModule from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { validar, texto, entero, enumerado, idPositivo, PARAM_ID } from '../middleware/validar.js';

// Acepta que db.js exporte el pool directo, { pool } o { query }.
const db = dbModule.pool || dbModule.default?.pool || dbModule.default || dbModule;

const router = express.Router();
router.use(express.json());

// KAN-10: ver es público; crear, editar y eliminar es solo del ADMIN
const soloAdmin = [requireAuth, requireRole('ADMIN')];

const TIPOS = ['PRO', 'TRES_D', 'DOS_D'];
const ALIAS_TIPO = { '3D': 'TRES_D', '2D': 'DOS_D' };
const MAX_FILAS = 26;     // A..Z
const MAX_COLUMNAS = 30;

// Misma forma que el frontend espera: salaId, nombre, tipo, filas, columnas, capacidad, sucursal {..}
const SELECT_SALA = `
  SELECT sa.sala_id::int AS "salaId",
         sa.nombre,
         sa.tipo::text AS tipo,
         sa.capacidad,
         sa.filas,
         sa.columnas,
         CASE WHEN su.bran_id IS NULL THEN NULL
              ELSE json_build_object('branId', su.bran_id::int,
                                     'branLocation', su.bran_location) END AS sucursal
  FROM sala sa
  LEFT JOIN sucursal su ON su.bran_id = sa.sucursal_id`;

// Matriz de asientos generada a partir de filas x columnas (A1, A2 ... B1 ...)
// Esquemas de entrada (KAN-57)
const TIPO_SALA = enumerado(TIPOS, {
  requerido: true,
  equivalencias: ALIAS_TIPO,
  motivo: 'debe ser PRO, TRES_D (3D) o DOS_D (2D)',
});
const SALA = {
  nombre: texto({ requerido: true, max: 100 }),
  tipo: TIPO_SALA,
  filas: entero({ requerido: true, min: 1, max: MAX_FILAS }),
  columnas: entero({ requerido: true, min: 1, max: MAX_COLUMNAS }),
  branId: idPositivo({ requerido: true, alias: ['sucursal.branId'] }),
};
const datosSala = (b) => ({ ...b, capacidad: b.filas * b.columnas });

function generarAsientos(filas, columnas, tipo) {
  const matriz = [];
  for (let f = 0; f < filas; f++) {
    const letra = String.fromCharCode(65 + f);
    const fila = [];
    for (let c = 1; c <= columnas; c++) {
      fila.push({ codigo: letra + c, fila: letra, numero: c, tipo });
    }
    matriz.push(fila);
  }
  return matriz;
}

function conAsientos(sala) {
  const filas = sala.filas || 0;
  const columnas = sala.columnas || 0;
  return { ...sala, asientos: generarAsientos(filas, columnas, sala.tipo) };
}

async function existeSucursal(branId) {
  const r = await db.query('SELECT 1 FROM sucursal WHERE bran_id = $1', [branId]);
  return r.rowCount > 0;
}

async function obtenerSala(id) {
  const { rows } = await db.query(`${SELECT_SALA} WHERE sa.sala_id = $1`, [id]);
  return rows[0];
}

// Lista de salas
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`${SELECT_SALA} ORDER BY sa.sala_id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Salas por tipo: /api/salas/tipo/PRO | 3D | 2D
router.get('/tipo/:tipo', validar({ params: { tipo: TIPO_SALA } }), async (req, res, next) => {
  try {
    const { tipo } = req.datos.params;
    const { rows } = await db.query(`${SELECT_SALA} WHERE sa.tipo::text = $1 ORDER BY sa.sala_id`, [tipo]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Solo la matriz de asientos de una sala
router.get('/:id/asientos', validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const sala = await obtenerSala(id);
    if (!sala) throw new HttpError(404, 'Sala no encontrada con id: ' + id, 'SALA_NO_ENCONTRADA');
    res.json({
      salaId: sala.salaId, filas: sala.filas, columnas: sala.columnas,
      capacidad: sala.capacidad, tipo: sala.tipo,
      asientos: generarAsientos(sala.filas || 0, sala.columnas || 0, sala.tipo)
    });
  } catch (e) { next(e); }
});

router.get('/:id', validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const sala = await obtenerSala(id);
    if (!sala) throw new HttpError(404, 'Sala no encontrada con id: ' + id, 'SALA_NO_ENCONTRADA');
    res.json(conAsientos(sala));
  } catch (e) { next(e); }
});

// KAN-17: registrar una sala con filas, columnas y tipo; genera la matriz de asientos
router.post('/', ...soloAdmin, validar({ body: SALA }), async (req, res, next) => {
  try {
    const v = datosSala(req.datos.body);
    if (!(await existeSucursal(v.branId))) {
      throw new HttpError(404, 'Sucursal no encontrada con id: ' + v.branId, 'SUCURSAL_NO_ENCONTRADA');
    }
    const ins = await db.query(
      `INSERT INTO sala (nombre, tipo, capacidad, filas, columnas, sucursal_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING sala_id`,
      [v.nombre, v.tipo, v.capacidad, v.filas, v.columnas, v.branId]
    );
    res.status(201).json(conAsientos(await obtenerSala(ins.rows[0].sala_id)));
  } catch (e) { next(e); }
});

// Editar una sala (recalcula capacidad y matriz)
router.put('/:id', ...soloAdmin, validar({ ...PARAM_ID, body: SALA }), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const v = datosSala(req.datos.body);
    if (!(await existeSucursal(v.branId))) {
      throw new HttpError(404, 'Sucursal no encontrada con id: ' + v.branId, 'SUCURSAL_NO_ENCONTRADA');
    }
    const r = await db.query(
      `UPDATE sala SET nombre = $1, tipo = $2, capacidad = $3, filas = $4, columnas = $5, sucursal_id = $6
       WHERE sala_id = $7`,
      [v.nombre, v.tipo, v.capacidad, v.filas, v.columnas, v.branId, id]
    );
    if (!r.rowCount) throw new HttpError(404, 'Sala no encontrada con id: ' + id, 'SALA_NO_ENCONTRADA');
    res.json(conAsientos(await obtenerSala(id)));
  } catch (e) { next(e); }
});

// Eliminar una sala
router.delete('/:id', ...soloAdmin, validar(PARAM_ID), async (req, res, next) => {
  try {
    const { id } = req.datos.params;
    const r = await db.query('DELETE FROM sala WHERE sala_id = $1', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Sala no encontrada con id: ' + id, 'SALA_NO_ENCONTRADA');
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') {
      return next(new HttpError(409, 'No se puede eliminar: la sala tiene datos asociados.', 'SALA_CON_DATOS_ASOCIADOS'));
    }
    next(e);
  }
});

export default router;
