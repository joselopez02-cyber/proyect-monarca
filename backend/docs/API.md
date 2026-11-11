# Referencia de la API REST

Esta referencia describe las rutas registradas por Express. La versión vigente es `/api/v1`; `/api` es un alias de compatibilidad que acepta los mismos métodos, cuerpos y permisos. Todas las rutas de la tabla son JSON salvo que se indique CSV o `204 No Content`.

## Acceso y formato

- Base local: `http://localhost:8080/api/v1`; en producción usa el dominio HTTPS de Render.
- Envía `Content-Type: application/json` cuando el endpoint recibe un cuerpo.
- Las rutas protegidas requieren `Authorization: Bearer <token>`. Obtén el token con `POST /auth/login` o `POST /auth/register`.
- Roles: `USER` (cliente), `GESTOR` (responsable de una sucursal) y `ADMIN` (administración). Los roles se verifican en el servidor; cambiar el rol enviado por el cliente no concede permisos.
- Los IDs de ruta deben ser enteros positivos. Las fechas usan `AAAA-MM-DD`; las horas, `HH:mm` de 24 horas.
- Los listados paginados aceptan `page` (desde 1), `size` (20 por defecto, máximo efectivo 100) y `sort=campo,asc|desc`. Responden `{ "content": [], "page": 1, "size": 20, "totalElementos": 0, "totalPaginas": 0 }`. Los campos permitidos por listado se indican en [paginación](./paginacion.md).
- Los campos no descritos se ignoran por la validación del servidor. Los alias de compatibilidad se señalan en las rutas aplicables.

## Errores

Los errores siguen este formato. `errores` aparece en respuestas de validación y agrupa todos los campos incorrectos:

```json
{
  "timestamp": "2026-11-11T20:00:00.000Z",
  "status": 400,
  "error": "funcionId: debe ser un número positivo",
  "code": "DATOS_INVALIDOS",
  "path": "/api/v1/reservas",
  "errores": [
    { "campo": "funcionId", "motivo": "debe ser un número positivo", "en": "body" }
  ]
}
```

El cliente debe tomar decisiones con `code`, no con el texto variable de `error`. Códigos transversales:

| HTTP | Código(s) | Significado |
|---|---|---|
| 400 | `DATOS_INVALIDOS`, `JSON_INVALIDO`, `REGISTRO_DUPLICADO` | Entrada inválida, JSON mal formado o restricción única. |
| 401 | `TOKEN_REQUERIDO`, `TOKEN_INVALIDO`, `CREDENCIALES_INVALIDAS` | Falta una sesión válida o el inicio de sesión falló. |
| 403 | `PERMISO_DENEGADO`, `CORS_ORIGEN_NO_PERMITIDO` | El rol/propietario no autoriza la acción o el origen web no está permitido. |
| 404 | `RUTA_NO_ENCONTRADA` y los códigos `*_NO_ENCONTRADO` | No existe la ruta o el recurso. |
| 409 | Códigos específicos de conflicto de cada recurso | Estado incompatible, asiento ocupado, horario cruzado o recurso relacionado. |
| 413 | `CUERPO_DEMASIADO_GRANDE` | El cuerpo excede el límite. |
| 429 | `DEMASIADAS_PETICIONES`, `LOGIN_BLOQUEADO`, `CAMBIO_PASSWORD_BLOQUEADO` | Límite de peticiones o de intentos; revisa `Retry-After`. |
| 500 | `ERROR_INTERNO` | Error no esperado; el detalle se registra en el servidor, no se expone al cliente. |
| 503 | `BD_NO_DISPONIBLE` | La API no puede consultar PostgreSQL. |

El [catálogo de errores](./codigos-de-error.md) contiene el resto de códigos funcionales, incluidos los errores propios de reservas, pagos y permisos.

## Endpoints

`Público` significa que no requiere token. Para todas las rutas protegidas, un token ausente o inválido devuelve `401`; falta de rol o intento de acceder a datos ajenos devuelve `403`. Cuando la validación de ruta, query o cuerpo falla, la respuesta es `400 DATOS_INVALIDOS`.

