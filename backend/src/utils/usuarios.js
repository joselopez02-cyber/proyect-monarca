import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { texto, correo, fecha } from '../middleware/validar.js';

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

// Campos del perfil: nombre en el JSON -> columna de la tabla usuario
export const COLUMNAS_PERFIL = {
  nombreCompleto: 'nombre_completo',
  cedula: 'cedula',
  telefono: 'telefono',
  direccion: 'direccion',
  fechaNacimiento: 'fecha_nacimiento',
  email: 'email',
};

// Esquema de validación de los campos de perfil (registro y PATCH /usuarios/:id/perfil).
// Si `completo` es true, el email es obligatorio (registro).
export const esquemaPerfil = ({ completo = false } = {}) => ({
  nombreCompleto: texto({ max: 255 }),
  cedula: texto({ max: 20 }),
  telefono: texto({ max: 30 }),
  direccion: texto({ max: 500 }),
  fechaNacimiento: fecha(),
  email: correo({ requerido: completo, permiteVacio: false, max: 150 }),
});

// { nombreCompleto: 'Ana' } -> { nombre_completo: 'Ana' } (solo los campos presentes)
export const aColumnas = (valores) =>
  Object.fromEntries(Object.entries(valores).map(([campo, v]) => [COLUMNAS_PERFIL[campo], v]));

// Lanza 400 si el username, email o cédula ya los usa OTRO usuario
export async function verificarUnicos({ username, email, cedula }, excluirId = 0) {
  const { rows } = await pool.query(
    `SELECT username, email, cedula FROM usuario
      WHERE usuario_id <> $4 AND (username = $1 OR email = $2 OR ($3::text IS NOT NULL AND cedula = $3))`,
    [username ?? null, email ?? null, cedula ?? null, excluirId]
  );
  for (const r of rows) {
    if (username && r.username === username)
      throw new HttpError(400, `El username '${username}' ya está en uso.`, 'USERNAME_EN_USO');
    if (email && r.email === email)
      throw new HttpError(400, `El email '${email}' ya está registrado.`, 'EMAIL_YA_REGISTRADO');
    if (cedula && r.cedula === cedula)
      throw new HttpError(400, `La cédula '${cedula}' ya está registrada.`, 'CEDULA_YA_REGISTRADA');
  }
}
