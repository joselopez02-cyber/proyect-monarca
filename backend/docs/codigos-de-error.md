# Códigos de error de la API

Toda respuesta de error (KAN-54, HT15) tiene el mismo cuerpo:

```json
{
  "timestamp": "2026-11-05T18:30:00.000Z",
  "status": 409,
  "error": "Esta reserva ya está pagada.",
  "code": "RESERVA_YA_PAGADA",
  "path": "/api/v1/pagos/procesar"
}
```

- `code` es el identificador **estable**: el frontend debe decidir con él, no con el texto de `error`, que puede cambiar.
- Las rutas están en `/api/v1`; `/api` se mantiene como alias mientras se migran los clientes.
- Si un error no trae código propio, se usa el de su estado: `SOLICITUD_INVALIDA` (400), `NO_AUTENTICADO` (401), `ACCESO_DENEGADO` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409), `DEMASIADAS_PETICIONES` (429), `ERROR_INTERNO` (500).

## Errores de validación (KAN-57, HT18)

Todo endpoint que recibe datos (cuerpo, parámetros de la ruta o query string) los valida con el mismo mecanismo (`backend/src/middleware/validar.js`).
Si algún campo no cumple, responde **400** con `code: "DATOS_INVALIDOS"` y la lista completa de campos inválidos en `errores`:

```json
{
  "timestamp": "2026-11-05T18:30:00.000Z",
  "status": 400,
  "error": "nombre: es obligatorio, duracionMin: debe ser un entero entre 1 y 600 minutos",
  "code": "DATOS_INVALIDOS",
  "path": "/api/v1/peliculas",
  "errores": [
    { "campo": "nombre", "motivo": "es obligatorio", "en": "body" },
    { "campo": "duracionMin", "motivo": "debe ser un entero entre 1 y 600 minutos", "en": "body" }
  ]
}
```

- `campo`: nombre del campo (en una lista, con su posición: `horarios[1]`). `motivo`: por qué no es válido. `en`: `body`, `params` o `query`.
- Se revisan **todos** los campos y se devuelven juntos, no solo el primero. Los campos que no están en el esquema se ignoran.
- Las reglas que dependen de la base de datos (que exista, que no esté repetido, permisos) no son de validación: tienen sus propios códigos (tabla de abajo).

Para validar un endpoint nuevo se declara un esquema y los valores ya limpios llegan en `req.datos`:

```js
import { validar, texto, entero } from '../middleware/validar.js';

router.post('/', validar({ body: { nombre: texto({ requerido: true, max: 255 }), edad: entero({ min: 0, max: 120 }) } }), async (req, res) => {
  const { nombre, edad } = req.datos.body;
});
```

Reglas disponibles: `texto`, `clave`, `entero`, `idPositivo`, `numero`, `correo`, `fecha`, `hora`, `enumerado`, `booleano`, `lista` y `personalizada`. Las reglas entre varios campos van en `cruzada`.

## Códigos

Para agregar un código nuevo: `throw new HttpError(409, 'Mensaje.', 'NUEVO_CODIGO')` y añadirlo a esta tabla.

