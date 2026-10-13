import express from 'express';
import cors from 'cors';
import pool from './db.js';
import { notFound, errorHandler } from './middleware/errors.js';
import authRouter from './routes/auth.js';
import usuariosRouter from './routes/usuarios.js';
import cinesRouter from './routes/cines.js';
import sucursalesRouter from './routes/sucursales.js';
import salasRouter from './routes/salas.js';

const app = express();

// Detrás del proxy de Codespaces, esto hace que req.ip sea la IP real del cliente
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Comprueba que la API y la base de datos responden
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'down', message: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/cines', cinesRouter);
app.use('/api/sucursales', sucursalesRouter);
app.use('/api/salas', salasRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
