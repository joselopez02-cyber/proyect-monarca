import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const REPORT_DIR = __ENV.REPORT_DIR || './tests/performance/results-ht12';
const USER_PREFIX = __ENV.HT12_USER_PREFIX;
const PASSWORD = __ENV.HT12_PASSWORD;
const FUNCTION_IDS = (__ENV.HT12_FUNCTION_IDS || '').split(',').filter(Boolean).map(Number);
const FUNCTIONS_PER_USER = Number(__ENV.HT12_FUNCTIONS_PER_USER || 10);
const ROOM_ROWS = 26;
const ROOM_COLUMNS = 50;
const SEATS_PER_FUNCTION = ROOM_ROWS * ROOM_COLUMNS;
const LOGIN_INTERVAL = 30;
const THINK_TIME_SECONDS = 2;
const target = BASE_URL.match(/^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?\/?$/i);
const hostname = target?.[1].replace(/^\[|\]$/g, '');

if (!hostname || !['localhost', '127.0.0.1', '::1'].includes(hostname)) {
  throw new Error('HT12 solo permite localhost; no se enviará carga a servicios remotos.');
}
if (!USER_PREFIX || !PASSWORD || FUNCTION_IDS.length < 50 * FUNCTIONS_PER_USER) {
  throw new Error('Faltan fixtures locales HT12. Ejecuta el perfil con npm run test:performance:ht12.');
}

const phases = ['ramp20', 'steady20', 'ramp50', 'steady50', 'cooldown'];
const endpoints = ['cartelera', 'login', 'bloquear', 'reserva', 'pago', 'consulta_reserva'];
const schedule = [
  { duration: '30s', target: 20 },
  { duration: '30s', target: 20 },
  { duration: '30s', target: 50 },
  { duration: '180s', target: 50 },
  { duration: '30s', target: 20 },
];
const TOTAL_MS = 300_000;
const endpointLatency = new Trend('api_endpoint_latency', true);
const endpointFailures = new Rate('api_endpoint_failure_rate');
const endpointCalls = new Counter('api_endpoint_calls');
const phaseLatency = new Trend('api_phase_latency', true);
const phaseFailures = new Rate('api_phase_failure_rate');
const flowDuration = new Trend('checkout_duration', true);
const flowFailures = new Rate('checkout_failure_rate');
const flowCount = new Counter('checkout_flows');

export const options = {
  scenarios: {
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: schedule,
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    'api_endpoint_failure_rate': ['rate<0.01'],
    'checkout_failure_rate': ['rate<0.01'],
    'checkout_duration': ['p(95)<3000'],
    ...Object.fromEntries(phases.flatMap((phase) => [
      [`api_phase_latency{phase:${phase}}`, ['p(95)<500']],
      [`api_phase_failure_rate{phase:${phase}}`, ['rate<0.01']],
    ])),
    ...Object.fromEntries(endpoints.flatMap((endpoint) => [
      [`api_endpoint_latency{endpoint:${endpoint}}`, ['p(95)<500']],
      [`api_endpoint_failure_rate{endpoint:${endpoint}}`, ['rate<0.01']],
      [`api_endpoint_calls{endpoint:${endpoint}}`, ['count>0']],
    ])),
  },
};

let token = '';

function phaseAt(progress) {
  const elapsed = progress * TOTAL_MS;
  if (elapsed < 30_000) return 'ramp20';
  if (elapsed < 60_000) return 'steady20';
  if (elapsed < 90_000) return 'ramp50';
  if (elapsed < 270_000) return 'steady50';
  return 'cooldown';
}

function requestParams(endpoint, phase, authenticated = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;
  const names = {
    cartelera: 'GET /api/funciones/vigentes',
    login: 'POST /api/auth/login',
    bloquear: 'POST /api/sillas/bloquear',
    reserva: 'POST /api/reservas',
    pago: 'POST /api/pagos/procesar',
    consulta_reserva: 'GET /api/reservas/:id',
  };
  return {
    headers,
    timeout: '10s',
    tags: { endpoint, name: names[endpoint] || endpoint },
  };
}