### Salud y sesión

| Método | Ruta | Acceso | Solicitud → respuesta correcta | Errores propios frecuentes |
|---|---|---|---|---|
| GET | `/health` | Público | Sin cuerpo → `200 { status, db }`. | `503 BD_NO_DISPONIBLE` |
| POST | `/auth/register` | Público | `{ username, password, email, nombreCompleto, cedula, telefono?, direccion?, fechaNacimiento? }` → `201` sesión `{ token, username, email, rol, usuarioId }`. El rol asignado siempre es `USER`. | `USERNAME_EN_USO`, `EMAIL_YA_REGISTRADO`, `CEDULA_YA_REGISTRADA` |
| POST | `/auth/login` | Público | `{ username, password }` → `200` sesión `{ token, username, email, rol, usuarioId }`. | `CREDENCIALES_INVALIDAS` (401), `LOGIN_BLOQUEADO` (429) |
| GET | `/auth/me` | Autenticado | Sin cuerpo → `200 { usuarioId, username, email, rol }`. | — |
| PATCH | `/auth/password` | Autenticado | `{ passwordActual, passwordNueva }` → `200 { mensaje }`. | `PASSWORD_ACTUAL_INCORRECTA` (400), `CAMBIO_PASSWORD_BLOQUEADO` (429) |

### Usuarios y asignaciones de gestores

| Método | Ruta | Acceso | Solicitud → respuesta correcta | Errores propios frecuentes |
|---|---|---|---|---|
| GET | `/usuarios` | ADMIN | Query de paginación → página de usuarios sin hash de contraseña. | — |
| GET | `/usuarios/{id}` | ADMIN | Sin cuerpo → `200` perfil de usuario. | `USUARIO_NO_ENCONTRADO` |
| PATCH | `/usuarios/{id}/rol` | ADMIN | `{ rol: "USER" \| "GESTOR" \| "ADMIN" }` → `200 { mensaje }`. | `USUARIO_NO_ENCONTRADO` |
| PATCH | `/usuarios/{id}/perfil` | Propietario o ADMIN | Uno o más de `{ nombreCompleto, cedula, telefono, direccion, fechaNacimiento, email }` → `200 { mensaje }`. | `PERFIL_AJENO`, `USERNAME_EN_USO`, `EMAIL_YA_REGISTRADO`, `CEDULA_YA_REGISTRADA` |
| DELETE | `/usuarios/{id}` | ADMIN | Sin cuerpo → `200 { mensaje }`; desactiva sin borrar historial. | `USUARIO_NO_ENCONTRADO` |
| GET | `/gestores` | ADMIN | Sin cuerpo → lista de gestores y sucursales asignadas. | — |
| POST | `/gestores` | ADMIN | `{ usuarioId, sucursalId }` → `201` asignación creada. El usuario debe tener rol `GESTOR`. | `USUARIO_NO_ENCONTRADO`, `SUCURSAL_NO_ENCONTRADA`, `USUARIO_DESACTIVADO`, `USUARIO_NO_ES_GESTOR`, `GESTOR_YA_ASIGNADO` |
| DELETE | `/gestores/{id}` | ADMIN | Sin cuerpo → `200 { mensaje }`. El ID es el `gestorId` de la asignación. | `GESTOR_NO_ENCONTRADO` |

### Cines, sucursales y salas

