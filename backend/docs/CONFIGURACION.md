# Configuración por ambientes (KAN-39)

Ningún secreto vive en el repositorio. Todo se lee de variables de entorno.

| Variable | Desarrollo (`backend/.env`) | Producción (Render) |
|---|---|---|
| NODE_ENV | development (por defecto) | production (ya en render.yaml) |
| DATABASE_URL | base local | la de Neon (sync: false, se pega en Render) |
| DB_SSL | false | true |
| JWT_SECRET | cualquier texto de 32+ caracteres | generateValue: true (Render lo genera) |
| CORS_ORIGINS | http://localhost:5173 | vacío: solo se acepta el propio dominio |

## Qué hace el servidor en producción
- No arranca si JWT_SECRET falta, es corto o es el valor de ejemplo.
- No arranca si falta DATABASE_URL.
- No arranca si CORS_ORIGINS es "*" o incluye localhost.
- CORS acepta solo el propio dominio de la app (el frontend se sirve desde el mismo servicio).

## Frontend
El frontend llama a la API en el mismo dominio donde está publicado (`window.location.origin`).
Si algún día la API vive en otro dominio, define `VITE_API_URL` al compilar.

## Contraseñas de demostración
El seed (`backend/sql/02_seed.sql`) crea usuarios demo con contraseña conocida. Cambia la del admin tras el primer despliegue.
