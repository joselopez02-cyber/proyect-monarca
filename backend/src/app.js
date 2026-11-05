import express from 'express';
import pool from './db.js';
import { notFound, errorHandler, cuerpoError } from './middleware/errors.js';
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
import reportesRouter from './routes/reportes.js';
import { cabecerasSeguridad, corsRestringido, limiteGlobal } from './middleware/seguridad.js';

const app = express();

// Detrás del proxy (Render o Codespaces), esto hace que req.ip sea la IP real del cliente
app.set('trust proxy', 1);

app.use(cabecerasSeguridad);
app.use(corsRestringido);
app.use('/api', limiteGlobal);
// El póster viaja en Base64 (hasta ~2 MB): estas rutas aceptan un cuerpo más grande que el resto de la API (100 kb)
app.use(['/api/peliculas', '/api/v1/peliculas'], express.json({ limit: '3mb' }));
app.use(express.json());

// KAN-54 (HT15): todas las rutas viven en un solo router que se monta en /api/v1 (versión vigente)
// y también en /api, que se mantiene como alias mientras el frontend y otros clientes terminan de migrar.
const api = express.Router();

// Comprueba que la API y la base de datos responden
api.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ ...cuerpoError(req, 503, 'La base de datos no responde.', 'BD_NO_DISPONIBLE'), db: 'down' });
  }
});

api.use('/auth', authRouter);
api.use('/usuarios', usuariosRouter);
api.use('/gestores', gestoresRouter);
api.use('/cines', cinesRouter);
api.use('/sucursales', sucursalesRouter);
api.use('/salas', salasRouter);
api.use('/peliculas', peliculasRouter);
api.use('/funciones', funcionesRouter);
api.use('/sillas', sillasRouter);
api.use('/clientes', clientesRouter);
api.use('/reservas', reservasRouter);
api.use('/pagos', pagosRouter);
api.use('/transacciones', transaccionesRouter);
api.use('/ocupacion', ocupacionRouter);
api.use('/reportes', reportesRouter);

app.use('/api/v1', api);
app.use('/api', api);

servirFrontend(app);
app.use(notFound);
app.use(errorHandler);

export default app;
