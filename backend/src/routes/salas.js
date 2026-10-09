import express from 'express';
import * as dbModule from '../db.js';

// Acepta que db.js exporte el pool directo, { pool } o { query }.
const db = dbModule.pool || dbModule.default?.pool || dbModule.default || dbModule;

const router = express.Router();
router.use(express.json());

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

function idValido(valor, nombre, res) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: nombre + ' invalido.' });
    return null;
  }
  return id;
}

function normalizarTipo(t) {
  if (typeof t !== 'string') return null;
  const v = t.trim().toUpperCase();
  const tipo = ALIAS_TIPO[v] || v;
  return TIPOS.includes(tipo) ? tipo : null;
}

// Valida y normaliza el cuerpo (POST y PUT usan las mismas reglas)
function validar(b) {
  const nombre = typeof b?.nombre === 'string' ? b.nombre.trim() : '';
  if (!nombre) return { error: 'El nombre de la sala es obligatorio.' };
  if (nombre.length > 100) return { error: 'El nombre de la sala no puede superar 100 caracteres.' };

  const tipo = normalizarTipo(b.tipo);
  if (!tipo) return { error: 'Tipo de sala invalido. Valores validos: PRO, TRES_D (3D), DOS_D (2D).' };

  const filas = Number(b.filas);
  const columnas = Number(b.columnas);
  if (!Number.isInteger(filas) || filas < 1 || filas > MAX_FILAS) {
    return { error: 'Las filas deben ser un entero entre 1 y ' + MAX_FILAS + '.' };
  }
  if (!Number.isInteger(columnas) || columnas < 1 || columnas > MAX_COLUMNAS) {
    return { error: 'Las columnas deben ser un entero entre 1 y ' + MAX_COLUMNAS + '.' };
  }
  const rawSuc = b.sucursal?.branId ?? b.branId;
  if (rawSuc === undefined || rawSuc === null || rawSuc === '') {
    return { error: 'Debes indicar la sucursal de la sala.' };
  }
  const branId = Number(rawSuc);
  if (!Number.isInteger(branId) || branId <= 0) return { error: 'Id de sucursal invalido.' };

  return { nombre, tipo, filas, columnas, capacidad: filas * columnas, branId };
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
router.get('/tipo/:tipo', async (req, res, next) => {
  try {
    const tipo = normalizarTipo(req.params.tipo);
    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de sala invalido: ' + req.params.tipo + '. Valores validos: PRO, 3D, 2D' });
    }
    const { rows } = await db.query(`${SELECT_SALA} WHERE sa.tipo::text = $1 ORDER BY sa.sala_id`, [tipo]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Solo la matriz de asientos de una sala
router.get('/:id/asientos', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sala', res); if (id === null) return;
    const sala = await obtenerSala(id);
    if (!sala) return res.status(404).json({ error: 'Sala no encontrada con id: ' + id });
    res.json({
      salaId: sala.salaId, filas: sala.filas, columnas: sala.columnas,
      capacidad: sala.capacidad, tipo: sala.tipo,
      asientos: generarAsientos(sala.filas || 0, sala.columnas || 0, sala.tipo)
    });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sala', res); if (id === null) return;
    const sala = await obtenerSala(id);
    if (!sala) return res.status(404).json({ error: 'Sala no encontrada con id: ' + id });
    res.json(conAsientos(sala));
  } catch (e) { next(e); }
});

// KAN-17: registrar una sala con filas, columnas y tipo; genera la matriz de asientos
router.post('/', async (req, res, next) => {
  try {
    const v = validar(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (!(await existeSucursal(v.branId))) {
      return res.status(404).json({ error: 'Sucursal no encontrada con id: ' + v.branId });
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
router.put('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sala', res); if (id === null) return;
    const v = validar(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (!(await existeSucursal(v.branId))) {
      return res.status(404).json({ error: 'Sucursal no encontrada con id: ' + v.branId });
    }
    const r = await db.query(
      `UPDATE sala SET nombre = $1, tipo = $2, capacidad = $3, filas = $4, columnas = $5, sucursal_id = $6
       WHERE sala_id = $7`,
      [v.nombre, v.tipo, v.capacidad, v.filas, v.columnas, v.branId, id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Sala no encontrada con id: ' + id });
    res.json(conAsientos(await obtenerSala(id)));
  } catch (e) { next(e); }
});

// Eliminar una sala
router.delete('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id, 'Id de sala', res); if (id === null) return;
    const r = await db.query('DELETE FROM sala WHERE sala_id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Sala no encontrada con id: ' + id });
    res.status(204).end();
  } catch (e) {
    if (e.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar: la sala tiene datos asociados.' });
    }
    next(e);
  }
});

export default router;
