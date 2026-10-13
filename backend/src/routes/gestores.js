import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseId } from '../utils/validators.js';

const router = Router();

// Solo el administrador gestiona asignaciones
router.use(requireAuth, requireRole('ADMIN'));

const aGestor = (r) => ({
  gestorId: Number(r.manager_id),
  usuarioId: r.usuario_id === null ? null : Number(r.usuario_id),
  username: r.username ?? null,
  sucursalId: r.sucursal_id === null ? null : Number(r.sucursal_id),
  sucursal: r.bran_location ?? null,
  detalles: r.manager_details,
});

const SELECT_GESTOR = `
  SELECT g.manager_id, g.usuario_id, g.sucursal_id, g.manager_details,
         u.username, s.bran_location
    FROM gestor g
    LEFT JOIN usuario u ON u.usuario_id = g.usuario_id
    LEFT JOIN sucursal s ON s.bran_id = g.sucursal_id`;

// Lista de gestores y sus sucursales
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`${SELECT_GESTOR} ORDER BY g.manager_id`);
  res.json(rows.map(aGestor));
});

// KAN-18 (HU05): asignar un usuario con rol GESTOR a una sucursal existente
router.post('/', async (req, res) => {
  const { usuarioId, sucursalId } = req.body ?? {};
  const uid = parseId(usuarioId);
  const sid = parseId(sucursalId);

  const { rows: us } = await pool.query('SELECT * FROM usuario WHERE usuario_id = $1', [uid]);
  const u = us[0];
  if (!u) throw new HttpError(404, `Usuario no encontrado con id: ${uid}`);
  if (!u.activo) throw new HttpError(400, 'El usuario está desactivado.');
  if (u.rol !== 'GESTOR') {
    throw new HttpError(400, 'Solo se puede asignar un usuario con rol GESTOR. Cambia su rol primero.');
  }

  const { rows: ss } = await pool.query('SELECT bran_id FROM sucursal WHERE bran_id = $1', [sid]);
  if (!ss[0]) throw new HttpError(404, `Sucursal no encontrada con id: ${sid}`);

  const { rows: ya } = await pool.query(
    `SELECT s.bran_location FROM gestor g LEFT JOIN sucursal s ON s.bran_id = g.sucursal_id
      WHERE g.usuario_id = $1`, [uid]);
  if (ya[0]) {
    throw new HttpError(400, `El usuario ya está asignado a una sucursal (${ya[0].bran_location}). Quita esa asignación primero.`);
  }

  const detalles = u.nombre_completo || u.username;
  const { rows } = await pool.query(
    'INSERT INTO gestor (manager_details, sucursal_id, usuario_id) VALUES ($1, $2, $3) RETURNING manager_id',
    [detalles, sid, uid]);
  const { rows: salida } = await pool.query(`${SELECT_GESTOR} WHERE g.manager_id = $1`, [rows[0].manager_id]);
  res.status(201).json(aGestor(salida[0]));
});

// Quitar la asignación
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await pool.query('DELETE FROM gestor WHERE manager_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, `Gestor no encontrado con id: ${id}`);
  res.json({ mensaje: 'Asignación eliminada' });
});

export default router;
