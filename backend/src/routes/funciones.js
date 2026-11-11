import { Router } from 'express';
import pool from '../db.js';
import { paginar, queryPaginacion } from '../utils/paginacion.js';
import { HttpError } from '../middleware/errors.js';
import { validar, idPositivo, fecha, hora, numero, booleano, lista, PARAM_ID } from '../middleware/validar.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { puedeAdministrarSucursal } from '../utils/gestores.js';
import { TTL_SEG } from '../utils/sillas.js';
import {
  MARGEN_MIN, MAX_DIAS, MAX_HORARIOS,
  moverDia, diasEnRango, fechasEntre, sumarMinutos,
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

// KAN-55 (HT16): listados paginados
const ORD_FUNCIONES = { id: 'f.funcion_id', fecha: 'f.fecha', hora: 'f.hora_inicio', precio: 'f.precio_boleto', pelicula: 'p.nombre' };
const ORDEN_FUNCIONES = 'f.fecha, f.hora_inicio, f.funcion_id';
const PAGINACION = queryPaginacion(ORD_FUNCIONES);

// Esquemas de entrada (KAN-57). Los alias (peliculaId, horaInicio, inicio, fin) vienen del backend anterior.
const PRECIO = numero({ requerido: true, mayorQue: 0, max: 1_000_000, motivo: 'debe ser un número mayor que 0 (en pesos)' });
const PELICULA_Y_SALA = {
  movieId: idPositivo({ requerido: true, alias: ['peliculaId'] }),
  salaId: idPositivo({ requerido: true }),
};
// UNA función (POST y PUT): { movieId, salaId, fecha, hora (o horaInicio), precioBoleto }
const FUNCION_UNICA = {
  ...PELICULA_Y_SALA,
  fecha: fecha({ requerido: true }),
  hora: hora({ requerido: true, alias: ['horaInicio'] }),
  precioBoleto: PRECIO,
};
// Varias a la vez: una fecha o un rango (fechaInicio y fechaFin) y una hora o una lista de horarios
const PROGRAMAR = {
  body: {
    ...PELICULA_Y_SALA,
    precioBoleto: PRECIO,
    fecha: fecha(),
    fechaInicio: fecha(),
    fechaFin: fecha(),
    hora: hora({ alias: ['horaInicio'] }),
    horarios: lista(hora(), { max: MAX_HORARIOS }),
  },
  cruzada: (d, err) => {
    const b = d.body;
    if (b.fecha) {
      b.fechas = [b.fecha];
    } else if (b.fechaInicio) {
      const fin = b.fechaFin ?? b.fechaInicio;
      if (fin < b.fechaInicio) return err('fechaFin', 'no puede ser anterior a fechaInicio');
      if (diasEnRango(b.fechaInicio, fin) > MAX_DIAS) return err('fechaFin', `el rango no puede superar ${MAX_DIAS} días`);
      b.fechas = fechasEntre(b.fechaInicio, fin);
    } else {
      return err('fecha', 'indica la fecha (fecha) o un rango (fechaInicio y fechaFin)');
    }
    const crudas = b.horarios?.length ? b.horarios : (b.hora ? [b.hora] : []);
    if (!crudas.length) return err('hora', 'indica la hora (hora) o una lista de horarios (horarios)');
    b.horas = [...new Set(crudas)].sort();
  },
};
const TODAS = { todas: booleano() };

// ¿Hay otra función en la misma sala cuyo bloque (duración + margen) choque con el nuevo?
// Bloque = desde que empieza hasta que termina la película más el margen de limpieza.
// $1 sala, $2/$3 día anterior y siguiente (para no revisar toda la tabla), $4 inicio nuevo,
// $5 minutos del bloque nuevo, $6 margen, $7 función a ignorar (la que se está editando; null si es nueva)
const SQL_CRUCE = `
  SELECT f.fecha, f.hora_inicio, p.nombre
    FROM funcion f
    JOIN pelicula p ON p.movie_id = f.movie_id
   WHERE f.sala_id = $1
     AND f.fecha BETWEEN $2 AND $3
     AND ($7::bigint IS NULL OR f.funcion_id <> $7::bigint)
     AND (f.fecha || ' ' || f.hora_inicio)::timestamp < $4::timestamp + make_interval(mins => $5::int)
     AND $4::timestamp < (f.fecha || ' ' || f.hora_inicio)::timestamp
                         + make_interval(mins => COALESCE(p.duracion_min, 0) + $6::int)`;

// Listado. Filtros opcionales: ?movieId= &salaId= &fecha=AAAA-MM-DD
router.get('/', validar({ query: { movieId: idPositivo(), salaId: idPositivo(), fecha: fecha(), ...PAGINACION } }), async (req, res) => {
  const cond = [];
  const params = [];
  if (req.datos.query.movieId != null) { params.push(req.datos.query.movieId); cond.push(`f.movie_id = $${params.length}`); }
  if (req.datos.query.salaId != null) { params.push(req.datos.query.salaId); cond.push(`f.sala_id = $${params.length}`); }
  if (req.datos.query.fecha != null) { params.push(req.datos.query.fecha); cond.push(`f.fecha = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  res.json(await paginar(pool, {
    select: `${SELECT_FUNCION} ${where}`,
    countSelect: `SELECT COUNT(*)::int AS total FROM funcion f ${where}`,
    params,
    ordenables: ORD_FUNCIONES, ordenDefecto: ORDEN_FUNCIONES, query: req.datos.query, mapear: aFuncion,
  }));
});

// Las funciones se guardan con fecha y hora de Colombia; el servidor puede estar en otra zona horaria
const ZONA = process.env.ZONA_HORARIA || 'America/Bogota';

// Ejecuta la consulta con las condiciones dadas. Salvo que se pida todas=true, solo trae las funciones
// vigentes: las que todavía no han empezado (fecha y hora de inicio posteriores a este momento).
async function consultar({ condiciones = [], params = [], todas = false, query = {} }) {
  const cond = [...condiciones];
  const p = [...params];
  if (!todas) {
    p.push(ZONA);
    // fecha/hora use formats ISO y HH:mm; al redondear al minuto se conserva el filtro temporal y el índice compuesto.
    const ahora = `(NOW() AT TIME ZONE $${p.length})`;
    const siguienteMinuto = `(date_trunc('minute', ${ahora}) + CASE
      WHEN EXTRACT(SECOND FROM ${ahora}) > 0 THEN INTERVAL '1 minute'
      ELSE INTERVAL '0 minute'
    END)`;
    cond.push(`(f.fecha, f.hora_inicio) >= (
      TO_CHAR(${siguienteMinuto}, 'YYYY-MM-DD'),
      TO_CHAR(${siguienteMinuto}, 'HH24:MI')
    )`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return paginar(pool, {
    select: `${SELECT_FUNCION} ${where}`,
    countSelect: `SELECT COUNT(*)::int AS total FROM funcion f ${where}`,
    params: p,
    ordenables: ORD_FUNCIONES, ordenDefecto: ORDEN_FUNCIONES, query, mapear: aFuncion,
  });
}

const pideTodas = (req) => req.datos.query.todas === true;

// KAN-21 (HU08): cartelera de funciones vigentes. Descarta las que ya empezaron o terminaron,
// comparando fecha Y hora con el momento actual (no solo el día).
router.get('/vigentes', validar({ query: PAGINACION }), async (req, res) => {
  res.json(await consultar({ query: req.datos.query }));
});

// KAN-22 (HU09): filtros de la cartelera. Por defecto solo muestran funciones vigentes;
// con ?todas=true incluyen también las que ya pasaron.
router.get('/pelicula/:movieId', validar({ params: { movieId: idPositivo({ requerido: true }) }, query: { ...TODAS, ...PAGINACION } }), async (req, res) => {
  const { movieId } = req.datos.params;
  const { rowCount } = await pool.query('SELECT 1 FROM pelicula WHERE movie_id = $1', [movieId]);
  if (!rowCount) throw new HttpError(404, `Película no encontrada con id: ${movieId}`, 'PELICULA_NO_ENCONTRADA');
  res.json(await consultar({ condiciones: ['f.movie_id = $1'], params: [movieId], todas: pideTodas(req), query: req.datos.query }));
});

router.get('/sala/:salaId', validar({ params: { salaId: idPositivo({ requerido: true }) }, query: { ...TODAS, ...PAGINACION } }), async (req, res) => {
  const { salaId } = req.datos.params;
  const { rowCount } = await pool.query('SELECT 1 FROM sala WHERE sala_id = $1', [salaId]);
  if (!rowCount) throw new HttpError(404, `Sala no encontrada con id: ${salaId}`, 'SALA_NO_ENCONTRADA');
  res.json(await consultar({ condiciones: ['f.sala_id = $1'], params: [salaId], todas: pideTodas(req), query: req.datos.query }));
});

// /api/funciones/rango?desde=2026-11-20&hasta=2026-11-25 (ambas fechas incluidas).
// También acepta inicio y fin, los nombres que usaba el backend anterior.
router.get('/rango', validar({
  query: { desde: fecha({ requerido: true, alias: ['inicio'] }), hasta: fecha({ requerido: true, alias: ['fin'] }), ...TODAS, ...PAGINACION },
  cruzada: (d, err) => { if (d.query.hasta < d.query.desde) err('hasta', 'no puede ser anterior a desde', 'query'); },
}), async (req, res) => {
  const { desde, hasta } = req.datos.query;
  res.json(await consultar({ condiciones: ['f.fecha BETWEEN $1 AND $2'], params: [desde, hasta], todas: pideTodas(req), query: req.datos.query }));
});

router.get('/:id', validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  const { rows } = await pool.query(`${SELECT_FUNCION} WHERE f.funcion_id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Función no encontrada con id: ${id}`, 'FUNCION_NO_ENCONTRADA');
  res.json(aFuncion(rows[0]));
});

// Crea las funciones (todas o ninguna): valida película y sala, revisa permisos de sucursal
// y que no se crucen en la sala. Devuelve las funciones creadas.
async function crearFunciones(user, { movieId, salaId, fechas, horas, precio }) {
  const { rows: ps } = await pool.query('SELECT movie_id, nombre, duracion_min FROM pelicula WHERE movie_id = $1', [movieId]);
  if (!ps[0]) throw new HttpError(404, `Película no encontrada con id: ${movieId}`, 'PELICULA_NO_ENCONTRADA');
  if (!ps[0].duracion_min) throw new HttpError(400, 'La película no tiene duración registrada; edítala antes de programarla.', 'PELICULA_SIN_DURACION');
  const duracion = ps[0].duracion_min;

  const { rows: ss } = await pool.query('SELECT sala_id, nombre, capacidad, sucursal_id FROM sala WHERE sala_id = $1', [salaId]);
  if (!ss[0]) throw new HttpError(404, `Sala no encontrada con id: ${salaId}`, 'SALA_NO_ENCONTRADA');
  const sala = ss[0];

  // Un GESTOR solo programa en las salas de su sucursal
  if (!(await puedeAdministrarSucursal(user, sala.sucursal_id))) {
    throw new HttpError(403, 'Esta sala pertenece a otra sucursal. Solo puedes programar en la tuya.', 'SALA_OTRA_SUCURSAL');
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
          salaId, moverDia(fecha, -1), moverDia(fecha, 1), `${fecha} ${hora}`, duracion + MARGEN_MIN, MARGEN_MIN, null,
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
        `Cruce de horarios en la sala «${sala.nombre}» (cada función necesita ${duracion} min + ${MARGEN_MIN} min de descanso): ${muestra}${mas}. No se creó ninguna función.`, 'FUNCION_CRUCE_HORARIOS');
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(`${SELECT_FUNCION} WHERE f.funcion_id = ANY($1::bigint[]) ${ORDEN}`, [ids]);
  return rows.map(aFuncion);
}

// KAN-20 (HU07): programar una función (película + sala + horario), sin cruces en la sala.
// Una función:   { "movieId": 1, "salaId": 2, "fecha": "2026-11-20", "hora": "19:00", "precioBoleto": 18000 }
// Varias a la vez: { "movieId", "salaId", "fechaInicio", "fechaFin", "horarios": ["15:00","19:00"], "precioBoleto" }
// Es todo o nada: si una sola se cruza, no se crea ninguna.
router.post('/programar', ...admins, validar(PROGRAMAR), async (req, res) => {
  const { movieId, salaId, precioBoleto: precio, fechas, horas } = req.datos.body;

  const funciones = await crearFunciones(req.user, { movieId, salaId, fechas, horas, precio });
  res.status(201).json({ creadas: funciones.length, funciones });
});

// POST /api/funciones: crea UNA función. Mismos permisos y mismas reglas que /programar.
// Cuerpo: { "movieId": 1, "salaId": 2, "fecha": "2026-11-20", "hora": "19:00", "precioBoleto": 18000 }
router.post('/', ...admins, validar({ body: FUNCION_UNICA }), async (req, res) => {
  const n = req.datos.body;
  const [funcion] = await crearFunciones(req.user, { movieId: n.movieId, salaId: n.salaId, fechas: [n.fecha], horas: [n.hora], precio: n.precioBoleto });
  res.status(201).json(funcion);
});

// PUT /api/funciones/{id}: edita película, sala, fecha, hora y precio (se envían todos).
// - Si la función ya tiene reservas vigentes solo se puede cambiar el precio (las reservas guardan su total).
// - Si hay clientes con sillas bloqueadas en este momento, se pide intentar de nuevo en unos minutos.
// - Si cambia la sala, las sillas se regeneran con la matriz de la sala nueva y los asientos pasan a su capacidad.
// - La sala debe estar libre en el nuevo horario (sin contar la propia función).
router.put('/:id', ...admins, validar({ ...PARAM_ID, body: FUNCION_UNICA }), async (req, res) => {
  const { id } = req.datos.params;
  const n = req.datos.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: fs } = await client.query(
      `SELECT f.movie_id, f.sala_id, f.fecha, f.hora_inicio, sa.sucursal_id
         FROM funcion f JOIN sala sa ON sa.sala_id = f.sala_id
        WHERE f.funcion_id = $1 FOR UPDATE OF f`, [id]);
    const actual = fs[0];
    if (!actual) throw new HttpError(404, `Función no encontrada con id: ${id}`, 'FUNCION_NO_ENCONTRADA');
    if (!(await puedeAdministrarSucursal(req.user, actual.sucursal_id))) {
      throw new HttpError(403, 'Esta función es de otra sucursal.', 'FUNCION_OTRA_SUCURSAL');
    }

    const { rows: ps } = await client.query('SELECT duracion_min FROM pelicula WHERE movie_id = $1', [n.movieId]);
    if (!ps[0]) throw new HttpError(404, `Película no encontrada con id: ${n.movieId}`, 'PELICULA_NO_ENCONTRADA');
    if (!ps[0].duracion_min) throw new HttpError(400, 'La película no tiene duración registrada; edítala antes de programarla.', 'PELICULA_SIN_DURACION');
    const duracion = ps[0].duracion_min;

    // Bloquea la sala destino (igual que al programar) para que dos cambios simultáneos se turnen
    const { rows: ss } = await client.query('SELECT sala_id, nombre, capacidad, sucursal_id FROM sala WHERE sala_id = $1 FOR UPDATE', [n.salaId]);
    if (!ss[0]) throw new HttpError(404, `Sala no encontrada con id: ${n.salaId}`, 'SALA_NO_ENCONTRADA');
    const sala = ss[0];
    if (!(await puedeAdministrarSucursal(req.user, sala.sucursal_id))) {
      throw new HttpError(403, 'Esa sala pertenece a otra sucursal. Solo puedes usar las de la tuya.', 'SALA_OTRA_SUCURSAL');
    }

    const cambiaSala = Number(actual.sala_id) !== n.salaId;
    const cambiaDatos = cambiaSala || Number(actual.movie_id) !== n.movieId
      || actual.fecha !== n.fecha || actual.hora_inicio !== n.hora;

    if (cambiaDatos) {
      const { rows: rs } = await client.query(
        `SELECT COUNT(*)::int AS n FROM reserva WHERE funcion_id = $1 AND estado <> 'CANCELADA'`, [id]);
      if (rs[0].n > 0) {
        throw new HttpError(409, `No se puede cambiar película, sala, fecha ni hora: la función tiene ${rs[0].n} reserva(s) vigente(s). Solo puedes cambiar el precio.`, 'FUNCION_CON_RESERVAS');
      }
      const { rows: bs } = await client.query(
        `SELECT COUNT(*)::int AS n FROM silla
          WHERE funcion_id = $1 AND estado = 'RESERVADA' AND reserva_id IS NULL AND bloqueado_en IS NOT NULL
            AND bloqueado_en >= LOCALTIMESTAMP - make_interval(secs => $2::float8)`, [id, TTL_SEG]);
      if (bs[0].n > 0) {
        throw new HttpError(409, `Hay ${bs[0].n} silla(s) bloqueada(s) por clientes que están comprando. Intenta de nuevo en unos minutos.`, 'FUNCION_CON_SILLAS_BLOQUEADAS');
      }
      const { rows: cr } = await client.query(SQL_CRUCE, [
        n.salaId, moverDia(n.fecha, -1), moverDia(n.fecha, 1), `${n.fecha} ${n.hora}`, duracion + MARGEN_MIN, MARGEN_MIN, id,
      ]);
      if (cr.length) {
        throw new HttpError(409,
          `Cruce de horarios en la sala «${sala.nombre}»: ${n.fecha} ${n.hora} choca con «${cr[0].nombre}» de las ${cr[0].hora_inicio} del ${cr[0].fecha} (cada función necesita ${duracion} min + ${MARGEN_MIN} min de descanso).`, 'FUNCION_CRUCE_HORARIOS');
      }
      if (cambiaSala) {
        // Las sillas eran las de la sala anterior: se borran y se regeneran la próxima vez que se consulte el mapa
        await client.query('DELETE FROM silla WHERE funcion_id = $1', [id]);
        await client.query('UPDATE funcion SET capacidad_total = $1, asientos_disponibles = $1 WHERE funcion_id = $2', [sala.capacidad, id]);
      }
    }

    await client.query(
      `UPDATE funcion SET movie_id = $1, sala_id = $2, fecha = $3, hora_inicio = $4, precio_boleto = $5
        WHERE funcion_id = $6`, [n.movieId, n.salaId, n.fecha, n.hora, n.precioBoleto, id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(`${SELECT_FUNCION} WHERE f.funcion_id = $1`, [id]);
  res.json(aFuncion(rows[0]));
});

router.delete('/:id', ...admins, validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  const { rows } = await pool.query(
    `SELECT f.funcion_id, sa.sucursal_id FROM funcion f JOIN sala sa ON sa.sala_id = f.sala_id WHERE f.funcion_id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `Función no encontrada con id: ${id}`, 'FUNCION_NO_ENCONTRADA');
  if (!(await puedeAdministrarSucursal(req.user, rows[0].sucursal_id))) {
    throw new HttpError(403, 'Esta función es de otra sucursal.', 'FUNCION_OTRA_SUCURSAL');
  }
  // No borrar una función que ya tiene reservas vigentes
  const { rows: rs } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM reserva WHERE funcion_id = $1 AND estado <> 'CANCELADA'`, [id]);
  if (rs[0].n > 0) throw new HttpError(409, `No se puede eliminar: la función tiene ${rs[0].n} reserva(s) vigente(s).`, 'FUNCION_CON_RESERVAS');
  await pool.query('DELETE FROM funcion WHERE funcion_id = $1', [id]);
  res.status(204).end();
});

export default router;
