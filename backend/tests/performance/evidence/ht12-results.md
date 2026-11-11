# KAN-46 (HT12): resultados de carga normal

## Alcance y entorno

- Fecha: 11 de noviembre de 2026.
- Grafana k6 1.2.3; ejecución total de 5 min.
- API y PostgreSQL temporales locales en `127.0.0.1`; tráfico externo: ninguno.
- Datos sintéticos: 108.000 funciones de cartelera, 50 cuentas/clientes y hasta 500 funciones para el flujo de compra.
- Carga: aumento hasta 20 VUs, permanencia breve en 20, aumento hasta 50, 3 min en 50 y descenso a 20.
- Flujo: consultar cartelera; iniciar sesión y renovar sesión periódicamente; bloquear silla; crear reserva; pagar con NEQUI o PSE; consultar la reserva confirmada.

## Resultados k6

| Métrica | Resultado |
|---|---:|
| Solicitudes HTTP | 17.541 |
| Latencia media | 283,73 ms |
| Latencia p95 | 1.153,95 ms |
| Throughput | 58,18 solicitudes/s |
| Errores HTTP | 0 % |
| Flujos de checkout completados | 3.482 |
| Errores de flujo de negocio | 0 % |

### Latencia por endpoint

| Endpoint | Promedio | p95 | Solicitudes/s | Errores |
|---|---:|---:|---:|---:|
| Cartelera | 376,46 ms | 1.290,44 ms | 11,55 | 0 % |
| Login | 1.190,99 ms | 3.513,41 ms | 0,43 | 0 % |
| Bloqueo de silla | 496,69 ms | 1.859,98 ms | 11,55 | 0 % |
| Crear reserva | 354,57 ms | 1.118,07 ms | 11,55 | 0 % |
| Procesar pago | 102,45 ms | 238,39 ms | 11,55 | 0 % |
| Consultar reserva | 54,34 ms | 142,68 ms | 11,55 | 0 % |

El login tuvo 131 solicitudes, pues se renovó cada 30 iteraciones; interpretar su p95 con esa muestra menor que la de los endpoints de compra.

### Latencia por fase

| Fase | VUs | p95 API | Errores |
|---|---:|---:|---:|
| Rampa a 20 | 0–20 | 338,17 ms | 0 % |
| Estable en 20 | 20 | 78,40 ms | 0 % |
| Rampa a 50 | 20–50 | 1.854,24 ms | 0 % |
| Estable en 50 | 50 | 1.128,13 ms | 0 % |
| Descenso | 50–20 | 762,01 ms | 0 % |

## Interpretación

La primera degradación sobre el umbral API de 500 ms aparece al subir de 20 a 50 VUs. En el tramo estable de 50 VUs el p95 queda en 1,13 s, frente a 78 ms en el tramo estable de 20 VUs. El login, el bloqueo de silla, la cartelera y la creación de reservas tienen las mayores latencias p95; el pago simulado y la consulta de confirmación permanecen por debajo de 500 ms. Al descender a 20 VUs, el p95 baja a 762 ms, pero no vuelve al umbral dentro de los 30 segundos observados.

Se cumplieron las comprobaciones funcionales y el umbral de errores (<1 %). No se cumplieron los objetivos de latencia configurados (API p95 <500 ms y checkout p95 <3 s): el checkout registró promedio 1.434,54 ms y p95 4.164,85 ms. Por ello k6 terminó con código 99. Es un resultado de rendimiento que debe guiar el análisis posterior, no un fallo de los flujos funcionales.

La prueba no registró métricas de CPU, RAM ni conexiones de proveedor. Los datos no permiten afirmar si el cuello de botella corresponde a CPU, PostgreSQL, memoria o al equipo local; tampoco permiten extrapolar el resultado a Render o Neon. Para identificar el componente, repetir en staging autorizado y correlacionar el p95 con las métricas de la API y la base de datos.

## Lighthouse

Google Lighthouse, categoría Performance, se ejecutó sobre el frontend/API local después de la carga:

| Métrica | Resultado |
|---|---:|
| Puntaje Performance | 0,80 |
| First Contentful Paint (FCP) | 3,31 s |
| Largest Contentful Paint (LCP) | 3,45 s |
| Total Blocking Time | 227 ms |
| Cumulative Layout Shift | 0 |

Oportunidades señaladas: eliminar recursos que bloquean el renderizado (ahorro estimado 1.500 ms), habilitar compresión de texto (175 KiB estimados), reducir JavaScript sin uso (104 KiB) y CSS sin uso (30 KiB). Son oportunidades medidas por Lighthouse; no se aplicaron cambios de optimización en este ticket.

## Evidencia

- [Reporte gráfico de k6](./ht12-k6-report.html)
- [Resumen k6 procesado](./ht12-k6-summary.json)
- [Resumen k6 original](./ht12-k6-raw.json)
- [Reporte HTML Lighthouse](./ht12-lighthouse.report.html)
- [Datos JSON Lighthouse](./ht12-lighthouse.report.json)
