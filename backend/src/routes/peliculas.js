import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseId, texto } from '../utils/validators.js';
import { validarPoster } from '../utils/imagen.js';

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

async function buscar(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM pelicula WHERE movie_id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Película no encontrada con id: ${id}`);
  return aPelicula(rows[0]);
}

// Acepta los nombres del ticket (titulo, sinopsis, duracion) y los de la base (nombre, descripcion, duracionMin)
function validarPelicula(b) {
  const nombre = texto(b.nombre ?? b.titulo);
  const descripcion = texto(b.descripcion ?? b.sinopsis);
  const clasificacion = texto(b.clasificacion);
  const genero = texto(b.genero);
  let duracion = b.duracionMin ?? b.duracion;
  if (typeof duracion === 'string' && duracion.trim() !== '') duracion = Number(duracion);

  const errores = [];
  if (!nombre) errores.push('nombre: no puede estar vacío');
  else if (nombre.length > 255) errores.push('nombre: máximo 255 caracteres');
  if (!descripcion) errores.push('descripcion: la sinopsis no puede estar vacía');
  if (!Number.isInteger(duracion) || duracion < 1 || duracion > 600) {
    errores.push('duracionMin: debe ser un entero entre 1 y 600 minutos');
  }
  if (!clasificacion) errores.push('clasificacion: no puede estar vacía');
  else if (clasificacion.length > 10) errores.push('clasificacion: máximo 10 caracteres');
  if (genero && genero.length > 50) errores.push('genero: máximo 50 caracteres');
  if (errores.length) throw new HttpError(400, errores.join(', '));

  return { nombre, descripcion, duracion, clasificacion, genero };
}

// Listado (opcional ?nombre=texto)
router.get('/', async (req, res) => {
  const nombre = typeof req.query.nombre === 'string' ? req.query.nombre.trim() : '';
  const { rows } = nombre
    ? await pool.query(
        `SELECT ${COLUMNAS} FROM pelicula WHERE nombre ILIKE '%' || $1 || '%' ORDER BY movie_id`,
        [nombre.replace(/[\\%_]/g, '\\$&')])
    : await pool.query(`SELECT ${COLUMNAS} FROM pelicula ORDER BY movie_id`);
  res.json(rows.map(aPelicula));
});

router.get('/:id', async (req, res) => {
  res.json(await buscar(parseId(req.params.id)));
});

// El póster va aparte para no cargar la imagen en cada listado
router.get('/:id/poster', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query('SELECT poster_url FROM pelicula WHERE movie_id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, `Película no encontrada con id: ${id}`);
  if (!rows[0].poster_url) throw new HttpError(404, 'Esta película no tiene póster.');
  res.json({ posterUrl: rows[0].poster_url });
});

// KAN-19 (HU06) paso 1: registrar la película con sus datos
router.post('/', ...soloAdmin, async (req, res) => {
  const v = validarPelicula(req.body ?? {});
  const { rows } = await pool.query(
    `INSERT INTO pelicula (nombre, descripcion, duracion_min, genero, clasificacion)
     VALUES ($1, $2, $3, $4, $5) RETURNING movie_id`,
    [v.nombre, v.descripcion, v.duracion, v.genero, v.clasificacion]);
  res.status(201).json(await buscar(rows[0].movie_id));
});

// KAN-19 (HU06) paso 2: subir el póster. Cuerpo: { "posterUrl": "data:image/png;base64,..." }
router.post('/:id/poster', ...soloAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const poster = validarPoster(req.body?.posterUrl);
  const { rowCount } = await pool.query('UPDATE pelicula SET poster_url = $1 WHERE movie_id = $2', [poster, id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`);
  res.json(await buscar(id));
});

router.delete('/:id/poster', ...soloAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await pool.query('UPDATE pelicula SET poster_url = NULL WHERE movie_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`);
  res.json(await buscar(id));
});

router.put('/:id', ...soloAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const v = validarPelicula(req.body ?? {});
  const { rowCount } = await pool.query(
    `UPDATE pelicula SET nombre = $1, descripcion = $2, duracion_min = $3, genero = $4, clasificacion = $5
      WHERE movie_id = $6`,
    [v.nombre, v.descripcion, v.duracion, v.genero, v.clasificacion, id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`);
  res.json(await buscar(id));
});

router.delete('/:id', ...soloAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  // La base borraría en cascada sus funciones; mejor obligar a quitarlas primero
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM funcion WHERE movie_id = $1', [id]);
  if (rows[0].n > 0) {
    throw new HttpError(409, `No se puede eliminar: la película tiene ${rows[0].n} función(es) programada(s).`);
  }
  const { rowCount } = await pool.query('DELETE FROM pelicula WHERE movie_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${id}`);
  res.status(204).end();
});

export default router;
