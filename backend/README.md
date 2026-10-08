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

Usuarios demo (clave `monarca123`): `admin` (ADMIN) y `usuario` (USER).
