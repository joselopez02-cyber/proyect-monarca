import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

if (process.env.NODE_ENV === 'production') {
  throw new Error('La prueba de estrés no se ejecuta con NODE_ENV=production.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const resultsDir = path.resolve(root, process.env.PERFORMANCE_RESULTS_DIR || 'tests/performance/results');
const k6 = process.env.K6_BIN || 'k6';
let postgres;
let databaseDir;
let server;

async function puertoDisponible() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function ejecutarNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Node terminó con código ${result.status}.`);
}

async function esperarApi(baseUrl) {
  const limite = Date.now() + 30_000;
  while (Date.now() < limite) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok && (await response.json()).db === 'up') return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error('La API local no respondió health dentro de 30 segundos.');
}

function esperarSalida(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const alSalir = () => {
      clearTimeout(limite);
      resolve(true);
    };
    const limite = setTimeout(() => {
      child.removeListener('exit', alSalir);
      resolve(false);
    }, timeoutMs);
    child.once('exit', alSalir);
  });
}

async function detenerApi(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await esperarSalida(child, 15_000)) return;
  child.kill('SIGKILL');
  if (!await esperarSalida(child, 5_000)) {
    throw new Error('No se pudo detener el servidor local de la prueba de rendimiento.');
  }
}

async function seedCatalogo(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO pelicula (movie_id, nombre, descripcion, duracion_min, genero, clasificacion)
      SELECT id, 'Película de carga ' || id, 'Dato sintético para benchmark local', 120, 'Drama', 'PG-13'
        FROM generate_series(1, 100) AS id
    `);
    await client.query(`
      INSERT INTO sala (sala_id, nombre, tipo, capacidad, filas, columnas)
      SELECT id, 'Sala de carga ' || id, 'DOS_D', 120, 10, 12
        FROM generate_series(1, 200) AS id
    `);
    await client.query(`
      INSERT INTO funcion (funcion_id, movie_id, sala_id, fecha, hora_inicio, precio_boleto, capacidad_total, asientos_disponibles)
      SELECT slot.id + 1,
             ((slot.id * 17) % 100) + 1,
             (slot.id / 540) + 1,
             TO_CHAR(CURRENT_DATE + ((slot.id % 540) / 6) - 59, 'YYYY-MM-DD'),
             TO_CHAR(TIME '10:00' + ((slot.id % 6) * INTERVAL '2 hours'), 'HH24:MI'),
             16000, 120, 120
        FROM generate_series(0, 107999) AS slot(id)
    `);
    await client.query('ANALYZE funcion');
    process.stdout.write('Semilla sintética: 100 películas, 200 salas y 108.000 funciones desde 59 días atrás hasta 30 días adelante.\n');
  } finally {
    await client.end();
  }
}

try {
  const version = spawnSync(k6, ['version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) {
    throw new Error('No se encontró k6. Instala Grafana k6 y comprueba `k6 version` antes de ejecutar la rampa.');
  }
  process.stdout.write(`${version.stdout.trim()}\n`);

  const databasePort = await puertoDisponible();
  const apiPort = await puertoDisponible();
  databaseDir = await mkdtemp(path.join(os.tmpdir(), 'monarca-stress-'));
  postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: randomBytes(24).toString('hex'),
    port: databasePort,
    initdbFlags: ['--encoding=UTF8'],
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: (message) => process.stdout.write(`[PostgreSQL] ${message}\n`),
    onError: (message) => process.stderr.write(`[PostgreSQL] ${message}\n`),
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('cinema_monarca_test');

  const databaseUrl = `postgres://postgres:${postgres.options.password}@127.0.0.1:${databasePort}/cinema_monarca_test`;
  const serverEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'test',
    PORT: String(apiPort),
    RATE_LIMIT_MAX: '100000',
  };
  process.stdout.write('Aplicando migraciones a PostgreSQL temporal...\n');
  ejecutarNode(['scripts/migrate.js', 'up'], serverEnv);
  await seedCatalogo(databaseUrl);

  const serverCode = `
    import app from './src/app.js';
    import pool from './src/db.js';
    const server = app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('Local stress API ready'));
    process.once('SIGTERM', () => {
      server.closeAllConnections();
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    });
  `;
  server = spawn(process.execPath, ['--input-type=module', '-e', serverCode], {
    cwd: root,
    env: serverEnv,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await esperarApi(baseUrl);
  await mkdir(resultsDir, { recursive: true });
  process.stdout.write('Objetivo local verificado: 127.0.0.1; ejecutando rampa de cartelera de 0–50 VUs por 3 min y recuperación de 1 min.\n');

  const result = spawnSync(k6, [
    'run',
    '--summary-export', path.join(resultsDir, 'k6-summary.json'),
    path.join(root, 'tests/performance/ramp.js'),
  ], {
    cwd: root,
    env: { ...serverEnv, BASE_URL: baseUrl, REPORT_DIR: resultsDir },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    process.stdout.write(`k6 finalizó con código ${result.status}; revisa los umbrales y el informe generado.\n`);
  }
} finally {
  try {
    await detenerApi(server);
  } finally {
    try {
      if (postgres) await postgres.stop();
    } finally {
      if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
    }
  }
}
