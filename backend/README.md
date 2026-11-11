# Backend - Cinema Monarca

API REST de Node.js, Express y PostgreSQL. La [referencia de API](./docs/API.md) documenta cada endpoint, sus roles, cuerpos, respuestas y errores; el [manual de usuario](./docs/MANUAL_USUARIO.md) cubre los flujos de la aplicación.

## Desarrollo local

Desde esta carpeta instala dependencias, crea `.env` a partir de `.env.example` si aún no existe y configura la cadena local `DATABASE_URL` y un `JWT_SECRET` de al menos 32 caracteres. Inicia PostgreSQL y ejecuta:

```powershell
npm run db:setup
npm run dev
```

La API escucha en `http://localhost:8080`; verifica `http://localhost:8080/api/health`. Para iniciar el frontend en paralelo consulta la sección [Ejecutar localmente](../README.md#ejecutar-localmente).

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run db:setup` | Aplica migraciones y carga las filas de demostración. |
| `npm run db:migrate` | Aplica solo las migraciones pendientes; es el comando usado al desplegar. |
| `npm run db:migrate:status` | Muestra migraciones aplicadas y pendientes. |
| `npm run db:migrate:down` | Revierte la última migración. |
| `npm run db:reset` | Destructivo: elimina el esquema y lo recrea con datos demo. Solo para base local desechable. |
| `npm run dev` | API con recarga automática. |
| `npm start` | Inicia la API sin modo watch. |
| `npm test` | Ejecuta pruebas unitarias y reporte de cobertura c8. |
| `npm run test:integration` | Ejecuta seis flujos de integración contra PostgreSQL aislado. |

La base de datos demo contiene las cuentas `admin` (ADMIN) y `usuario` (USER), ambas con la contraseña `monarca123`. No uses esas credenciales en producción; cambia la clave administrativa y no cargues seed en una base con datos reales.

## Pruebas de integración

La suite usa Supertest sobre Express y PostgreSQL real. Por defecto, `npm run test:integration` inicia una instancia PostgreSQL embebida, aplica migraciones, ejecuta las pruebas y borra la base temporal. No requiere Docker ni PostgreSQL instalado. Los casos crean y limpian sus propios usuarios, clientes y recursos.

Opcionalmente, puedes configurar `TEST_DATABASE_URL` (o `.env.test`) para una base PostgreSQL exclusiva de pruebas, con `test` en el nombre y migraciones 001–004 aplicadas. El runner rechaza `NODE_ENV=production` y protege contra usar la base de producción. Nunca apuntes las pruebas ni `db:reset` a una base real.

## Integración continua

El workflow `Backend tests` ejecuta `npm ci`, `npm test` (incluida cobertura c8) y `npm run test:integration` en cada pull request hacia `main` y push a `main`. Consulta el estado en las verificaciones del pull request.

## Mantenimiento y despliegue

Cada cambio de esquema se versiona en [`migrations/`](./migrations/); Render aplica automáticamente las migraciones pendientes al iniciar el servicio. Revisa [Configuración y despliegue](./docs/CONFIGURACION.md) antes de modificar variables, base de datos, CORS o TLS.
