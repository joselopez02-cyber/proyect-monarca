import pool from '../db.js';
import { fecha } from '../middleware/validar.js';
import { ZONA } from './horarios.js';

// KAN-42 (HU24): reporte de ventas. Lo usan la pantalla (GET /api/reportes/ventas) y,
// en HU28, el CSV: ambos salen de esta misma consulta, así filas y totales siempre coinciden.
//
// Reglas:
//  - Solo cuentan transacciones APROBADAS.
//  - ingresos   = pagos (tipo PAGO); reembolsos = tipo REEMBOLSO (HU22); neto = ingresos - reembolsos.
//  - boletas    = sillas de la reserva (reserva.sillas_texto); las de un reembolso se restan.
//  - El rango filtra por la fecha de la transacción en hora de Colombia, con ambos extremos inclusivos.
//  - Se agrupa por función; las filas salen ordenadas por película, fecha y hora.

// Esquema del validador para ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (se usa en la pantalla y en el CSV)
export const RANGO_FECHAS = {
  query: { desde: fecha({ requerido: true }), hasta: fecha({ requerido: true }) },
  cruzada: (d, err) => {
    if (d.query.desde > d.query.hasta) err('desde', 'no puede ser posterior a hasta', 'query');
  },
};

// Dinero en centavos enteros para que las sumas no arrastren errores de decimales
const centavos = (v) => Math.round(Number(v || 0) * 100);

// Convierte las filas de la consulta (una por función) en el reporte: detalle, subtotales por película y totales
export function armarReporte(rows, { desde, hasta }) {
  const porPelicula = new Map();
  const filas = rows.map((r) => {
    const ingresos = centavos(r.ingresos);
    const reembolsos = centavos(r.reembolsos);
    const fila = {
      peliculaId: Number(r.movie_id),
      pelicula: r.pelicula,
      funcionId: Number(r.funcion_id),
      fecha: r.fecha,
      horaInicio: r.hora_inicio,
      sala: r.sala,
      boletas: Number(r.boletas),
      ingresos: ingresos / 100,
      reembolsos: reembolsos / 100,
      neto: (ingresos - reembolsos) / 100,
    };
    const p = porPelicula.get(fila.peliculaId)
      ?? { peliculaId: fila.peliculaId, pelicula: fila.pelicula, boletas: 0, ingresos: 0, reembolsos: 0 };
    p.boletas += fila.boletas;
    p.ingresos += ingresos;
    p.reembolsos += reembolsos;
    porPelicula.set(fila.peliculaId, p);
    return fila;
  });

  const cierre = (x) => ({ ...x, ingresos: x.ingresos / 100, reembolsos: x.reembolsos / 100, neto: (x.ingresos - x.reembolsos) / 100 });
  const peliculas = [...porPelicula.values()].map(cierre);
  const totales = cierre(peliculas.reduce(
    (t, p) => ({
      boletas: t.boletas + p.boletas,
      ingresos: t.ingresos + centavos(p.ingresos),
      reembolsos: t.reembolsos + centavos(p.reembolsos),
    }),
    { boletas: 0, ingresos: 0, reembolsos: 0 },
  ));

  return { desde, hasta, filas, porPelicula: peliculas, totales };
}

export async function consultarVentas(rango) {
  const { rows } = await pool.query(
    `WITH mov AS (
       SELECT t.tipo_trans, t.pago_total, r.funcion_id,
              COALESCE(cardinality(string_to_array(NULLIF(r.sillas_texto, ''), ',')), 0) AS boletas
         FROM transaccion t
         JOIN reserva r ON r.res_code = t.res_code
        WHERE t.estado_pago = 'APROBADO'
          AND ((t.fecha_trans AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $3::text)::date
              BETWEEN $1::date AND $2::date
     )
     SELECT f.funcion_id, f.fecha, f.hora_inicio, p.movie_id, p.nombre AS pelicula, sa.nombre AS sala,
            COALESCE(SUM(CASE WHEN m.tipo_trans = 'PAGO' THEN m.boletas ELSE -m.boletas END), 0) AS boletas,
            COALESCE(SUM(m.pago_total) FILTER (WHERE m.tipo_trans = 'PAGO'), 0)       AS ingresos,
            COALESCE(SUM(m.pago_total) FILTER (WHERE m.tipo_trans = 'REEMBOLSO'), 0)  AS reembolsos
       FROM mov m
       JOIN funcion  f  ON f.funcion_id = m.funcion_id
       JOIN pelicula p  ON p.movie_id   = f.movie_id
       LEFT JOIN sala sa ON sa.sala_id  = f.sala_id
      GROUP BY f.funcion_id, f.fecha, f.hora_inicio, p.movie_id, p.nombre, sa.nombre
      ORDER BY p.nombre, f.fecha, f.hora_inicio, f.funcion_id`,
    [rango.desde, rango.hasta, ZONA]);
  return armarReporte(rows, rango);
}
