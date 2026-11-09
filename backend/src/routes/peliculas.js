import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validar, texto, entero, PARAM_ID } from '../middleware/validar.js';
import { reglaPoster } from '../utils/imagen.js';

const router = Router();

// El catálogo se consulta sin iniciar sesión (cartelera). Modificarlo es solo del ADMIN.
const soloAdmin = [requireAuth, requireRole('ADMIN')];

// El póster pesa mucho: nunca viaja en el listado, solo en GET /:id/poster
const COLUMNAS = `movie_id, nombre, descripcion, duracion_min, genero, clasificacion,
  (poster_url IS NOT NULL AND poster_url <> '') AS tiene_poster`;

const aPelicula = (r) => ({
  movieId: Number(r.movie_id),
  nombre: r.nombre,
  descripcion: r.descripcion,
  duracionMin: r.duracion_min,
  genero: r.genero,
  clasificacion: r.clasificacion,
  tienePoster: r.tiene_poster,
});

// Esquemas de entrada (KAN-57). titulo, sinopsis y duracion son alias del backend anterior.
const PELICULA = {
  nombre: texto({ requerido: true, max: 255, alias: ['titulo'] }),
  descripcion: texto({ requerido: true, msgVacio: 'la sinopsis no puede estar vacía', alias: ['sinopsis'] }),
  duracionMin: entero({ requerido: true, min: 1, max: 600, motivo: 'debe ser un entero entre 1 y 600 minutos', alias: ['duracion'] }),
  clasificacion: texto({ requerido: true, max: 10 }),
  genero: texto({ max: 50 }),
};
const datosPelicula = (b) => ({
  nombre: b.nombre,
  descripcion: b.descripcion,
  duracion: b.duracionMin,
  clasificacion: b.clasificacion,
  genero: b.genero ?? null,
});

async function buscar(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM pelicula WHERE movie_id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Película no encontrada con id: ${id}`, 'PELICULA_NO_ENCONTRADA');
  return aPelicula(rows[0]);
}

// Listado (opcional ?nombre=texto)
router.get('/', validar({ query: { nombre: texto({ max: 255 }) } }), async (req, res) => {
  const nombre = req.datos.query.nombre ?? '';
  const { rows } = nombre
    ? await pool.query(
        `SELECT ${COLUMNAS} FROM pelicula WHERE nombre ILIKE '%' || $1 || '%' ORDER BY movie_id`,
        [nombre.replace(/[\\%_]/g, '\\$&')])
    : await pool.query(`SELECT ${COLUMNAS} FROM pelicula ORDER BY movie_id`);
  res.json(rows.map(aPelicula));
});

router.get('/:id', validar(PARAM_ID), async (req, res) => {
  res.json(await buscar(req.datos.params.id));
});

// El póster va aparte para no cargar la imagen en cada listado
router.get('/:id/poster', validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  const { rows } = await pool.query('SELECT poster_url FROM pelicula WHERE movie_id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, `Película no encontrada con id: ${id}`, 'PELICULA_NO_ENCONTRADA');
  if (!rows[0].poster_url) throw new HttpError(404, 'Esta película no tiene póster.', 'POSTER_NO_ENCONTRADO');
  res.json({ posterUrl: rows[0].poster_url });
});

// KAN-19 (HU06) paso 1: registrar la película con sus datos
router.post('/', ...soloAdmin, validar({ body: PELICULA }), async (req, res) => {
  const v = datosPelicula(req.datos.body);
  const { rows } = await pool.query(
    `INSERT INTO pelicula (nombre, descripcion, duracion_min, genero, clasificacion)
     VALUES ($1, $2, $3, $4, $5) RETURNING movie_id`,
    [v.nombre, v.descripcion, v.duracion, v.genero, v.clasificacion]);
  res.status(201).json(await buscar(rows[0].movie_id));
});

// KAN-19 (HU06) paso 2: subir el póster. Cuerpo: { "posterUrl": "data:image/png;base64,..." }
router.post('/:id/poster', ...soloAdmin, validar({ ...PARAM_ID, body: { posterUrl: reglaPoster() } }), async (req, res) => {
  const { id } = req.datos.params;
  const poster = req.datos.body.posterUrl;
  const { rowCount } = await pool.query('UPDATE pelicula SET poster_url = $1 WHERE movie_id = $2', [poster, id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`, 'PELICULA_NO_ENCONTRADA');
  res.json(await buscar(id));
});

router.delete('/:id/poster', ...soloAdmin, validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  const { rowCount } = await pool.query('UPDATE pelicula SET poster_url = NULL WHERE movie_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`, 'PELICULA_NO_ENCONTRADA');
  res.json(await buscar(id));
});

router.put('/:id', ...soloAdmin, validar({ ...PARAM_ID, body: PELICULA }), async (req, res) => {
  const { id } = req.datos.params;
  const v = datosPelicula(req.datos.body);
  const { rowCount } = await pool.query(
    `UPDATE pelicula SET nombre = $1, descripcion = $2, duracion_min = $3, genero = $4, clasificacion = $5
      WHERE movie_id = $6`,
    [v.nombre, v.descripcion, v.duracion, v.genero, v.clasificacion, id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`, 'PELICULA_NO_ENCONTRADA');
  res.json(await buscar(id));
});

router.delete('/:id', ...soloAdmin, validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  // La base borraría en cascada sus funciones; mejor obligar a quitarlas primero
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM funcion WHERE movie_id = $1', [id]);
  if (rows[0].n > 0) {
    throw new HttpError(409, `No se puede eliminar: la película tiene ${rows[0].n} función(es) programada(s).`, 'PELICULA_CON_FUNCIONES');
  }
  const { rowCount } = await pool.query('DELETE FROM pelicula WHERE movie_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`, 'PELICULA_NO_ENCONTRADA');
  res.status(204).end();
});

export default router;
