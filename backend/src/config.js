import 'dotenv/config';

// Si el secreto falta o es corto, el servidor NO arranca: es mejor fallar
// al inicio que correr con la seguridad rota.
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error(
    'JWT_SECRET no está configurada o tiene menos de 32 caracteres. Revisa tu archivo .env.'
  );
}

export const JWT_SECRET = secret;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
