import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { segundosBloqueado, registrarFallo, registrarExito } from '../middleware/loginLimiter.js';
import { firmarToken } from '../utils/jwt.js';
import { texto } from '../utils/validators.js';
import { validarPerfil, verificarUnicos } from '../utils/usuarios.js';

const router = Router();

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
router.post('/register', async (req, res) => {
  const b = req.body ?? {};
  const username = texto(b.username);
  const password = typeof b.password === 'string' ? b.password : '';

  const errores = [];
  if (!username) errores.push('username: no puede estar vacío');
  else if (username.length > 80) errores.push('username: máximo 80 caracteres');
  if (password.length < 6) errores.push('password: debe tener mínimo 6 caracteres');
  if (errores.length) throw new HttpError(400, errores.join(', '));

  const perfil = validarPerfil(b, { completo: true });
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
router.post('/login', async (req, res) => {
  const ip = req.ip;
  const espera = segundosBloqueado(ip);
  if (espera > 0) {
    res.set('Retry-After', String(espera));
    throw new HttpError(429, `Demasiados intentos fallidos. Intenta en ${espera} segundos.`);
  }

  const username = texto(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const { rows } = username
    ? await pool.query('SELECT * FROM usuario WHERE username = $1', [username])
    : { rows: [] };
  const u = rows[0];

  const claveCorrecta = await bcrypt.compare(password, u?.password_hash ?? HASH_FALSO);
  if (!u || !u.activo || !claveCorrecta) {
    registrarFallo(ip);
    throw new HttpError(401, 'Credenciales inválidas');
  }

  registrarExito(ip);
  res.json(sesion(u));
});

// KAN-10 (HT02): datos del usuario autenticado
router.get('/me', requireAuth, (req, res) => {
  const { usuarioId, username, email, rol } = req.user;
  res.json({ usuarioId, username, email, rol });
});

export default router;