| Método | Ruta | Acceso | Solicitud → respuesta correcta | Errores propios frecuentes |
|---|---|---|---|---|
| GET | `/cines` | Público | Query de paginación → página de cines. | — |
| GET | `/cines/{id}` | Público | Sin cuerpo → cine. | `CINE_NO_ENCONTRADO` |
| POST | `/cines` | ADMIN | `{ nombreDelCine, cineCont? }` → `201` cine. | `REGISTRO_DUPLICADO` |
| PUT | `/cines/{id}` | ADMIN | `{ nombreDelCine, cineCont? }` → cine actualizado. | `CINE_NO_ENCONTRADO` |
| DELETE | `/cines/{id}` | ADMIN | Sin cuerpo → `204`. | `CINE_NO_ENCONTRADO`, `CINE_CON_DATOS_ASOCIADOS` (409) |
| GET | `/sucursales` | Público | Sin cuerpo → lista de sucursales, cine relacionado y salas. | — |
| GET | `/sucursales/cine/{cineId}` | Público | Sin cuerpo → sucursales del cine. | `DATOS_INVALIDOS` si `cineId` no es positivo |
| GET | `/sucursales/{id}` | Público | Sin cuerpo → sucursal, cine y salas. | `SUCURSAL_NO_ENCONTRADA` |
| POST | `/sucursales` | ADMIN | `{ branLocation, cineId }` → `201` sucursal. También acepta `cine.cineId` o `?cineId=` por compatibilidad. | `CINE_NO_ENCONTRADO`, `REGISTRO_DUPLICADO` |
| PUT | `/sucursales/{id}` | ADMIN | `{ branLocation, cineId? }` → sucursal actualizada. | `SUCURSAL_NO_ENCONTRADA`, `CINE_NO_ENCONTRADO` |
| DELETE | `/sucursales/{id}` | ADMIN | Sin cuerpo → `204`. | `SUCURSAL_NO_ENCONTRADA`, `SUCURSAL_CON_DATOS_ASOCIADOS` (409) |
| GET | `/salas` | Público | Sin cuerpo → lista de salas. | — |
| GET | `/salas/tipo/{tipo}` | Público | `tipo`: `PRO`, `TRES_D`/`3D` o `DOS_D`/`2D` → salas filtradas. | `DATOS_INVALIDOS` |
| GET | `/salas/{id}` | Público | Sin cuerpo → sala con matriz de asientos. | `SALA_NO_ENCONTRADA` |
| GET | `/salas/{id}/asientos` | Público | Sin cuerpo → configuración y matriz de asientos generada. | `SALA_NO_ENCONTRADA` |
| POST | `/salas` | ADMIN | `{ nombre, tipo, filas, columnas, branId }` → `201` sala y matriz. | `SUCURSAL_NO_ENCONTRADA`, `DATOS_INVALIDOS` |
| PUT | `/salas/{id}` | ADMIN | Mismo cuerpo requerido que crear → sala actualizada. | `SALA_NO_ENCONTRADA`, `SUCURSAL_NO_ENCONTRADA` |
| DELETE | `/salas/{id}` | ADMIN | Sin cuerpo → `204`. | `SALA_NO_ENCONTRADA`, `SALA_CON_DATOS_ASOCIADOS` (409) |

### Películas y funciones

