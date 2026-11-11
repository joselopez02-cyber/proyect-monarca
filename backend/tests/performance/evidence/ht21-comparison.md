# KAN-60 (HT21): comparación de rendimiento

## Método

- Objetivo: `GET /api/funciones/vigentes?page=1&size=20` en `127.0.0.1`.
- Misma rampa k6 en ambas corridas: 4 minutos, hasta 50 VUs, y 1 minuto de recuperación incluido.
- Datos sintéticos en PostgreSQL temporal: 100 películas, 200 salas y 108.000 funciones distribuidas entre 59 días anteriores y 30 días futuros.
- Criterios: p95 menor a 500 ms y errores menores a 1%.
- No se generó tráfico hacia Render, Neon o producción.

## Resultados

| Métrica | Antes | Después | Cambio |
|---|---:|---:|---:|
| Solicitudes | 4.236 | 4.258 | +0,52 % |
| Latencia media | 42,57 ms | 39,21 ms | -7,89 % |
| Latencia p95 | 75,19 ms | 68,32 ms | **-9,13 %** |
| p95 en fase pico | 91,17 ms | 74,39 ms | **-18,40 %** |
| Errores HTTP | 0 % | 0 % | Sin cambio |

El p95 quedó por debajo del umbral de 500 ms en las dos ejecuciones. La evidencia gráfica y los datos de k6 están en [`ht21-before-report.html`](./ht21-before-report.html), [`ht21-before-summary.json`](./ht21-before-summary.json), [`ht21-after-report.html`](./ht21-after-report.html) y [`ht21-after-summary.json`](./ht21-after-summary.json).

## Mejora aplicada

El listado paginado ejecutaba el conteo con los mismos `JOIN` que la página, y la condición temporal convertía las columnas de texto a timestamp, lo que impedía usar un índice normal sobre fecha y hora. Se cambió el conteo a `funcion`, se usa una comparación indexable sobre fecha/hora canónicas y se agregó un índice compuesto que también sirve para ordenar la cartelera.

No se agregó compresión ni caché HTTP: el benchmark no evidenció una limitación de tamaño de respuesta ni una estrategia de caché segura.

## Plan de acción para conclusiones

1. Validar esta mejora en staging con volumen y configuración cercanos al despliegue y con autorización para medir.
2. Durante esa prueba, correlacionar p95 con CPU y memoria de Render y conexiones/tiempos de consulta de Neon.
3. Si el p95 supera 500 ms, capturar `EXPLAIN (ANALYZE, BUFFERS)` del endpoint y elegir la siguiente optimización solo a partir de ese plan y las métricas observadas.

Estos resultados locales demuestran una reducción comparativa para esta consulta y semilla; no identifican el límite máximo del despliegue ni deben extrapolarse a Render/Neon.