| Status | Código | Ejemplo de mensaje |
|---|---|---|
| 400 | `CEDULA_YA_REGISTRADA` | La cédula '{cedula}' ya está registrada. |
| 400 | `CLIENTE_NO_REGISTRADO` | Primero registra tus datos de cliente (POST /api/clientes). |
| 400 | `DATOS_INVALIDOS` | Uno o más campos no cumplen las reglas; la lista completa viene en "errores". |
| 400 | `EMAIL_YA_REGISTRADO` | El email '{email}' ya está registrado. |
| 400 | `GESTOR_YA_ASIGNADO` | El usuario ya está asignado a una sucursal ({ya[0].bran_location}). Quita esa asign |
| 400 | `JSON_INVALIDO` | El cuerpo de la petición no es un JSON válido. |
| 400 | `PASSWORD_ACTUAL_INCORRECTA` | La contraseña actual es incorrecta. |
| 400 | `PELICULA_SIN_DURACION` | La película no tiene duración registrada; edítala antes de programarla. |
| 400 | `REGISTRO_DUPLICADO` | Ya existe un registro con esos datos (restricción UNIQUE). |
| 400 | `USERNAME_EN_USO` | El username '{username}' ya está en uso. |
| 400 | `USUARIO_DESACTIVADO` | El usuario está desactivado. |
| 400 | `USUARIO_NO_ES_GESTOR` | Solo se puede asignar un usuario con rol GESTOR. Cambia su rol primero. |
| 401 | `CREDENCIALES_INVALIDAS` | Credenciales inválidas |
| 401 | `TOKEN_INVALIDO` | Token inválido o expirado. |
| 401 | `TOKEN_REQUERIDO` | Token requerido. Inicia sesión. |
| 403 | `CLIENTE_AJENO` | No puedes ver ni modificar los datos de otro cliente. |
| 403 | `CORS_ORIGEN_NO_PERMITIDO` | Origen no permitido por CORS. |
| 403 | `FUNCION_OTRA_SUCURSAL` | Esta función es de otra sucursal. |
| 403 | `GESTOR_SIN_SUCURSAL` | No tienes una sucursal asignada. Pide al administrador que te asigne una. |
| 403 | `PERFIL_AJENO` | No puedes modificar el perfil de otro usuario. |
| 403 | `PERMISO_DENEGADO` | No tienes permiso para esta operación. |
| 403 | `RESERVA_AJENA` | Esta reserva es de otro cliente. |
| 403 | `RESERVA_A_NOMBRE_DE_OTRO` | No puedes crear reservas a nombre de otro cliente. |
| 403 | `SALA_OTRA_SUCURSAL` | Esta sala pertenece a otra sucursal. Solo puedes programar en la tuya. |
| 403 | `SILLAS_BLOQUEADAS_POR_OTRO` | La(s) silla(s) {deOtro.join(', ')} está(n) bloqueada(s) por otro cliente. |
| 404 | `CINE_NO_ENCONTRADO` | 'Cine no encontrado con id: ' + id |
| 404 | `CLIENTE_NO_ENCONTRADO` | Cliente no encontrado con id: {id} |
| 404 | `FUNCION_NO_ENCONTRADA` | Función no encontrada con id: {id} |
| 404 | `GESTOR_NO_ENCONTRADO` | Gestor no encontrado con id: {id} |
| 404 | `PELICULA_NO_ENCONTRADA` | Película no encontrada con id: {movieId} |
| 404 | `POSTER_NO_ENCONTRADO` | Esta película no tiene póster. |
| 404 | `RESERVA_NO_ENCONTRADA` | Reserva no encontrada con id: {resCode} |
| 404 | `RUTA_NO_ENCONTRADA` | La ruta pedida no existe. |
| 404 | `SALA_NO_ENCONTRADA` | Sala no encontrada con id: {salaId} |
| 404 | `SILLA_NO_ENCONTRADA` | La(s) silla(s) {faltan.join(', ')} no existe(n) en esta función. |
| 404 | `SUCURSAL_NO_ENCONTRADA` | Sucursal no encontrada con id: {sid} |
| 404 | `USUARIO_NO_ENCONTRADO` | Usuario no encontrado con id: {uid} |
| 409 | `CINE_CON_DATOS_ASOCIADOS` | No se puede eliminar: el cine tiene datos asociados. |
| 409 | `CLIENTE_CON_RESERVAS` | No se puede eliminar: el cliente tiene {rows[0].n} reserva(s). |
| 409 | `CLIENTE_YA_REGISTRADO` | Ya tienes tus datos de cliente registrados (custId {rows[0].cust_id}). Actualízalos |
| 409 | `FUNCION_CON_RESERVAS` | No se puede cambiar película, sala, fecha ni hora: la función tiene {rs[0].n} reser |
| 409 | `FUNCION_CON_SILLAS_BLOQUEADAS` | Hay {bs[0].n} silla(s) bloqueada(s) por clientes que están comprando. Intenta de nu |
| 409 | `FUNCION_CRUCE_HORARIOS` | Cruce de horarios en la sala «{sala.nombre}» (cada función necesita {duracion} min |
| 409 | `FUNCION_YA_COMENZO` | Esta función ya comenzó; no se puede reservar. |
| 409 | `PELICULA_CON_FUNCIONES` | No se puede eliminar: la película tiene {rows[0].n} función(es) programada(s). |
| 409 | `RESERVA_CANCELADA` | Esta reserva está cancelada: no se puede pagar. |
| 409 | `RESERVA_NO_CANCELABLE` | Esta función ya comenzó; la reserva ya no se puede cancelar. |
| 409 | `RESERVA_SIN_TOTAL` | Esta reserva no tiene un total por pagar. |
| 409 | `RESERVA_YA_CANCELADA` | La reserva ya estaba cancelada. |
| 409 | `RESERVA_YA_PAGADA` | Esta reserva ya está pagada. |
| 409 | `SALA_CON_DATOS_ASOCIADOS` | No se puede eliminar: la sala tiene datos asociados. |
| 409 | `SILLAS_NO_DISPONIBLES` | No se pudo crear la reserva, {partes.join('; ')}. No se reservó ninguna silla. |
| 409 | `SILLAS_OCUPADAS` | La(s) silla(s) {ocupadas.join(', ')} ya está(n) ocupada(s) y no se puede(n) liberar |
| 409 | `SUCURSAL_CON_DATOS_ASOCIADOS` | No se puede eliminar: la sucursal tiene datos asociados. |
| 413 | `CUERPO_DEMASIADO_GRANDE` | El cuerpo de la petición supera el límite permitido. |
| 429 | `CAMBIO_PASSWORD_BLOQUEADO` | Demasiados intentos fallidos. Intenta en {espera} segundos. |
| 429 | `DEMASIADAS_PETICIONES` | Se superó el límite global de peticiones por IP; mira el encabezado Retry-After. |
| 429 | `LOGIN_BLOQUEADO` | Demasiados intentos fallidos. Intenta en {espera} segundos. |
| 500 | `ERROR_INTERNO` | Error inesperado del servidor (el detalle solo queda en el log). |
| 503 | `BD_NO_DISPONIBLE` | La base de datos no responde (GET /api/v1/health). |