| Método | Ruta | Acceso | Solicitud → respuesta correcta | Errores propios frecuentes |
|---|---|---|---|---|
| GET | `/peliculas` | Público | Query `nombre?`, paginación y orden → página de películas. | — |
| GET | `/peliculas/{id}` | Público | Sin cuerpo → película sin imagen embebida. | `PELICULA_NO_ENCONTRADA` |
| GET | `/peliculas/{id}/poster` | Público | Sin cuerpo → `{ posterUrl }`. | `PELICULA_NO_ENCONTRADA`, `POSTER_NO_ENCONTRADO` |
| POST | `/peliculas` | ADMIN | `{ nombre, descripcion, duracionMin, clasificacion, genero? }` → `201` película. Acepta alias previos `titulo`, `sinopsis`, `duracion`. | `DATOS_INVALIDOS`, `REGISTRO_DUPLICADO` |
| POST | `/peliculas/{id}/poster` | ADMIN | `{ posterUrl: "data:image/...;base64,..." }` → película actualizada. | `PELICULA_NO_ENCONTRADA`, `DATOS_INVALIDOS` |
| DELETE | `/peliculas/{id}/poster` | ADMIN | Sin cuerpo → película actualizada sin póster. | `PELICULA_NO_ENCONTRADA` |
| PUT | `/peliculas/{id}` | ADMIN | Mismo cuerpo requerido que crear → película actualizada. | `PELICULA_NO_ENCONTRADA`, `DATOS_INVALIDOS` |
| DELETE | `/peliculas/{id}` | ADMIN | Sin cuerpo → `204`. | `PELICULA_NO_ENCONTRADA`, `PELICULA_CON_FUNCIONES` (409) |
| GET | `/funciones` | Público | Filtros `movieId?`, `salaId?`, `fecha?`, paginación → página de funciones. | — |
| GET | `/funciones/vigentes` | Público | Paginación opcional → cartelera de funciones que aún no empiezan. | — |
| GET | `/funciones/pelicula/{movieId}` | Público | Query `todas=true?` y paginación → funciones de la película; por defecto solo futuras. | `PELICULA_NO_ENCONTRADA` |
| GET | `/funciones/sala/{salaId}` | Público | Query `todas=true?` y paginación → funciones de la sala. | `SALA_NO_ENCONTRADA` |
| GET | `/funciones/rango` | Público | Query requerido `desde=AAAA-MM-DD&hasta=AAAA-MM-DD`; acepta alias `inicio`/`fin`, además de `todas?` y paginación → funciones. | `DATOS_INVALIDOS` |
| GET | `/funciones/{id}` | Público | Sin cuerpo → detalles de función, película y sala. | `FUNCION_NO_ENCONTRADA` |
| POST | `/funciones` | ADMIN o GESTOR de la sucursal | `{ movieId, salaId, fecha, hora, precioBoleto }` → `201` función. Acepta `peliculaId` y `horaInicio`. | `PELICULA_NO_ENCONTRADA`, `SALA_NO_ENCONTRADA`, `SALA_OTRA_SUCURSAL`, `PELICULA_SIN_DURACION`, `FUNCION_CRUCE_HORARIOS` |
| POST | `/funciones/programar` | ADMIN o GESTOR de la sucursal | `{ movieId, salaId, precioBoleto, fecha, hora }` o `{ movieId, salaId, precioBoleto, fechaInicio, fechaFin?, horarios: [] }` → `201 { creadas, funciones }`; se crean todas o ninguna. | `PELICULA_NO_ENCONTRADA`, `SALA_NO_ENCONTRADA`, `SALA_OTRA_SUCURSAL`, `FUNCION_CRUCE_HORARIOS` |
| PUT | `/funciones/{id}` | ADMIN o GESTOR de la sucursal | Cuerpo completo `{ movieId, salaId, fecha, hora, precioBoleto }` → función actualizada. | `FUNCION_NO_ENCONTRADA`, `FUNCION_OTRA_SUCURSAL`, `SALA_OTRA_SUCURSAL`, `FUNCION_CON_RESERVAS`, `FUNCION_CON_SILLAS_BLOQUEADAS`, `FUNCION_CRUCE_HORARIOS` |
| DELETE | `/funciones/{id}` | ADMIN o GESTOR de la sucursal | Sin cuerpo → `204`. | `FUNCION_NO_ENCONTRADA`, `FUNCION_OTRA_SUCURSAL`, `FUNCION_CON_RESERVAS` |

### Asientos, clientes y reservas

