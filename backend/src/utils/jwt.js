import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config.js';

// Token con subject = username y el claim "rol" embebido (igual que el original)
export function firmarToken(usuario) {
  return jwt.sign({ rol: usuario.rol }, JWT_SECRET, {
    subject: usuario.username,
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

// Lanza un error si el token es inválido, está alterado o expiró
export function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}
