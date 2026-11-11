import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const REPORT_DIR = __ENV.REPORT_DIR || './tests/performance/results';
const TARGET_PATH = '/api/funciones/vigentes?page=1&size=20';
const target = BASE_URL.match(/^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?\/?$/i);
const hostname = target?.[1].replace(/^\[|\]$/g, '');

if (!hostname || !['localhost', '127.0.0.1', '::1'].includes(hostname)) {
  throw new Error('La prueba de rampa solo permite localhost; no se enviará carga a servicios remotos.');
}

const phaseDuration = new Trend('api_latency', true);
const phaseFailures = new Rate('api_failure_rate');
const phases = ['ramp', 'peak', 'cooldown', 'recovery'];
const schedule = [
  { duration: '30s', target: 10 },
  { duration: '30s', target: 10 },
  { duration: '40s', target: 25 },
  { duration: '20s', target: 25 },
  { duration: '40s', target: 50 },
  { duration: '20s', target: 50 },
  { duration: '10s', target: 1 },
  { duration: '50s', target: 1 },
];
const RAMP_MS = 160_000;
const PEAK_MS = 180_000;
const COOL_DOWN_MS = 10_000;
const TOTAL_MS = 240_000;

export const options = {
  scenarios: {
    api_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: schedule,
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    'api_latency{phase:ramp}': ['p(95)<500'],
    'api_latency{phase:peak}': ['p(95)<500'],
    'api_latency{phase:cooldown}': ['p(95)<500'],
    'api_latency{phase:recovery}': ['p(95)<500'],
    'api_failure_rate{phase:ramp}': ['rate<0.01'],
    'api_failure_rate{phase:peak}': ['rate<0.01'],
    'api_failure_rate{phase:cooldown}': ['rate<0.01'],
    'api_failure_rate{phase:recovery}': ['rate<0.01'],
  },
};

