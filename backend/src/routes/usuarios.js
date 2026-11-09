import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validar, enumerado, PARAM_ID } from '../middleware/validar.js';
import { aUsuario, COLUMNAS_PERFIL, esquemaPerfil, aColumnas, verificarUnicos } from '../utils/usuarios.js';

const router = Router();
const ROLES = ['USER', 'GESTOR', 'ADMIN'];

router.use(requireAuth);

const noEncontrado = (id) => new HttpError(404, `Usuario no encontrado con id: ${id}`, 'USUARIO_NO_ENCONTRADO');

router.get('/', requireRole('ADMIN'), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuario ORDER BY usuario_id');
  res.json(rows.map(aUsuario));
});

router.get('/:id', requireRole('ADMIN'), validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  const { rows } = await pool.query('SELECT * FROM usuario WHERE usuario_id = $1', [id]);
  if (!rows[0]) throw noEncontrado(id);
  res.json(aUsuario(rows[0]));
});

// KAN-25 (HU12): cambiar el rol. Solo ADMIN: así nadie puede auto-escalarse.
router.patch('/:id/rol', requireRole('ADMIN'), validar({ ...PARAM_ID, body: { rol: enumerado(ROLES, { requerido: true }) } }), async (req, res) => {
  const { id } = req.datos.params;
  const { rol } = req.datos.body;

  const { rowCount } = await pool.query('UPDATE usuario SET rol = $1 WHERE usuario_id = $2', [rol, id]);
  if (!rowCount) throw noEncontrado(id);
  res.json({ mensaje: 'Rol actualizado' });
});

// KAN-25 (HU12): editar el perfil. ADMIN edita cualquiera; los demás, solo el suyo.
router.patch('/:id/perfil', validar({
  ...PARAM_ID,
  body: esquemaPerfil(),
  cruzada: (d, err) => {
    if (!Object.keys(d.body).length) err('cuerpo', `envía al menos un campo: ${Object.keys(COLUMNAS_PERFIL).join(', ')}`);
  },
}), async (req, res) => {
  const { id } = req.datos.params;
  if (req.user.rol !== 'ADMIN' && req.user.usuarioId !== id) {
    throw new HttpError(403, 'No puedes modificar el perfil de otro usuario.', 'PERFIL_AJENO');
  }

  // Solo se aceptan los campos de perfil; "rol" o "activo" en el cuerpo se ignoran
  const valores = aColumnas(req.datos.body);
  const columnas = Object.keys(valores);
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
router.delete('/:id', requireRole('ADMIN'), validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  const { rowCount } = await pool.query('UPDATE usuario SET activo = FALSE WHERE usuario_id = $1', [id]);
  if (!rowCount) throw noEncontrado(id);
  res.json({ mensaje: 'Usuario desactivado' });
});

export default router;
