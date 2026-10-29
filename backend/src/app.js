import express from 'express';
import cors from 'cors';
import pool from './db.js';
import { notFound, errorHandler } from './middleware/errors.js';
import authRouter from './routes/auth.js';
import usuariosRouter from './routes/usuarios.js';
import gestoresRouter from './routes/gestores.js';
import cinesRouter from './routes/cines.js';
import sucursalesRouter from './routes/sucursales.js';
import salasRouter from './routes/salas.js';
import peliculasRouter from './routes/peliculas.js';
import funcionesRouter from './routes/funciones.js';
import sillasRouter from './routes/sillas.js';
import clientesRouter from './routes/clientes.js';
import reservasRouter from './routes/reservas.js';
import pagosRouter from './routes/pagos.js';
import servirFrontend from './servirFrontend.js';
import transaccionesRouter from './routes/transacciones.js';
import ocupacionRouter from './routes/ocupacion.js';

const app = express();

// Detrás del proxy de Codespaces, esto hace que req.ip sea la IP real del cliente
app.set('trust proxy', 1);

app.use(cors());
// El póster viaja en Base64 (hasta ~2 MB): estas rutas aceptan un cuerpo más grande que el resto de la API (100 kb)
app.use('/api/peliculas', express.json({ limit: '3mb' }));
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
app.use('/api/gestores', gestoresRouter);
app.use('/api/cines', cinesRouter);
app.use('/api/sucursales', sucursalesRouter);
app.use('/api/salas', salasRouter);
app.use('/api/peliculas', peliculasRouter);
app.use('/api/funciones', funcionesRouter);
app.use('/api/sillas', sillasRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/reservas', reservasRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/transacciones', transaccionesRouter);
app.use('/api/ocupacion', ocupacionRouter);

servirFrontend(app);
app.use(notFound);
app.use(errorHandler);

export default app;