function record(endpoint, phase, response, valid, description) {
  const passed = check(response, { [description]: () => valid });
  endpointLatency.add(response.timings.duration, { endpoint });
  endpointFailures.add(!passed, { endpoint });
  endpointCalls.add(1, { endpoint });
  phaseLatency.add(response.timings.duration, { phase });
  phaseFailures.add(!passed, { phase });
  return passed;
}

function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function saveFlow(failed, startedAt) {
  flowCount.add(1);
  flowFailures.add(failed);
  flowDuration.add(Date.now() - startedAt);
}

function resultMetric(data, name) {
  return data.metrics[name]?.values || {};
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function number(value, suffix = '') {
  return `${Number(value || 0).toFixed(2)}${suffix}`;
}

function phaseChart(data, metricName, title, key, suffix) {
  const values = phases.map((phase) => ({
    phase,
    value: resultMetric(data, `${metricName}{phase:${phase}}`)[key] || 0,
  }));
  const max = Math.max(...values.map(({ value }) => value), 1);
  const bars = values.map(({ phase, value }, index) => {
    const x = 70 + index * 138;
    const height = Math.max(2, (value / max) * 130);
    const y = 160 - height;
    return `<rect x="${x}" y="${y}" width="72" height="${height}" fill="#2f81f7"/><text x="${x + 36}" y="183" text-anchor="middle">${phase}</text><text x="${x + 36}" y="${y - 7}" text-anchor="middle">${number(value, suffix)}</text>`;
  }).join('');
  return `<section><h2>${title}</h2><svg viewBox="0 0 760 205" role="img" aria-label="${title}"><line x1="40" y1="160" x2="730" y2="160" stroke="#888"/>${bars}</svg></section>`;
}

function report(data) {
  const endpointRows = endpoints.map((endpoint) => {
    const latency = resultMetric(data, `api_endpoint_latency{endpoint:${endpoint}}`);
    const failures = resultMetric(data, `api_endpoint_failure_rate{endpoint:${endpoint}}`);
    const calls = resultMetric(data, `api_endpoint_calls{endpoint:${endpoint}}`);
    return `<tr><td>${endpoint}</td><td>${number(latency.avg, ' ms')}</td><td>${number(latency['p(95)'], ' ms')}</td><td>${number(calls.rate, ' req/s')}</td><td>${number((failures.rate || 0) * 100, '%')}</td></tr>`;
  }).join('');
  const duration = resultMetric(data, 'http_req_duration');
  const requests = resultMetric(data, 'http_reqs');
  const httpFailures = resultMetric(data, 'http_req_failed');
  const checkout = resultMetric(data, 'checkout_duration');
  const checkoutFailure = resultMetric(data, 'checkout_failure_rate');
  const firstDegradedPhase = phases.find((phase) => (
    (resultMetric(data, `api_phase_latency{phase:${phase}}`)['p(95)'] || 0) >= 500
    || (resultMetric(data, `api_phase_failure_rate{phase:${phase}}`).rate || 0) >= 0.01
  ));
  const vus = resultMetric(data, 'vus_max').value || 50;
  const thresholds = Object.entries(data.metrics)
    .flatMap(([name, metric]) => Object.entries(metric.thresholds ?? {})
      .filter(([, threshold]) => !threshold.ok)
      .map(([expression]) => `${name}: ${expression}`));
  const thresholdReport = thresholds.length
    ? `<ul>${thresholds.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`
    : '<p>Todos los umbrales configurados se cumplieron.</p>';
  const date = new Date().toISOString();
  const interpretation = firstDegradedPhase
    ? `La primera fase que superó el umbral API fue ${firstDegradedPhase}.`
    : 'No se observó una fase que superara el umbral API.';
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Informe HT12 - carga normal</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#222}section{margin:2rem 0}svg{width:100%;max-width:760px;background:#f6f8fa}h1,h2{color:#0969da}table{border-collapse:collapse;width:100%;font-size:.92rem}td,th{border:1px solid #d0d7de;padding:.5rem;text-align:right}td:first-child,th:first-child{text-align:left}.notice{padding:1rem;background:#fff8c5}code{overflow-wrap:anywhere}</style><h1>HT12: carga normal de cartelera, login y checkout</h1><p>Generado: ${date}</p><p>Objetivo local: <code>${escapeHtml(BASE_URL)}</code> · Duración: 5 min · Pico: ${vus} VUs.</p><section><h2>Métricas generales</h2><table><tbody><tr><th>Solicitudes</th><td>${Math.round(requests.count || 0)}</td></tr><tr><th>Latencia API promedio</th><td>${number(duration.avg, ' ms')}</td></tr><tr><th>Latencia API p95</th><td>${number(duration['p(95)'], ' ms')}</td></tr><tr><th>Throughput</th><td>${number(requests.rate, ' req/s')}</td></tr><tr><th>Errores HTTP</th><td>${number((httpFailures.rate || 0) * 100, '%')}</td></tr><tr><th>Flujos de checkout</th><td>${Math.round(resultMetric(data, 'checkout_flows').count || 0)}</td></tr><tr><th>Checkout promedio / p95</th><td>${number(checkout.avg, ' ms')} / ${number(checkout['p(95)'], ' ms')}</td></tr><tr><th>Flujos de negocio fallidos</th><td>${number((checkoutFailure.rate || 0) * 100, '%')}</td></tr></tbody></table></section><section><h2>Métricas por endpoint</h2><table><thead><tr><th>Endpoint</th><th>Promedio</th><th>p95</th><th>Throughput</th><th>Errores</th></tr></thead><tbody>${endpointRows}</tbody></table></section>${phaseChart(data, 'api_phase_latency', 'Latencia API p95 por fase', 'p(95)', ' ms')}${phaseChart(data, 'api_phase_failure_rate', 'Errores de API por fase', 'rate', '%')}<section><h2>Umbrales e interpretación</h2><p>Objetivos: latencia API p95 &lt; 500 ms, checkout p95 &lt; 3 s y errores &lt; 1%. ${interpretation}</p>${thresholdReport}<p>La carga se ejecuta en una API local con PostgreSQL temporal y datos sintéticos. No mide ni representa Render o Neon.</p></section><p class="notice">No apuntar la prueba a producción. Para detectar saturación en el despliegue, repetir solo en staging autorizado y correlacionar estos tiempos con métricas de CPU, memoria y base de datos.</p></html>`;
}

export default function () {
  const phase = phaseAt(exec.scenario.progress);
  const startedAt = Date.now();
  let failed = false;
  const root = BASE_URL.replace(/\/$/, '');
  const username = `${USER_PREFIX}${__VU}`;

  const catalog = http.get(`${root}/api/funciones/vigentes?page=1&size=20`, requestParams('cartelera', phase));
  const catalogBody = catalog.status === 200 ? parseJson(catalog) : null;
  failed = !record('cartelera', phase, catalog,
    catalog.status === 200 && Array.isArray(catalogBody?.content), 'cartelera responde con funciones') || failed;

  if (!token || __ITER % LOGIN_INTERVAL === 0) {
    const login = http.post(`${root}/api/auth/login`, JSON.stringify({
      username,
      password: PASSWORD,
    }), requestParams('login', phase));
    const loginBody = login.status === 200 ? parseJson(login) : null;
    const validLogin = login.status === 200 && typeof loginBody?.token === 'string';
    failed = !record('login', phase, login, validLogin, 'login devuelve token') || failed;
    if (validLogin) token = loginBody.token;
  }

  if (!token) {
    saveFlow(true, startedAt);
    sleep(THINK_TIME_SECONDS);
    return;
  }

  const userFunctionIds = FUNCTION_IDS.slice((__VU - 1) * FUNCTIONS_PER_USER, __VU * FUNCTIONS_PER_USER);
  const functionIndex = Math.floor(__ITER / SEATS_PER_FUNCTION) % userFunctionIds.length;
  const funcionId = userFunctionIds[functionIndex];
  const seatIndex = __ITER % SEATS_PER_FUNCTION;
  const codigoSilla = `${String.fromCharCode(65 + Math.floor(seatIndex / ROOM_COLUMNS))}${(seatIndex % ROOM_COLUMNS) + 1}`;

  const bloqueo = http.post(`${root}/api/sillas/bloquear`, JSON.stringify({
    funcionId,
    codigos: [codigoSilla],
  }), requestParams('bloquear', phase, true));
  const bloqueoBody = bloqueo.status === 200 ? parseJson(bloqueo) : null;
  const bloqueoOk = bloqueo.status === 200 && bloqueoBody?.sillasBloqueadas?.includes(codigoSilla);
  failed = !record('bloquear', phase, bloqueo, bloqueoOk, 'silla bloqueada') || failed;
  if (!bloqueoOk) {
    saveFlow(true, startedAt);
    sleep(THINK_TIME_SECONDS);
    return;
  }

  const reserva = http.post(`${root}/api/reservas`, JSON.stringify({
    funcionId,
    sillas: [codigoSilla],
  }), requestParams('reserva', phase, true));
  const reservaBody = reserva.status === 201 ? parseJson(reserva) : null;
  const reservaOk = reserva.status === 201 && Number(reservaBody?.resCode) > 0;
  failed = !record('reserva', phase, reserva, reservaOk, 'reserva creada') || failed;
  if (!reservaOk) {
    saveFlow(true, startedAt);
    sleep(THINK_TIME_SECONDS);
    return;
  }

  const tipoPago = __ITER % 2 === 0 ? 'NEQUI' : 'PSE';
  const pago = http.post(`${root}/api/pagos/procesar`, JSON.stringify({
    resCode: reservaBody.resCode,
    tipoPago,
  }), requestParams('pago', phase, true));
  const pagoBody = pago.status === 201 ? parseJson(pago) : null;
  const pagoOk = pago.status === 201
    && pagoBody?.estadoPago === 'APROBADO'
    && pagoBody?.estadoReserva === 'CONFIRMADA';
  failed = !record('pago', phase, pago, pagoOk, 'pago aprobado y reserva confirmada') || failed;
  if (!pagoOk) {
    saveFlow(true, startedAt);
    sleep(THINK_TIME_SECONDS);
    return;
  }

  const consulta = http.get(`${root}/api/reservas/${reservaBody.resCode}`,
    requestParams('consulta_reserva', phase, true));
  const consultaBody = consulta.status === 200 ? parseJson(consulta) : null;
  const consultaOk = consulta.status === 200 && consultaBody?.estado === 'CONFIRMADA';
  failed = !record('consulta_reserva', phase, consulta, consultaOk, 'reserva confirmada consultable') || failed;
  saveFlow(failed, startedAt);
  sleep(THINK_TIME_SECONDS);
}

export function handleSummary(data) {
  const output = {
    [`${REPORT_DIR}/summary.json`]: JSON.stringify(data, null, 2),
    [`${REPORT_DIR}/report.html`]: report(data),
  };
  const requestMetrics = resultMetric(data, 'http_reqs');
  const durationMetrics = resultMetric(data, 'http_req_duration');
  const failureMetrics = resultMetric(data, 'http_req_failed');
  const summary = `\nHT12 carga normal: ${data.state.testRunDurationMs} ms\nSolicitudes: ${Math.round(requestMetrics.count || 0)}; promedio: ${number(durationMetrics.avg, ' ms')}; p95: ${number(durationMetrics['p(95)'], ' ms')}; throughput: ${number(requestMetrics.rate, ' req/s')}; errores HTTP: ${number((failureMetrics.rate || 0) * 100, '%')}.\nReporte: ${REPORT_DIR}/report.html\n`;
  output.stdout = summary;
  return output;
}
