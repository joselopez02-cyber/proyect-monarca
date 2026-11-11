# Cinema Monarca

Aplicación web de cartelera, venta de entradas y administración de cines. El frontend compilado y la API REST se sirven desde el mismo servicio en producción; PostgreSQL almacena usuarios, funciones, reservas y transacciones.

## Documentación

- [Referencia completa de la API](./backend/docs/API.md): endpoints, métodos, roles, solicitudes, respuestas y errores.
- [Manual de usuario](./backend/docs/MANUAL_USUARIO.md): acceso, compra, pagos, historial y tareas frecuentes por rol.
- [Configuración y despliegue en Render/Neon](./backend/docs/CONFIGURACION.md).
- [Códigos de error](./backend/docs/codigos-de-error.md) y [paginación](./backend/docs/paginacion.md).

## Requisitos

- Node.js 22 o superior y npm.
- PostgreSQL 16 o compatible para desarrollo local.
- Git para clonar el repositorio.

## Ejecutar localmente

1. Clona el repositorio y crea una base de datos vacía llamada `cinema_monarca`. Si tienes Docker, puedes iniciar PostgreSQL así:

   ```powershell
   docker run -d --name monarca-db -e POSTGRES_PASSWORD=monarca -e POSTGRES_DB=cinema_monarca -p 5432:5432 postgres:16
   ```

2. Desde la raíz, instala las dependencias del backend:

   ```powershell
   if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
   npm --prefix backend install
   ```

   Revisa `backend\.env`: configura `DATABASE_URL` con la conexión local y usa un `JWT_SECRET` de al menos 32 caracteres. Para la base local, `DB_SSL=false`.

3. Aplica migraciones y carga los datos de demostración:

   ```powershell
   npm --prefix backend run db:setup
   ```

4. Inicia el backend en una terminal:

   ```powershell
   npm --prefix backend run dev
   ```

   Verifica que `http://localhost:8080/api/health` responda `{"status":"ok","db":"up"}`.

5. En otra terminal, instala y ejecuta el frontend:

   ```powershell
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

   Abre la URL que imprime Vite (habitualmente `http://localhost:5173`). En desarrollo el proxy de Vite envía `/api` al backend en el puerto 8080.

La cuenta semilla local `admin` y la cuenta `usuario` usan la contraseña `monarca123`. Son únicamente para desarrollo/demostración. Nunca publiques ni mantengas esas credenciales en producción; cambia la contraseña administrativa inmediatamente y no uses la cuenta semilla para datos reales.

## Despliegue

El archivo [`render.yaml`](./render.yaml) define un Blueprint de Render que construye el frontend y el backend, ejecuta las migraciones al iniciar y publica ambos en un único servicio. La base PostgreSQL se provisiona por separado (por ejemplo, en Neon):

1. Crea una base de datos PostgreSQL en Neon y copia su cadena de conexión. Protege esa cadena como secreto.
2. En Render, crea un Blueprint desde este repositorio y confirma el servicio `monarca` definido en `render.yaml`.
3. En las variables de entorno del servicio, define `DATABASE_URL` con la conexión de Neon. Render configura `NODE_ENV=production`, `DB_SSL=true` y genera `JWT_SECRET`; conserva valores aleatorios y privados.
4. Espera el despliegue y verifica `/api/health`. Debe devolver HTTP 200 y `db: "up"`.
5. Inicia sesión con una cuenta administrativa propia, cambia cualquier contraseña inicial y crea usuarios/roles de operación. No uses las cuentas demo ni `db:reset` en producción.

La aplicación rechaza iniciar en producción si faltan secretos o la configuración es insegura. Consulta [Configuración y despliegue](./backend/docs/CONFIGURACION.md) antes de cambiar dominios, CORS o TLS.

## Pruebas y mantenimiento

Desde la raíz del repositorio:

```powershell
npm --prefix backend test
npm --prefix backend run test:integration
```

La prueba unitaria reporta cobertura con c8. La de integración inicia por defecto un PostgreSQL temporal y aislado; también puedes revisar los comandos de migración en [backend/README.md](./backend/README.md) y [backend/migrations/README.md](./backend/migrations/README.md).

> `npm --prefix backend run db:reset` es destructivo: elimina todo el esquema de la base configurada. Úsalo solo en una base local desechable.
