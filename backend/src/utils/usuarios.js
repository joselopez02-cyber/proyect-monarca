import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { texto, esEmail } from './validators.js';

// Nunca se devuelve password_hash
export const aUsuario = (r) => ({
  usuarioId: Number(r.usuario_id),
  username: r.username,
  email: r.email,
  rol: r.rol,
  activo: r.activo,
  createdAt: r.created_at,
  nombreCompleto: r.nombre_completo,
  cedula: r.cedula,
  telefono: r.telefono,
  direccion: r.direccion,
  fechaNacimiento: r.fecha_nacimiento,
});

// Campos del perfil: nombre en el JSON -> [columna, largo máximo]
export const CAMPOS_PERFIL = {
  nombreCompleto: ['nombre_completo', 255],
  cedula: ['cedula', 20],
  telefono: ['telefono', 30],
  direccion: ['direccion', 500],
  fechaNacimiento: ['fecha_nacimiento', 10],
  email: ['email', 150],
};

// Valida los campos de perfil presentes en `datos`. Devuelve { columna: valor }.
// Si `completo` es true, el email es obligatorio (registro).
export function validarPerfil(datos, { completo = false } = {}) {
  const errores = [];
  const valores = {};

  for (const [campo, [columna, maximo]] of Object.entries(CAMPOS_PERFIL)) {
    if (!(campo in datos) && !(completo && campo === 'email')) continue;
    const v = texto(datos[campo]);

    if (campo === 'email' && !v) errores.push('email: debe ser un correo válido');
    else if (v && v.length > maximo) errores.push(`${campo}: máximo ${maximo} caracteres`);
    else if (campo === 'email' && !esEmail(v)) errores.push('email: debe ser un correo válido');
    else if (campo === 'fechaNacimiento' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      errores.push('fechaNacimiento: formato yyyy-MM-dd');
    }
    valores[columna] = v;
  }

  if (errores.length) throw new HttpError(400, errores.join(', '));
  return valores;
}

// Lanza 400 si el username, email o cédula ya los usa OTRO usuario
export async function verificarUnicos({ username, email, cedula }, excluirId = 0) {
  const { rows } = await pool.query(
    `SELECT username, email, cedula FROM usuario
      WHERE usuario_id <> $4 AND (username = $1 OR email = $2 OR ($3::text IS NOT NULL AND cedula = $3))`,
    [username ?? null, email ?? null, cedula ?? null, excluirId]
  );
  for (const r of rows) {
    if (username && r.username === username)
      throw new HttpError(400, `El username '${username}' ya está en uso.`);
    if (email && r.email === email)
      throw new HttpError(400, `El email '${email}' ya está registrado.`);
    if (cedula && r.cedula === cedula)
      throw new HttpError(400, `La cédula '${cedula}' ya está registrada.`);
  }
}