function phaseAt(progress) {
  const elapsed = progress * TOTAL_MS;
  if (elapsed < RAMP_MS) return 'ramp';
  if (elapsed < PEAK_MS) return 'peak';
  if (elapsed < PEAK_MS + COOL_DOWN_MS) return 'cooldown';
  return 'recovery';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function chart(data, metricName, title, formatter) {
  const values = phases.map((phase) => {
    const metric = data.metrics[`${metricName}{phase:${phase}}`];
    return { phase, value: metric?.values?.[formatter.key] ?? 0 };
  });
  const max = Math.max(...values.map((entry) => entry.value), formatter.minimum ?? 1);
  const bars = values.map(({ phase, value }, index) => {
    const x = 95 + index * 190;
    const height = Math.max(2, (value / max) * 145);
    const y = 175 - height;
    return `<rect x="${x}" y="${y}" width="95" height="${height}" fill="#2f81f7"/><text x="${x + 47}" y="198" text-anchor="middle">${phase}</text><text x="${x + 47}" y="${y - 8}" text-anchor="middle">${formatter.format(value)}</text>`;
  }).join('');
  return `<section><h2>${title}</h2><svg viewBox="0 0 760 225" role="img" aria-label="${title}"><line x1="55" y1="175" x2="720" y2="175" stroke="#888"/>${bars}</svg></section>`;
}

function vuChart() {
  const points = [
    [0, 0], [30, 10], [60, 10], [100, 25], [120, 25],
    [160, 50], [180, 50], [190, 1], [240, 1],
  ];
  const line = points.map(([seconds, vus]) =>
    `${65 + (seconds / 240) * 650},${185 - (vus / 50) * 150}`).join(' ');
  const labels = [0, 60, 120, 180, 240].map((seconds) => {
    const x = 65 + (seconds / 240) * 650;
    return `<text x="${x}" y="208" text-anchor="middle">${seconds}s</text>`;
  }).join('');
  return `<section><h2>Rampa de usuarios virtuales</h2><svg viewBox="0 0 760 225" role="img" aria-label="Rampa de 0 a 50 usuarios y recuperación"><line x1="65" y1="185" x2="715" y2="185" stroke="#888"/><line x1="65" y1="35" x2="65" y2="185" stroke="#888"/><polyline points="${line}" fill="none" stroke="#2f81f7" stroke-width="3"/><text x="20" y="40">50 VUs</text><text x="20" y="185">0</text>${labels}</svg><p>160 s de incremento hasta 50 VUs, 20 s en el máximo, descenso a 1 VU y 50 s de observación de recuperación.</p></section>`;
}

function report(data) {
  const failedThresholds = Object.entries(data.metrics)
    .flatMap(([name, metric]) => Object.entries(metric.thresholds ?? {})
      .filter(([, threshold]) => !threshold.ok)
      .map(([expression]) => `${name}: ${expression}`));
  const firstFailure = phases.find((phase) =>
    failedThresholds.some((failure) => failure.includes(`phase:${phase}`)));
  const finding = firstFailure
    ? `Primera fase que excedió los umbrales observados: ${firstFailure}.`
    : 'No se observó degradación por encima de los umbrales hasta 50 VUs; esta prueba no determina el punto de quiebre superior.';
  const thresholdList = failedThresholds.length
    ? `<ul>${failedThresholds.map((failure) => `<li>${escapeHtml(failure)}</li>`).join('')}</ul>`
    : '<p>Todos los umbrales configurados se cumplieron.</p>';
  const customCharts = chart(data, 'api_latency', 'Latencia de cartelera por fase (p95)', {
    key: 'p(95)', format: (value) => `${Math.round(value)} ms`,
  });
  const errorChart = chart(data, 'api_failure_rate', 'Tasa de fallo API por fase', {
    key: 'rate', format: (value) => `${(value * 100).toFixed(2)}%`,
  });
  const date = new Date().toISOString();
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Informe de estrés local</title><style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#222}section{margin:2rem 0}svg{width:100%;max-width:760px;background:#f6f8fa}h1,h2{color:#0969da}.notice{padding:1rem;background:#fff8c5}code{overflow-wrap:anywhere}</style><h1>Prueba de estrés de cartelera (entorno local)</h1><p>Generado: ${date}</p><p>Objetivo: <code>${escapeHtml(BASE_URL + TARGET_PATH)}</code> · Máximo: 50 VUs · Duración: 4 min.</p>${vuChart()}${customCharts}${errorChart}<section><h2>Resultado e interpretación</h2><p>${escapeHtml(finding)}</p><p>La medición recorre el endpoint paginado de cartelera y PostgreSQL local con datos sintéticos. No mide Render ni Neon ni permite atribuir por sí sola el límite a CPU/RAM.</p>${thresholdList}<p>Umbrales: p95 &lt; 500 ms y fallos &lt; 1%. La degradación se define como el primer umbral por fase que no se cumpla.</p></section><p class="notice">No extrapolar estos resultados al despliegue Render/Neon ni ejecutar la rampa contra producción. Aumenta el límite solo con autorización y monitorización del entorno objetivo.</p></html>`;
}

export default function () {
  const phase = phaseAt(exec.scenario.progress);
  const response = http.get(`${BASE_URL.replace(/\/$/, '')}${TARGET_PATH}`, {
    tags: { phase },
    timeout: '5s',
  });
  const body = response.status === 200 ? response.json() : null;
  const healthy = response.status === 200
    && Array.isArray(body?.content)
    && body.totalElementos > 0;
  check(response, {
    'cartelera responde HTTP 200 con funciones': () => healthy,
  });
  phaseDuration.add(response.timings.duration, { phase });
  phaseFailures.add(!healthy, { phase });
  sleep(1);
}

export function handleSummary(data) {
  const output = {
    [`${REPORT_DIR}/summary.json`]: JSON.stringify(data, null, 2),
    [`${REPORT_DIR}/report.html`]: report(data),
  };
  const failed = Object.entries(data.metrics)
    .flatMap(([name, metric]) => Object.entries(metric.thresholds ?? {})
      .filter(([, threshold]) => !threshold.ok)
      .map(([expression]) => `${name}: ${expression}`));
  output.stdout = `\nResultado k6 local: ${failed.length ? 'DEGRADACIÓN DETECTADA' : 'umbrales cumplidos hasta 50 VUs'}\n${failed.length ? failed.join('\n') : 'p95 < 500 ms y errores < 1% en las fases observadas.'}\nGráficas e informe: ${REPORT_DIR}/report.html\n`;
  return output;
}
