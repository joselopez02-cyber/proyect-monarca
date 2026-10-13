import pool from '../db.js';

// ADMIN administra todo. GESTOR, solo la sucursal a la que fue asignado.
export async function puedeAdministrarSucursal(user, sucursalId) {
  if (user.rol === 'ADMIN') return true;
  if (user.rol !== 'GESTOR') return false;
  const { rowCount } = await pool.query(
    'SELECT 1 FROM gestor WHERE usuario_id = $1 AND sucursal_id = $2', [user.usuarioId, sucursalId]);
  return rowCount > 0;
}
