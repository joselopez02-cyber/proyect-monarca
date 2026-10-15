import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { puedeAdministrarSucursal } from '../utils/gestores.js';
import { parseId } from '../utils/validators.js';
import {
  MARGEN_MIN, MAX_DIAS, MAX_HORARIOS,
  validarFecha, validarHora, moverDia, diasEnRango, fechasEntre, sumarMinutos,
} from '../utils/horarios.js';

const router = Router();

// Ver la cartelera es público. Programar o quitar funciones: ADMIN, o GESTOR de la sucursal de la sala.
const admins = [requireAuth, requireRole('ADMIN', 'GESTOR')];

const SELECT_FUNCION = `
  SELECT f.funcion_id, f.fecha, f.hora_inicio, f.precio_boleto, f.capacidad_total, f.asientos_disponibles,
         p.movie_id, p.nombre AS pelicula, p.duracion_min, p.clasificacion,
         (p.poster_url IS NOT NULL AND p.poster_url <> '') AS tiene_poster,
         sa.sala_id, sa.nombre AS sala, sa.tipo, sa.sucursal_id
    FROM funcion f
    JOIN pelicula p ON p.movie_id = f.movie_id
    JOIN sala sa ON sa.sala_id = f.sala_id`;

const aFuncion = (r) => ({
  funcionId: Number(r.funcion_id),
  fecha: r.fecha,
  horaInicio: r.hora_inicio,
  horaFin: r.duracion_min == null ? null : sumarMinutos(r.hora_inicio, r.duracion_min),
  precioBoleto: r.precio_boleto,
  capacidadTotal: r.capacidad_total,
  asientosDisponibles: r.asientos_disponibles,
  pelicula: {
    movieId: Number(r.movie_id),
    nombre: r.pelicula,
    duracionMin: r.duracion_min,
    clasificacion: r.clasificacion,
    tienePoster: r.tiene_poster,
  },
  sala: {
    salaId: Number(r.sala_id),
    nombre: r.sala,
    tipo: r.tipo,
    sucursalId: r.sucursal_id === null ? null : Number(r.sucursal_id),
  },
});

const ORDEN = 'ORDER BY f.fecha, f.hora_inicio, f.funcion_id';

const idCampo = (valor, campo) => {
  try { return parseId(valor); } catch { throw new HttpError(400, `${campo}: debe ser un número positivo.`); }
};

// ¿Hay otra función en la misma sala cuyo bloque (duración + margen) choque con el nuevo?
// Bloque = desde que empieza hasta que termina la película más el margen de limpieza.
// $1 sala, $2/$3 día anterior y siguiente (para no revisar toda la tabla), $4 inicio nuevo,
// $5 minutos del bloque nuevo, $6 margen
const SQL_CRUCE = `
  SELECT f.fecha, f.hora_inicio, p.nombre
    FROM funcion f
    JOIN pelicula p ON p.movie_id = f.movie_id
   WHERE f.sala_id = $1
     AND f.fecha BETWEEN $2 AND $3
     AND (f.fecha || ' ' || f.hora_inicio)::timestamp < $4::timestamp + make_interval(mins => $5::int)
     AND $4::timestamp < (f.fecha || ' ' || f.hora_inicio)::timestamp
                         + make_interval(mins => COALESCE(p.duracion_min, 0) + $6::int)`;

