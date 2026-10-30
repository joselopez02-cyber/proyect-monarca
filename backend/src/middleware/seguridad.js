import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { HttpError } from './errors.js';

// Orígenes externos permitidos (separados por coma). El propio dominio de la app siempre se acepta.
const permitidos = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

export const cabecerasSeguridad = helmet({
  contentSecurityPolicy: {
    directives: {
      // El frontend usa onclick="..." en muchos sitios; sin esto la CSP por defecto los bloquea
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    },
  },
});

export const corsRestringido = cors((req, cb) => {
  const origin = req.get('Origin');
  // Los POST/PUT/DELETE del propio frontend también envían Origin
  const propio = origin === `${req.protocol}://${req.get('host')}`;
  if (!origin || propio || permitidos.includes(origin)) {
    return cb(null, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    });
  }
  cb(new HttpError(403, 'Origen no permitido por CORS.'));
});

// Límite global por IP. Superarlo devuelve 429 con el encabezado Retry-After.
export const limiteGlobal = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.method === 'OPTIONS',
  handler: (_req, res, _next, options) =>
    res.status(options.statusCode).json({
      timestamp: new Date().toISOString(),
      error: 'Demasiadas peticiones. Intenta de nuevo más tarde.',
    }),
});
