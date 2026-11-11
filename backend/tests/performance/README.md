# HT23 — Prueba local de estrés en rampa

La prueba usa Grafana k6 contra una API que el runner inicia solo en `127.0.0.1`, con un PostgreSQL temporal y migraciones propias. No necesita cuenta, credenciales ni red hacia Render/Neon. No uses `BASE_URL` para apuntar a producción: el script rechaza hosts que no sean `localhost`, `127.0.0.1` o `::1`.

## Ejecutar

1. Instala Grafana k6 para tu sistema operativo y verifica `k6 version`.
2. Desde `backend`, ejecuta:

   ```powershell
   npm run test:performance
   ```

   Si k6 no está en `PATH`, define `K6_BIN` con la ruta local a `k6.exe`.
3. Revisa `backend/tests/performance/results/report.html` y `summary.json`. La carpeta generada está ignorada por Git; la evidencia de referencia versionada está en `evidence/local-ramp-report.html`.

El escenario dura cuatro minutos: rampa progresiva a 10, 25 y 50 VUs durante 160 segundos, 20 segundos al máximo, bajada a 1 VU y observación de recuperación durante 60 segundos. Cada VU consulta el endpoint local `/api/health` aproximadamente una vez por segundo. Umbrales de degradación: p95 mayor o igual a 500 ms o errores igual o mayores a 1%. El código de salida de k6 falla si se excede un umbral.

## Evidencia de ejecución

La corrida local de referencia se conserva en [`evidence/local-ramp-report.html`](./evidence/local-ramp-report.html): 4.417 solicitudes, p95 agregado de 2,63 ms y 0% de errores; los umbrales se cumplieron hasta 50 VUs. No se detectó el punto de quiebre en ese rango.

## Interpretación y límites

El informe identifica la primera fase que incumple los umbrales. Si todas pasan, el resultado significa **“no se observó el punto de quiebre hasta 50 VUs”**, no que el límite máximo del sistema esté determinado. La latencia de `/api/health` mide conjuntamente API, loopback y consulta `SELECT 1` a PostgreSQL; por sí sola no atribuye la degradación a CPU, memoria o base de datos.

Esta ejecución local no mide Render, Neon, el ancho de banda público ni sus límites de conexiones. Para identificar esos componentes se necesitan paneles y métricas del despliegue, autorización explícita, una ventana acordada y una rampa separada y controlada en staging. No ejecutar pruebas de punto de quiebre en producción.

La base temporal, la API y el clúster de PostgreSQL se limpian al finalizar incluso si k6 falla. Los resultados se conservan en `results/`.