// Listado. Filtros opcionales: ?movieId= &salaId= &fecha=AAAA-MM-DD
router.get('/', async (req, res) => {
  const cond = [];
  const params = [];
  if (req.query.movieId !== undefined) { params.push(idCampo(req.query.movieId, 'movieId')); cond.push(`f.movie_id = $${params.length}`); }
  if (req.query.salaId !== undefined) { params.push(idCampo(req.query.salaId, 'salaId')); cond.push(`f.sala_id = $${params.length}`); }
  if (req.query.fecha !== undefined) { params.push(validarFecha(req.query.fecha)); cond.push(`f.fecha = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`${SELECT_FUNCION} ${where} ${ORDEN}`, params);
  res.json(rows.map(aFuncion));
});

// Las funciones se guardan con fecha y hora de Colombia; el servidor puede estar en otra zona horaria
const ZONA = process.env.ZONA_HORARIA || 'America/Bogota';

// Ejecuta la consulta con las condiciones dadas. Salvo que se pida todas=true, solo trae las funciones
// vigentes: las que todavía no han empezado (fecha y hora de inicio posteriores a este momento).
async function consultar({ condiciones = [], params = [], todas = false }) {
  const cond = [...condiciones];
  const p = [...params];
  if (!todas) {
    p.push(ZONA);
    cond.push(`(f.fecha || ' ' || f.hora_inicio)::timestamp >= (NOW() AT TIME ZONE $${p.length})`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`${SELECT_FUNCION} ${where} ${ORDEN}`, p);
  return rows.map(aFuncion);
}

const pideTodas = (req) => req.query.todas === 'true';

// KAN-21 (HU08): cartelera de funciones vigentes. Descarta las que ya empezaron o terminaron,
// comparando fecha Y hora con el momento actual (no solo el día).
router.get('/vigentes', async (_req, res) => {
  res.json(await consultar({}));
});

// KAN-22 (HU09): filtros de la cartelera. Por defecto solo muestran funciones vigentes;
// con ?todas=true incluyen también las que ya pasaron.
router.get('/pelicula/:movieId', async (req, res) => {
  const movieId = parseId(req.params.movieId);
  const { rowCount } = await pool.query('SELECT 1 FROM pelicula WHERE movie_id = $1', [movieId]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${movieId}`);
  res.json(await consultar({ condiciones: ['f.movie_id = $1'], params: [movieId], todas: pideTodas(req) }));
});

router.get('/sala/:salaId', async (req, res) => {
  const salaId = parseId(req.params.salaId);
  const { rowCount } = await pool.query('SELECT 1 FROM sala WHERE sala_id = $1', [salaId]);
  if (!rowCount) throw new HttpError(404, `Sala no encontrada con id: ${salaId}`);
  res.json(await consultar({ condiciones: ['f.sala_id = $1'], params: [salaId], todas: pideTodas(req) }));
});

// /api/funciones/rango?desde=2026-11-20&hasta=2026-11-25 (ambas fechas incluidas).
// También acepta inicio y fin, los nombres que usaba el backend anterior.
router.get('/rango', async (req, res) => {
  const desde = validarFecha(req.query.desde ?? req.query.inicio, 'desde');
  const hasta = validarFecha(req.query.hasta ?? req.query.fin, 'hasta');
  if (hasta < desde) throw new HttpError(400, 'hasta no puede ser anterior a desde.');
  res.json(await consultar({ condiciones: ['f.fecha BETWEEN $1 AND $2'], params: [desde, hasta], todas: pideTodas(req) }));
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(`${SELECT_FUNCION} WHERE f.funcion_id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Función no encontrada con id: ${id}`);
  res.json(aFuncion(rows[0]));
});

// KAN-20 (HU07): programar una función (película + sala + horario), sin cruces en la sala.
// Una función:   { "movieId": 1, "salaId": 2, "fecha": "2026-11-20", "hora": "19:00", "precioBoleto": 18000 }
// Varias a la vez: { "movieId", "salaId", "fechaInicio", "fechaFin", "horarios": ["15:00","19:00"], "precioBoleto" }
// Es todo o nada: si una sola se cruza, no se crea ninguna.
router.post('/programar', ...admins, async (req, res) => {
  const b = req.body ?? {};
  const movieId = idCampo(b.movieId ?? b.peliculaId, 'movieId');
  const salaId = idCampo(b.salaId, 'salaId');

  const precio = typeof b.precioBoleto === 'number' ? b.precioBoleto
    : typeof b.precioBoleto === 'string' && b.precioBoleto.trim() !== '' ? Number(b.precioBoleto) : NaN;
  if (!Number.isFinite(precio) || precio <= 0 || precio > 1_000_000) {
    throw new HttpError(400, 'precioBoleto: debe ser un número mayor que 0 (en pesos).');
  }

  let fechas;
  if (b.fecha !== undefined) {
    fechas = [validarFecha(b.fecha, 'fecha')];
  } else if (b.fechaInicio !== undefined) {
    const inicio = validarFecha(b.fechaInicio, 'fechaInicio');
    const fin = validarFecha(b.fechaFin ?? b.fechaInicio, 'fechaFin');
    if (fin < inicio) throw new HttpError(400, 'fechaFin no puede ser anterior a fechaInicio.');
    if (diasEnRango(inicio, fin) > MAX_DIAS) throw new HttpError(400, `El rango no puede superar ${MAX_DIAS} días.`);
    fechas = fechasEntre(inicio, fin);
  } else {
    throw new HttpError(400, 'Indica la fecha (fecha) o un rango (fechaInicio y fechaFin).');
  }

  const crudas = b.horarios ?? (b.hora !== undefined ? [b.hora] : b.horaInicio !== undefined ? [b.horaInicio] : undefined);
  if (!Array.isArray(crudas) || crudas.length === 0) {
    throw new HttpError(400, 'Indica la hora (hora) o una lista de horarios (horarios).');
  }
  if (crudas.length > MAX_HORARIOS) throw new HttpError(400, `Máximo ${MAX_HORARIOS} horarios por día.`);
  const horas = [...new Set(crudas.map((h, i) => validarHora(h, `horarios[${i}]`)))].sort();

  const { rows: ps } = await pool.query('SELECT movie_id, nombre, duracion_min FROM pelicula WHERE movie_id = $1', [movieId]);
  if (!ps[0]) throw new HttpError(404, `Película no encontrada con id: ${movieId}`);
  if (!ps[0].duracion_min) throw new HttpError(400, 'La película no tiene duración registrada; edítala antes de programarla.');
  const duracion = ps[0].duracion_min;

  const { rows: ss } = await pool.query('SELECT sala_id, nombre, capacidad, sucursal_id FROM sala WHERE sala_id = $1', [salaId]);
  if (!ss[0]) throw new HttpError(404, `Sala no encontrada con id: ${salaId}`);
  const sala = ss[0];

  // Un GESTOR solo programa en las salas de su sucursal
  if (!(await puedeAdministrarSucursal(req.user, sala.sucursal_id))) {
    throw new HttpError(403, 'Esta sala pertenece a otra sucursal. Solo puedes programar en la tuya.');
  }

  const client = await pool.connect();
  let ids;
  try {
    await client.query('BEGIN');
    // Bloquea la sala: dos administradores programando a la vez en la misma sala se turnan
    await client.query('SELECT 1 FROM sala WHERE sala_id = $1 FOR UPDATE', [salaId]);

    ids = [];
    const cruces = [];
    for (const fecha of fechas) {
      for (const hora of horas) {
        const { rows } = await client.query(SQL_CRUCE, [
          salaId, moverDia(fecha, -1), moverDia(fecha, 1), `${fecha} ${hora}`, duracion + MARGEN_MIN, MARGEN_MIN,
        ]);
        if (rows.length) {
          cruces.push(`${fecha} ${hora} (choca con «${rows[0].nombre}» de las ${rows[0].hora_inicio} del ${rows[0].fecha})`);
          continue;
        }
        const ins = await client.query(
          `INSERT INTO funcion (movie_id, sala_id, fecha, hora_inicio, precio_boleto, capacidad_total, asientos_disponibles)
           VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING funcion_id`,
          [movieId, salaId, fecha, hora, precio, sala.capacidad]);
        ids.push(ins.rows[0].funcion_id);
      }
    }
    if (cruces.length) {
      const muestra = cruces.slice(0, 5).join('; ');
      const mas = cruces.length > 5 ? ` y ${cruces.length - 5} más` : '';
      throw new HttpError(409,
        `Cruce de horarios en la sala «${sala.nombre}» (cada función necesita ${duracion} min + ${MARGEN_MIN} min de descanso): ${muestra}${mas}. No se creó ninguna función.`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(`${SELECT_FUNCION} WHERE f.funcion_id = ANY($1::bigint[]) ${ORDEN}`, [ids]);
  res.status(201).json({ creadas: rows.length, funciones: rows.map(aFuncion) });
});

router.delete('/:id', ...admins, async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(
    `SELECT f.funcion_id, sa.sucursal_id FROM funcion f JOIN sala sa ON sa.sala_id = f.sala_id WHERE f.funcion_id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Función no encontrada con id: ${id}`);
  if (!(await puedeAdministrarSucursal(req.user, rows[0].sucursal_id))) {
    throw new HttpError(403, 'Esta función es de otra sucursal.');
  }
  // No borrar una función que ya tiene reservas vigentes
  const { rows: rs } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM reserva WHERE funcion_id = $1 AND estado <> 'CANCELADA'`, [id]);
  if (rs[0].n > 0) throw new HttpError(409, `No se puede eliminar: la función tiene ${rs[0].n} reserva(s) vigente(s).`);
  await pool.query('DELETE FROM funcion WHERE funcion_id = $1', [id]);
  res.status(204).end();
});

export default router;
