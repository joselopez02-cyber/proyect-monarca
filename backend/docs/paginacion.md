# Paginación, filtros y ordenamiento (KAN-55)

Estos listados devuelven una página en vez de todas las filas:

`GET /cines`, `/peliculas`, `/funciones` (y `/funciones/vigentes`, `/pelicula/:id`, `/sala/:id`, `/rango`), `/reservas`,
`/transacciones` (y `/transacciones/cliente/:id`), `/usuarios` y `/clientes`.

## Parámetros
| Parámetro | Significado | Por defecto |
|---|---|---|
| `page` | número de página (desde 1) | 1 |
| `size` | filas por página | 20 (máximo 100; si piden más se usa 100) |
| `sort` | `campo` o `campo,asc` / `campo,desc` | orden propio de cada listado |

Los filtros que ya existían (`nombre`, `movieId`, `salaId`, `fecha`, `desde`, `hasta`, `todas`, `email`) siguen funcionando y se combinan con la paginación.

## Respuesta
```json
{
  "content": [ { "...": "..." } ],
  "page": 1,
  "size": 20,
  "totalElementos": 135,
  "totalPaginas": 7
}
```
Una página fuera de rango devuelve `content: []` con los mismos totales.

## Campos ordenables
| Listado | Campos |
|---|---|
| cines | id, nombre |
| peliculas | id, nombre, duracion, genero |
| funciones | id, fecha, hora, precio, pelicula |
| reservas | id, fecha, total, estado, creado |
| transacciones | id, fecha, monto, estado |
| usuarios | id, username, rol, creado |
| clientes | id, nombre |

Un campo que no está en la lista, una dirección distinta de asc/desc o un `page`/`size` menor que 1 responden **400** con `code: "DATOS_INVALIDOS"` (ver KAN-57).

## Ejemplo
`GET /api/v1/funciones?page=2&size=10&sort=fecha,desc`

## Frontend
La función `api()` de `frontend/src/services/api.js` recoge sola todas las páginas de un GET de listado y entrega el arreglo completo, así las pantallas siguen funcionando igual. Si la ruta ya trae `page` o `size`, entrega la respuesta con sus metadatos.
