# Migraciones de la base de datos

Cada cambio del esquema es un archivo numerado `NNN_nombre.sql` con dos secciones:

```sql
-- up
-- (SQL que aplica el cambio)

-- down
-- (SQL que lo deshace)
```

La tabla `schema_migrations` guarda las versiones ya aplicadas: al desplegar solo se ejecutan las pendientes.

| Comando | Qué hace |
|---|---|
| `npm run db:migrate` | Aplica las migraciones pendientes (cada una en su propia transacción). |
| `npm run db:migrate:status` | Lista cuáles están aplicadas y cuáles pendientes. |
| `npm run db:migrate:down` | Revierte **solo la última** migración. |
| `npm run db:setup` | Aplica las migraciones y carga los datos semilla (`sql/02_seed.sql`). |
| `npm run db:reset` | Borra todo y vuelve a crear (solo desarrollo). |

## Agregar un cambio
1. Crea `003_descripcion_corta.sql` (siguiente número) con sus secciones `-- up` y `-- down`.
2. Escribe el `up` de forma segura (`IF NOT EXISTS`) y el `down` que lo deshace.
3. Prueba: `npm run db:migrate`, luego `npm run db:migrate:down` y otra vez `npm run db:migrate`.
4. Haz commit del archivo. En Render se aplica solo al desplegar.

> La `001` es el esquema base: revertirla borra todas las tablas y por eso exige `-- --force`.
