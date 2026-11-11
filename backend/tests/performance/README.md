# Pruebas de rendimiento local

El runner inicia una API en `127.0.0.1` y un PostgreSQL temporal, aplica las migraciones, crea datos sintéticos, ejecuta Grafana k6 y limpia los procesos y archivos temporales. No envía carga a Render, Neon ni otros servicios. No ejecutes estas pruebas con `NODE_ENV=production`.

## Ejecutar

Desde `backend`:

```powershell
npm run test:performance
```

Instala Grafana k6 y verifica `k6 version`. Si `k6` no está en `PATH`, define `K6_BIN` con la ruta a `k6.exe`. Los resultados generados se guardan bajo `tests/performance/results/` y se ignoran con Git.

La rampa dura cuatro minutos: incrementa hasta 50 VUs, mantiene el máximo brevemente, desciende a 1 VU y observa la recuperación. El objetivo predeterminado es la cartelera paginada (`/api/funciones/vigentes?page=1&size=20`). El runner prepara 100 películas, 200 salas y 108.000 funciones sintéticas distribuidas entre 59 días anteriores y 30 días futuros. Umbrales: p95 menor a 500 ms y fallos menores a 1%; k6 devuelve un código distinto de cero cuando se incumplen.

## KAN-60 (HT21): comparación antes y después

La medición se hizo en el mismo equipo, con la misma rampa de 50 VUs, endpoint y conjunto de datos sintéticos. Los informes HTML y resúmenes JSON de ambas ejecuciones están versionados en `evidence/`.

| Medición | Solicitudes | p95 agregado | Pico p95 | Errores |
|---|---:|---:|---:|---:|
| Antes | 4.236 | 75,19 ms | 91,17 ms | 0 % |
| Después | 4.258 | 68,32 ms | 74,39 ms | 0 % |

El p95 agregado bajó **9,13 %** y el p95 durante la fase pico bajó **18,40 %**. Ambas corridas cumplieron el umbral de 500 ms.

### Cambios respaldados por la medición

- Se añadió el índice compuesto de fecha, hora e identificador usado por el filtro y el orden de cartelera.
- El filtro de funciones vigentes compara las columnas canónicas `YYYY-MM-DD` y `HH:mm` como una tupla, conservando el corte de tiempo al minuto y habilitando el índice.
- El conteo paginado de funciones cuenta directamente la tabla `funcion`, sin repetir los `JOIN` de película y sala que solo necesita la página de resultados.

No se agregó compresión ni caché HTTP: esta prueba no midió ancho de banda o respuestas repetidas desde clientes, así que esas mejoras no están respaldadas por estos datos.

## Límites

Los datos son sintéticos y locales; el resultado no representa necesariamente el volumen, hardware, red, Render o Neon del despliegue. La prueba no identifica por sí sola límites de CPU o memoria. Valida el p95 de esta consulta hasta 50 VUs, no el punto de quiebre máximo del sistema.

La medición HT23 original sobre `/api/health` se conserva en `evidence/local-ramp-report.html`, pero no se compara directamente con esta prueba de cartelera porque usa otro endpoint y otra carga.

## KAN-46 (HT12): carga normal de los flujos principales

Desde `backend`, ejecuta:

```powershell
npm run test:performance:ht12
```

El runner requiere Grafana k6 en `PATH` (o `K6_BIN`), construye el frontend y usa un PostgreSQL temporal. La prueba rechaza hosts remotos y verifica que `NODE_ENV` no sea `production`. Genera 50 cuentas/clientes y funciones sintéticas locales; cada VU consulta la cartelera, inicia sesión al comenzar y renueva la sesión periódicamente, bloquea una silla, crea y paga una reserva con NEQUI/PSE, y consulta la reserva confirmada. Las reservas se aíslan por usuario y función.

La rampa dura exactamente cinco minutos: 20 VUs al segundo 30, aumento gradual hasta 50 VUs al segundo 90, 50 VUs durante tres minutos y descenso a 20 VUs en el último tramo. Se registran promedio, p95, solicitudes por segundo y porcentaje de errores, tanto globalmente como por endpoint y por flujo de checkout. Umbrales de observación: API p95 < 500 ms, checkout p95 < 3 s y errores < 1%; k6 devuelve un código distinto de cero cuando se incumple un umbral.

Después de k6 se ejecuta Google Lighthouse contra el mismo frontend/API local, usando Chrome o Edge. `CHROME_PATH` permite indicar otra ubicación de navegador. Los informes de k6 y Lighthouse se generan bajo `tests/performance/evidence/`; los resultados de k6 no versionados se guardan en `tests/performance/results-ht12/`.

La carga, datos y navegador son locales. El resultado mide este equipo y la semilla sintética, no el servicio desplegado. No extrapoles latencias, límites de CPU/memoria ni conexiones de base de datos a Render/Neon. Para conclusiones sobre el despliegue, repite únicamente en staging autorizado y recoge métricas del proveedor durante la prueba.

La ejecución local HT12 y su interpretación están documentadas en [`evidence/ht12-results.md`](./evidence/ht12-results.md); incluye el resumen, desglose por fase/endpoint y el informe Lighthouse.
