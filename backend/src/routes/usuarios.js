import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseId } from '../utils/validators.js';
import { aUsuario, CAMPOS_PERFIL, validarPerfil, verificarUnicos } from '../utils/usuarios.js';

const router = Router();
const ROLES = ['USER', 'GESTOR', 'ADMIN'];

router.use(requireAuth);

const noEncontrado = (id) => new HttpError(404, `Usuario no encontrado con id: ${id}`);

router.get('/', requireRole('ADMIN'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuario ORDER BY usuario_id');
  res.json(rows.map(aUsuario));
});

router.get('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query('SELECT * FROM usuario WHERE usuario_id = $1', [id]);
  if (!rows[0]) throw noEncontrado(id);
  res.json(aUsuario(rows[0]));
});

// KAN-25 (HU12): cambiar el rol. Solo ADMIN: así nadie puede auto-escalarse.
router.patch('/:id/rol', requireRole('ADMIN'), async (req, res) => {
  const id = parseId(req.params.id);
  const rol = typeof req.body?.rol === 'string' ? req.body.rol.trim().toUpperCase() : '';
  if (!ROLES.includes(rol)) throw new HttpError(400, `rol: debe ser ${ROLES.join(', ')}`);

  const { rowCount } = await pool.query('UPDATE usuario SET rol = $1 WHERE usuario_id = $2', [rol, id]);
  if (!rowCount) throw noEncontrado(id);
  res.json({ mensaje: 'Rol actualizado' });
});

// KAN-25 (HU12): editar el perfil. ADMIN edita cualquiera; los demás, solo el suyo.
router.patch('/:id/perfil', async (req, res) => {
  const id = parseId(req.params.id);
  if (req.user.rol !== 'ADMIN' && req.user.usuarioId !== id) {
    throw new HttpError(403, 'No puedes modificar el perfil de otro usuario.');
  }

  // Solo se aceptan los campos de perfil; "rol" o "activo" en el cuerpo se ignoran
  const valores = validarPerfil(req.body ?? {});
  const columnas = Object.keys(valores);
  if (!columnas.length) {
    throw new HttpError(400, `Envía al menos un campo: ${Object.keys(CAMPOS_PERFIL).join(', ')}`);
  }
  await verificarUnicos({ email: valores.email, cedula: valores.cedula }, id);

  const sets = columnas.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const { rowCount } = await pool.query(
    `UPDATE usuario SET ${sets} WHERE usuario_id = $${columnas.length + 1}`,
    [...columnas.map((c) => valores[c]), id]
  );
  if (!rowCount) throw noEncontrado(id);
  res.json({ mensaje: 'Perfil actualizado' });
});

// Desactivar (no borra el registro)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await pool.query('UPDATE usuario SET activo = FALSE WHERE usuario_id = $1', [id]);
  if (!rowCount) throw noEncontrado(id);
  res.json({ mensaje: 'Usuario desactivado' });
});

export default router;
