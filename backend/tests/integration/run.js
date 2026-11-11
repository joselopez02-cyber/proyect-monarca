import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.test' });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Las pruebas de integración no se pueden ejecutar con NODE_ENV=production.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const testUrlProvided = Boolean(process.env.TEST_DATABASE_URL);
const databaseUrl = process.env.TEST_DATABASE_URL;
let postgres;
let databaseDir;

async function puertoDisponible() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function ejecutar(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`El comando "${args.join(' ')}" terminó con código ${result.status}.`);
  }
}

try {
  let testDatabaseUrl = databaseUrl;
  if (!testUrlProvided) {
    databaseDir = await mkdtemp(path.join(os.tmpdir(), 'monarca-integration-'));
    postgres = new EmbeddedPostgres({
      databaseDir,
      user: 'postgres',
      password: randomBytes(24).toString('hex'),
      port: await puertoDisponible(),
      initdbFlags: ['--encoding=UTF8'],
      persistent: false,
      autoRehydrateSymlinks: true,
      onLog: (message) => process.stdout.write(`[PostgreSQL] ${message}\n`),
      onError: (message) => process.stderr.write(`[PostgreSQL] ${message}\n`),
    });
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('cinema_monarca_test');
    testDatabaseUrl = `postgres://postgres:${postgres.options.password}@127.0.0.1:${postgres.options.port}/cinema_monarca_test`;
  }

  const testEnv = {
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: randomBytes(32).toString('hex'),
    TEST_DATABASE_URL: testDatabaseUrl,
  };
  if (!testUrlProvided) {
    const migrationEnv = { ...testEnv, DATABASE_URL: testDatabaseUrl };
    process.stdout.write('Aplicando migraciones a PostgreSQL temporal de pruebas...\n');
    ejecutar(['scripts/migrate.js', 'up'], migrationEnv);
  }

  process.stdout.write('Ejecutando pruebas de integración de la API...\n');
  ejecutar(['--import', './tests/integration/setup.js', '--test', './tests/integration/api.test.js'], testEnv);
} finally {
  if (postgres) await postgres.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
}
