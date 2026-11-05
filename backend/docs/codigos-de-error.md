# Códigos de error de la API

Toda respuesta de error (KAN-54, HT15) tiene el mismo cuerpo:

```json
{
  "timestamp": "2026-11-05T18:30:00.000Z",
  "status": 409,
  "error": "Esta reserva ya está pagada.",
  "code": "RESERVA_YA_PAGADA",
  "path": "/api/v1/pagos"
}
```

- `code` es el identificador **estable**: el frontend debe decidir con él, no con el texto de `error`, que puede cambiar.
- Las rutas están en `/api/v1`; `/api` se mantiene como alias mientras se migran los clientes.
- Si un error no trae código propio, se usa el de su estado: `SOLICITUD_INVALIDA` (400), `NO_AUTENTICADO` (401), `ACCESO_DENEGADO` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409), `DEMASIADAS_PETICIONES` (429), `ERROR_INTERNO` (500).
- Para agregar un código nuevo: `throw new HttpError(409, 'Mensaje.', 'NUEVO_CODIGO')` y añadirlo a esta tabla.

| Status | Código | Ejemplo de mensaje |
|---|---|---|
| 400 | `CAMPO_DEMASIADO_LARGO` | nombre: máximo 255 caracteres. |
| 400 | `CEDULA_YA_REGISTRADA` | La cédula '{cedula}' ya está registrada. |
| 400 | `CINE_REQUERIDO` | Debes indicar el cine de la sucursal. |
| 400 | `CLIENTE_NO_REGISTRADO` | Primero registra tus datos de cliente (POST /api/clientes). |
| 400 | `DATOS_INVALIDOS` | Uno o más campos no cumplen las reglas; el mensaje los lista. |
| 400 | `EMAIL_YA_REGISTRADO` | El email '{email}' ya está registrado. |
| 400 | `FECHA_FORMATO_INVALIDO` | {campo}: usa el formato AAAA-MM-DD. |
| 400 | `FECHA_INVALIDA` | {campo}: no es una fecha válida. |
| 400 | `FECHA_REQUERIDA` | Indica la fecha (fecha) o un rango (fechaInicio y fechaFin). |
| 400 | `GESTOR_YA_ASIGNADO` | El usuario ya está asignado a una sucursal ({ya[0].bran_location}). Quita esa asign |
| 400 | `HORARIOS_EXCEDE_MAXIMO` | Máximo {MAX_HORARIOS} horarios por día. |
| 400 | `HORA_FORMATO_INVALIDO` | {campo}: usa el formato HH:mm (24 horas), por ejemplo 19:30. |
| 400 | `HORA_REQUERIDA` | Indica la hora (hora) o una lista de horarios (horarios). |
| 400 | `ID_INVALIDO` | El id (o un campo de id) no es un número positivo. |
| 400 | `JSON_INVALIDO` | El cuerpo de la petición no es un JSON válido. |
| 400 | `PASSWORD_ACTUAL_INCORRECTA` | La contraseña actual es incorrecta. |
| 400 | `PASSWORD_IGUAL_A_ACTUAL` | passwordNueva: debe ser distinta a la actual |
| 400 | `PELICULA_SIN_DURACION` | La película no tiene duración registrada; edítala antes de programarla. |
| 400 | `POSTER_CONTENIDO_INVALIDO` | posterUrl: el contenido no es una imagen {m[1].slice(6).toUpperCase()} válida. |
| 400 | `POSTER_DEMASIADO_GRANDE` | El póster supera el máximo de 2 MB. |
| 400 | `POSTER_ENLACE_INVALIDO` | posterUrl: el enlace no es válido. |
| 400 | `POSTER_FORMATO_INVALIDO` | 'posterUrl: debe ser una imagen PNG, JPEG o WEBP en Base64 (data:image/...;base64,... |
| 400 | `POSTER_OBLIGATORIO` | posterUrl: es obligatorio. |
| 400 | `PRECIO_INVALIDO` | precioBoleto: debe ser un número mayor que 0 (en pesos). |
| 400 | `RANGO_EXCEDE_MAXIMO` | El rango no puede superar {MAX_DIAS} días. |
| 400 | `RANGO_FECHAS_INVALIDO` | Rango de fechas inválido (por ejemplo, "desde" posterior a "hasta"). |
| 400 | `REGISTRO_DUPLICADO` | Ya existe un registro con esos datos (restricción UNIQUE). |
| 400 | `ROL_INVALIDO` | rol: debe ser {ROLES.join(', ')} |
| 400 | `SILLAS_EXCEDE_MAXIMO` | {campo}: máximo {MAX_SILLAS_POR_BLOQUEO} sillas por solicitud. |
| 400 | `SILLAS_REQUERIDAS` | {campo}: indica al menos una silla, por ejemplo ["A1","A2"]. |
| 400 | `SILLA_CODIGO_INVALIDO` | {campo}: "{String(c).slice(0, 20)}" no es un código de silla válido (ejemplo: A1). |
| 400 | `SIN_CAMPOS_PARA_ACTUALIZAR` | Envía al menos un campo: {Object.keys(CAMPOS_PERFIL).join(', ')} |
| 400 | `TARJETA_INVALIDA` | numeroTarjeta: debe tener entre 13 y 19 dígitos. |
| 400 | `TIPO_PAGO_INVALIDO` | tipoPago: debe ser uno de {TIPOS_PAGO.join(', ')}. |
| 400 | `TIPO_SALA_INVALIDO` | Tipo de sala invalido: ' + req.params.tipo + '. Valores validos: PRO, 3D, 2D |
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
| 409 | `SILLAS_NO_DISPONIBLES` | No se pudo reservar o bloquear: alguna silla ya no está disponible; no se tomó ninguna. |
| 409 | `SILLAS_OCUPADAS` | La(s) silla(s) {ocupadas.join(', ')} ya está(n) ocupada(s) y no se puede(n) liberar |
| 409 | `SUCURSAL_CON_DATOS_ASOCIADOS` | No se puede eliminar: la sucursal tiene datos asociados. |
| 413 | `CUERPO_DEMASIADO_GRANDE` | El cuerpo de la petición supera el límite permitido. |
| 429 | `CAMBIO_PASSWORD_BLOQUEADO` | Demasiados intentos fallidos. Intenta en {espera} segundos. |
| 429 | `DEMASIADAS_PETICIONES` | Se superó el límite global de peticiones por IP; mira el encabezado Retry-After. |
| 429 | `LOGIN_BLOQUEADO` | Demasiados intentos fallidos. Intenta en {espera} segundos. |
| 500 | `ERROR_INTERNO` | Error inesperado del servidor (el detalle solo queda en el log). |
| 503 | `BD_NO_DISPONIBLE` | La base de datos no responde (GET /api/v1/health). |
