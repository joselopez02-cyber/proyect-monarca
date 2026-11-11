# Backend - Cinema Monarca

API en Node.js + Express + PostgreSQL.

## Tickets Jira cubiertos
- KAN-9  (HT01) Modelo de datos relacional -> `sql/01_schema.sql`
- KAN-13 (HT05) Scripts de esquema y datos semilla -> `sql/02_seed.sql`

## Puesta en marcha
1. `npm install`
2. Copia `.env.example` a `.env`
3. Levanta PostgreSQL (ver abajo) y ejecuta `npm run db:setup`
4. `npm run dev` y abre `/api/health`

## PostgreSQL en Codespaces
    docker run -d --name monarca-db -e POSTGRES_PASSWORD=monarca \
      -e POSTGRES_DB=cinema_monarca -p 5432:5432 postgres:16

## Comandos
- `npm run db:setup`  crea tablas y datos semilla (se puede repetir sin duplicar)
- `npm run db:reset`  borra todo y vuelve a crearlo
- `npm run dev`       servidor con recarga automatica en el puerto 8080
- `npm test`          ejecuta las pruebas unitarias y muestra cobertura con c8
- `npm run test:integration` ejecuta cinco flujos de integración contra PostgreSQL de pruebas

Usuarios demo (clave `monarca123`): `admin` (ADMIN) y `usuario` (USER).

### Pruebas de integración

Las pruebas usan Supertest sobre la aplicación Express y PostgreSQL real. Por defecto, `npm run test:integration` inicia una instancia PostgreSQL embebida y aislada, aplica las migraciones, ejecuta la suite y elimina el clúster temporal. La primera ejecución descarga los binarios PostgreSQL para la plataforma. No requiere Docker, una instalación de PostgreSQL del sistema ni permisos de administrador.

Cada caso elimina en `afterEach` los usuarios, clientes, reservas, pagos y fixtures que creó; el servidor temporal también se apaga al finalizar.

Opcionalmente, puedes proporcionar `TEST_DATABASE_URL` (o configurarla en `.env.test`) para ejecutar contra una base PostgreSQL existente, exclusiva para pruebas. El nombre debe incluir el segmento `test` (por ejemplo, `cinema_monarca_test`); esa base debe tener aplicadas las migraciones 001–003. El runner rechaza `NODE_ENV=production`, y la configuración comprueba que la URL de pruebas no apunte a la misma base configurada en `DATABASE_URL`. Nunca uses una base con datos reales ni ejecutes `db:reset` contra producción.