| Método | Ruta | Acceso | Solicitud → respuesta correcta | Errores propios frecuentes |
|---|---|---|---|---|
| GET | `/sillas/funcion/{funcionId}` | Público | Sin cuerpo → mapa de asientos y estados `DISPONIBLE`, `BLOQUEADA` u `OCUPADA`. | `FUNCION_NO_ENCONTRADA` |
| POST | `/sillas/bloquear` | Autenticado | `{ funcionId, codigos: ["A1"] }` → bloqueo temporal y `ttlSegundos`. | `SILLAS_NO_DISPONIBLES` (409), `SILLA_NO_ENCONTRADA` |
| DELETE | `/sillas/liberar` | Autenticado | `{ funcionId, codigos: ["A1"] }` → confirma liberación de los bloqueos propios. | `SILLAS_OCUPADAS` (409), `SILLAS_BLOQUEADAS_POR_OTRO` (403) |
| GET | `/clientes` | Autenticado; ADMIN ve todos, USER/GESTOR solo los propios | Filtros `nombre?`, `email?` y paginación → página de clientes autorizados. | — |
| GET | `/clientes/{id}` | Propietario o ADMIN | Sin cuerpo → datos del cliente. | `CLIENTE_NO_ENCONTRADO`, `CLIENTE_AJENO` |
| POST | `/clientes` | Autenticado | `{ nombreCliente, custAge?, email?, direccionCliente?, telefono? }` → `201` cliente asociado al usuario; ADMIN puede crear sin cuenta asociada. | `CLIENTE_YA_REGISTRADO` (409), `DATOS_INVALIDOS` |
| PUT | `/clientes/{id}` | Propietario o ADMIN | Cuerpo de cliente → cliente actualizado. | `CLIENTE_NO_ENCONTRADO`, `CLIENTE_AJENO` |
| DELETE | `/clientes/{id}` | ADMIN | Sin cuerpo → `204`. | `CLIENTE_NO_ENCONTRADO`, `CLIENTE_CON_RESERVAS` (409) |
| GET | `/reservas` | Autenticado; ADMIN ve todas, demás sus propias reservas | Paginación → página de reservas. | — |
| GET | `/reservas/{id}` | Propietario o ADMIN | Sin cuerpo → detalle de reserva. | `RESERVA_NO_ENCONTRADA`, `RESERVA_AJENA` |
| POST | `/reservas` | Autenticado | `{ funcionId, sillas: ["A1"], custId?, nombre?, contNum? }` → `201` reserva `PENDIENTE` con total calculado por el servidor. Las sillas deben seguir bloqueadas por quien llama. | `CLIENTE_NO_REGISTRADO`, `RESERVA_A_NOMBRE_DE_OTRO`, `FUNCION_YA_COMENZO`, `SILLAS_NO_DISPONIBLES` |
| PATCH | `/reservas/{id}/cancelar` | Propietario o ADMIN | Sin cuerpo → reserva cancelada; si estaba pagada y la función aún no comienza, se registra reembolso. | `RESERVA_NO_ENCONTRADA`, `RESERVA_AJENA`, `RESERVA_YA_CANCELADA`, `RESERVA_NO_CANCELABLE` |
| DELETE | `/reservas/{id}` | Propietario o ADMIN | Sin cuerpo → `204`; elimina reserva y libera sillas. | `RESERVA_NO_ENCONTRADA`, `RESERVA_AJENA`, `RESERVA_NO_CANCELABLE` |

### Pagos, transacciones y operación

| Método | Ruta | Acceso | Solicitud → respuesta correcta | Errores propios frecuentes |
|---|---|---|---|---|
| POST | `/pagos/procesar` | Propietario de la reserva o ADMIN | `{ resCode, tipoPago, numeroTarjeta? }` → `201` resultado. Métodos: `TARJETA_CREDITO`, `TARJETA_DEBITO`, `NEQUI`, `PSE`. El servidor calcula el monto y solo conserva los últimos cuatro dígitos de tarjeta. | `RESERVA_NO_ENCONTRADA`, `RESERVA_AJENA`, `RESERVA_YA_PAGADA`, `RESERVA_CANCELADA`, `RESERVA_SIN_TOTAL` |
| GET | `/transacciones` | Autenticado; ADMIN ve todas, demás solo las propias | Paginación → historial reciente con datos de pago/función. | — |
| GET | `/transacciones/cliente/{custId}` | Propietario del cliente o ADMIN | Paginación → historial de ese cliente, sin número completo de tarjeta. | `CLIENTE_NO_ENCONTRADO`, `CLIENTE_AJENO` |
| GET | `/ocupacion` | GESTOR asignado | Sin query de sucursal: el backend toma la sucursal del gestor → funciones, reservas, asientos vendidos y ocupación. | `GESTOR_SIN_SUCURSAL` (403) |
| GET | `/reportes/ventas` | ADMIN | Query requerido `desde=AAAA-MM-DD&hasta=AAAA-MM-DD` → ventas, reembolsos y neto agrupados. | `DATOS_INVALIDOS` |
| GET | `/reportes/ventas/csv` | ADMIN | Mismos parámetros del reporte → archivo `text/csv`. | `DATOS_INVALIDOS` |

