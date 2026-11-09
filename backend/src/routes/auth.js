import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { segundosBloqueado, registrarFallo, registrarExito } from '../middleware/loginLimiter.js';
import { firmarToken } from '../utils/jwt.js';
import { validar, texto, clave } from '../middleware/validar.js';
import { esquemaPerfil, aColumnas, verificarUnicos } from '../utils/usuarios.js';

const router = Router();

// Esquemas de entrada (KAN-57, HT18)
const ESQUEMA_REGISTRO = {
  username: texto({ requerido: true, max: 80 }),
  password: clave({ requerido: true, min: 6 }),
  ...esquemaPerfil({ completo: true }),
};
const ESQUEMA_LOGIN = { username: texto({ requerido: true }), password: clave({ requerido: true }) };
const ESQUEMA_CAMBIO_PASSWORD = {
  passwordActual: clave({ requerido: true }),
  passwordNueva: clave({ requerido: true, min: 6, maxBytes: 72 }),
};
const nuevaDistintaDeLaActual = (d, err) => {
  if (d.body.passwordNueva === d.body.passwordActual) err('passwordNueva', 'debe ser distinta a la actual');
};

// Hash cualquiera: solo sirve para que el login tarde lo mismo cuando el usuario
// no existe, y así no revelar qué usernames están registrados.
const HASH_FALSO = '$2a$12$XRAVvAi4ckSjhajv3QXgMeHiN5o0Z4/TK2h/3XDxD5MtWknl3VE/6';

// Respuesta común de registro y login
const sesion = (u) => ({
  token: firmarToken(u),
  username: u.username,
  email: u.email,
  rol: u.rol,
  usuarioId: Number(u.usuario_id),
});

// KAN-23 (HU10): registro de un nuevo usuario cliente
router.post('/register', validar({ body: ESQUEMA_REGISTRO }), async (req, res) => {
  const { username, password, ...datos } = req.datos.body;
  const perfil = aColumnas(datos);
  await verificarUnicos({ username, email: perfil.email, cedula: perfil.cedula ?? null });

  const hash = await bcrypt.hash(password, 12);

  // El rol SIEMPRE es USER: si el cliente manda "rol" en el cuerpo, se ignora.
  // Solo un administrador puede cambiarlo después (KAN-25).
  const { rows } = await pool.query(
    `INSERT INTO usuario
       (username, email, password_hash, rol, nombre_completo, cedula, telefono, direccion, fecha_nacimiento)
     VALUES ($1, $2, $3, 'USER', $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      username, perfil.email, hash,
      perfil.nombre_completo ?? null, perfil.cedula ?? null, perfil.telefono ?? null,
      perfil.direccion ?? null, perfil.fecha_nacimiento ?? null,
    ]
  );
  res.status(201).json(sesion(rows[0]));
});

// KAN-24 (HU11): inicio de sesión. Devuelve el token JWT y el rol.
router.post('/login', validar({ body: ESQUEMA_LOGIN }), async (req, res) => {
  const ip = req.ip;
  const espera = segundosBloqueado(ip);
  if (espera > 0) {
    res.set('Retry-After', String(espera));
    throw new HttpError(429, `Demasiados intentos fallidos. Intenta en ${espera} segundos.`, 'LOGIN_BLOQUEADO');
  }

  const { username, password } = req.datos.body;

  const { rows } = await pool.query('SELECT * FROM usuario WHERE username = $1', [username]);
  const u = rows[0];

  const claveCorrecta = await bcrypt.compare(password, u?.password_hash ?? HASH_FALSO);
  if (!u || !u.activo || !claveCorrecta) {
    registrarFallo(ip);
    throw new HttpError(401, 'Credenciales inválidas', 'CREDENCIALES_INVALIDAS');
  }

  registrarExito(ip);
  res.json(sesion(u));
});

// KAN-48 (HU25): cambiar mi contraseña. Cuerpo: { "passwordActual": "...", "passwordNueva": "..." }
// Exige la contraseña actual. Si no coincide responde 400 y no modifica nada.
// (400 y no 401: el frontend cierra la sesión ante cualquier 401.)
// Los intentos fallidos se limitan por usuario con el mismo mecanismo del login (5 fallos -> bloqueo).
router.patch('/password', requireAuth, validar({ body: ESQUEMA_CAMBIO_PASSWORD, cruzada: nuevaDistintaDeLaActual }), async (req, res) => {
  const { passwordActual: actual, passwordNueva: nueva } = req.datos.body;

  const clave = `pwd:${req.user.usuarioId}`;
  const espera = segundosBloqueado(clave);
  if (espera > 0) {
    res.set('Retry-After', String(espera));
    throw new HttpError(429, `Demasiados intentos fallidos. Intenta en ${espera} segundos.`, 'CAMBIO_PASSWORD_BLOQUEADO');
  }

  const { rows } = await pool.query('SELECT password_hash FROM usuario WHERE usuario_id = $1', [req.user.usuarioId]);
  const correcta = await bcrypt.compare(actual, rows[0]?.password_hash ?? HASH_FALSO);
  if (!rows[0] || !correcta) {
    registrarFallo(clave);
    throw new HttpError(400, 'La contraseña actual es incorrecta.', 'PASSWORD_ACTUAL_INCORRECTA');
  }

  registrarExito(clave);
  const hash = await bcrypt.hash(nueva, 12);
  await pool.query('UPDATE usuario SET password_hash = $1 WHERE usuario_id = $2', [hash, req.user.usuarioId]);
  res.json({ mensaje: 'Contraseña actualizada correctamente.' });
});

// KAN-10 (HT02): datos del usuario autenticado
router.get('/me', requireAuth, (req, res) => {
  const { usuarioId, username, email, rol } = req.user;
  res.json({ usuarioId, username, email, rol });
});

export default router;
