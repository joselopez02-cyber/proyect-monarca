import EmbeddedPostgres from 'embedded-postgres';
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

  const serverCode = `
    import app from './src/app.js';
    const server = app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('Local stress API ready'));
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `;
  server = spawn(process.execPath, ['--input-type=module', '-e', serverCode], {
    cwd: root,
    env: serverEnv,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await esperarApi(baseUrl);
  await mkdir(resultsDir, { recursive: true });
  process.stdout.write('Objetivo local verificado: 127.0.0.1; ejecutando rampa de 0–50 VUs por 3 min y recuperación de 1 min.\n');

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
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      server.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (postgres) await postgres.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
}
