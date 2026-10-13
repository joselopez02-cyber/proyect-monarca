import pool from '../db.js';
import { verificarToken } from '../utils/jwt.js';
import { HttpError } from './errors.js';

// Exige un token válido. Deja el usuario en req.user.
// El rol se lee de la base de datos (no del token) para que un cambio de rol
// o una desactivación apliquen de inmediato, sin esperar a que el token expire.
export async function requireAuth(req, _res, next) {
  const [esquema, token] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    throw new HttpError(401, 'Token requerido. Inicia sesión.');
  }

  let claims;
  try {
    claims = verificarToken(token);
  } catch {
    throw new HttpError(401, 'Token inválido o expirado.');
  }

  const { rows } = await pool.query(
    'SELECT usuario_id, username, email, rol, activo FROM usuario WHERE username = $1',
    [claims.sub]
  );
  const u = rows[0];
  if (!u || !u.activo) throw new HttpError(401, 'Token inválido o expirado.');

  req.user = {
    usuarioId: Number(u.usuario_id),
    username: u.username,
    email: u.email,
    rol: u.rol,
  };
  next();
}

// Uso: router.post('/', requireAuth, requireRole('ADMIN'), ...)
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Token requerido. Inicia sesión.');
  if (!roles.includes(req.user.rol)) {
    throw new HttpError(403, 'No tienes permiso para esta operación.');
  }
  next();
};
