// Paginación, filtros y ordenamiento de los listados (KAN-55, HT16).
//
// Los GET de colección aceptan ?page=1&size=20&sort=fecha,desc y responden:
//   { "content": [...], "page": 1, "size": 20, "totalElementos": 135, "totalPaginas": 7 }
// - page empieza en 1; size por defecto 20 y máximo 100 (si piden más, se usa 100).
// - sort = campo[,asc|desc]. Solo se aceptan los campos que cada listado declara como ordenables.
import { entero, personalizada } from '../middleware/validar.js';

export const TAM_DEFECTO = 20;
export const TAM_MAX = 100;

// Esquema de query para validar(): { query: queryPaginacion(ORDENABLES) }
export const queryPaginacion = (ordenables) => ({
  page: entero({ min: 1, motivo: 'debe ser un entero mayor o igual a 1' }),
  size: entero({ min: 1, motivo: 'debe ser un entero mayor o igual a 1' }),
  sort: personalizada((v) => {
    if (v === null || (typeof v === 'string' && v.trim() === '')) return { valor: null };
    const permitidos = Object.keys(ordenables).join(', ');
    if (typeof v !== 'string') return { error: `usa campo,asc o campo,desc; campos: ${permitidos}` };
    const [campo, dir = 'asc', ...resto] = v.split(',').map((s) => s.trim());
    if (resto.length || !Object.hasOwn(ordenables, campo)) return { error: `campo no ordenable; usa uno de: ${permitidos}` };
    const d = dir.toLowerCase();
    if (d !== 'asc' && d !== 'desc') return { error: 'la dirección debe ser asc o desc' };
    return { valor: { campo, dir: d } };
  }),
});

// Ejecuta la consulta paginada.
//   select       SELECT ... FROM ... [WHERE ...]  (sin ORDER BY ni LIMIT)
//   params       parámetros de ese SELECT
//   ordenables   { nombreExterno: 'columna SQL' } (lista blanca: nunca se arma SQL con lo que escribe el usuario)
//   ordenDefecto 'col1, col2 DESC': orden por defecto y desempate
//   query        req.datos.query ya validado
//   mapear       función fila -> objeto de respuesta
export async function paginar(db, { select, params = [], ordenables, ordenDefecto, query, mapear = (r) => r }) {
  const page = query.page ?? 1;
  const size = Math.min(query.size ?? TAM_DEFECTO, TAM_MAX);
  const { rows: [{ total }] } = await db.query(`SELECT COUNT(*)::int AS total FROM (${select}) AS q`, params);
  const orden = query.sort
    ? `${ordenables[query.sort.campo]} ${query.sort.dir === 'desc' ? 'DESC' : 'ASC'}, ${ordenDefecto}`
    : ordenDefecto;
  const { rows } = await db.query(
    `${select} ORDER BY ${orden} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, (page - 1) * size]
  );
  return { content: rows.map(mapear), page, size, totalElementos: total, totalPaginas: Math.ceil(total / size) };
}
