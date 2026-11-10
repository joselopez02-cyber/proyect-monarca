import 'dotenv/config';

// KAN-39 (HT08): una sola fuente de verdad para la configuración por ambiente.
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const ES_PRODUCCION = NODE_ENV === 'production';

// Si el secreto falta o es corto, el servidor NO arranca: es mejor fallar
// al inicio que correr con la seguridad rota.
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error(
    'JWT_SECRET no está configurada o tiene menos de 32 caracteres. Revisa tu archivo .env.'
  );
}

if (ES_PRODUCCION) {
  const errores = [];
  if (/^cambia-esto/i.test(secret)) errores.push('JWT_SECRET sigue con el valor de ejemplo.');
  if (!process.env.DATABASE_URL) errores.push('Falta DATABASE_URL.');
  const cors = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim());
  if (cors.includes('*')) errores.push('CORS_ORIGINS no puede ser "*" en producción.');
  if (cors.some((o) => /localhost|127\.0\.0\.1/.test(o))) errores.push('CORS_ORIGINS no debe incluir localhost en producción.');
  if (errores.length) {
    throw new Error('Configuración de producción insegura: ' + errores.join(' '));
  }
}

export const JWT_SECRET = secret;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