## Flujo mínimo: reservar, pagar y ver historial

Los siguientes ejemplos usan PowerShell. Sustituye la URL y los identificadores por los valores obtenidos en tus respuestas. Utiliza únicamente datos de prueba; el simulador de pago no se conecta a una pasarela bancaria real.

1. Define la URL de la API. Inicia sesión y copia el `token` de la respuesta:

   ```powershell
   $env:MONARCA_API = "http://localhost:8080"
   $login = Invoke-RestMethod -Method Post -Uri "$env:MONARCA_API/api/v1/auth/login" -ContentType "application/json" -Body (@{ username = "usuario"; password = "<tu-clave>" } | ConvertTo-Json)
   $token = $login.token
   $headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
   ```

2. Si la cuenta aún no tiene ficha de cliente, créala. Guarda el `custId` devuelto:

   ```powershell
   $cliente = Invoke-RestMethod -Method Post -Uri "$env:MONARCA_API/api/v1/clientes" -Headers $headers -Body '{"nombreCliente":"Cliente de prueba","custAge":25,"email":"cliente@example.test","telefono":"3001234567"}'
   ```

3. Consulta una función disponible y su mapa de sillas:

   ```powershell
   Invoke-RestMethod "$env:MONARCA_API/api/v1/funciones/vigentes?page=1&size=20"
   Invoke-RestMethod "$env:MONARCA_API/api/v1/sillas/funcion/<funcionId>"
   ```

4. Bloquea una silla disponible; el bloqueo expira según `ttlSegundos` (5 minutos por defecto, configurable con `SILLAS_TTL_SEG`):

   ```powershell
   Invoke-RestMethod -Method Post -Uri "$env:MONARCA_API/api/v1/sillas/bloquear" -Headers $headers -Body '{"funcionId":<funcionId>,"codigos":["A1"]}'
   ```

5. Crea la reserva con la misma función y silla bloqueada. Copia el `resCode` devuelto:

   ```powershell
   $reserva = Invoke-RestMethod -Method Post -Uri "$env:MONARCA_API/api/v1/reservas" -Headers $headers -Body '{"funcionId":<funcionId>,"sillas":["A1"]}'
   ```

   La respuesta inicial queda `PENDIENTE`; el total lo fija el backend.

6. Procesa el pago con un método permitido. NEQUI y PSE están simulados:

   ```powershell
   Invoke-RestMethod -Method Post -Uri "$env:MONARCA_API/api/v1/pagos/procesar" -Headers $headers -Body (@{ resCode = $reserva.resCode; tipoPago = "PSE" } | ConvertTo-Json)
   ```

   Un pago aprobado devuelve `estadoPago: "APROBADO"` y `estadoReserva: "CONFIRMADA"`. Un rechazo deja la reserva `PENDIENTE`; consulta la respuesta para conocer el motivo antes de volver a intentarlo.

7. Revisa las reservas y transacciones propias:

   ```powershell
   Invoke-RestMethod "$env:MONARCA_API/api/v1/reservas?page=1&size=20" -Headers $headers
   Invoke-RestMethod "$env:MONARCA_API/api/v1/transacciones/cliente/$($cliente.custId)?page=1&size=20" -Headers $headers
   ```

La aplicación web ofrece el mismo recorrido mediante **Taquilla**, selección de función/sillas, pago y **Mis pagos**. Consulta el [manual de usuario](./MANUAL_USUARIO.md) para el recorrido gráfico y las tareas de cada rol.
