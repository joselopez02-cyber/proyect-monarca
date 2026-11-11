import EmbeddedPostgres from 'embedded-postgres';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { existsSync } from 'node:fs';
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
const frontendRoot = path.resolve(root, '..', 'frontend');
const profile = process.argv[2] || 'catalog';
if (!['catalog', 'ht12'].includes(profile)) {
  throw new Error(`Perfil de rendimiento desconocido: ${profile}. Usa "catalog" o "ht12".`);
}
const isHt12 = profile === 'ht12';
const resultsDir = path.resolve(root, process.env.PERFORMANCE_RESULTS_DIR
  || (isHt12 ? 'tests/performance/results-ht12' : 'tests/performance/results'));
const scriptPath = path.join(root, 'tests', 'performance', isHt12 ? 'normal-load.js' : 'ramp.js');
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

function detenerProcesosPostgresHuerfanos(pid) {
  if (process.platform !== 'win32' || !pid) return;
  const script = `
    $root = ${Number(pid)};
    $all = @(Get-CimInstance Win32_Process);
    $known = New-Object 'System.Collections.Generic.HashSet[int]';
    [void]$known.Add($root);
    $children = New-Object 'System.Collections.Generic.List[int]';
    $found = $true;
    while ($found) {
      $found = $false;
      foreach ($entry in $all) {
        $id = [int]$entry.ProcessId;
        if ($entry.Name -eq 'postgres.exe' -and $known.Contains([int]$entry.ParentProcessId) -and -not $known.Contains($id)) {
          [void]$known.Add($id);
          $children.Add($id);
          $found = $true;
        }
      }
    }
    foreach ($childId in $children) {
      Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue;
    }
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`No se pudieron detener los procesos PostgreSQL descendientes del PID ${pid}.`);
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
    await client.query(`
      SELECT setval(pg_get_serial_sequence('pelicula', 'movie_id'), (SELECT MAX(movie_id) FROM pelicula), true),
             setval(pg_get_serial_sequence('sala', 'sala_id'), (SELECT MAX(sala_id) FROM sala), true),
             setval(pg_get_serial_sequence('funcion', 'funcion_id'), (SELECT MAX(funcion_id) FROM funcion), true)
    `);
    await client.query('ANALYZE funcion');
    process.stdout.write('Semilla sintética: 100 películas, 200 salas y 108.000 funciones desde 59 días atrás hasta 30 días adelante.\n');
  } finally {
    await client.end();
  }
}

async function seedHt12(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  const usuarioCount = 50;
  const funcionesPorUsuario = 10;
  const usuarioPrefix = `ht12_${randomBytes(8).toString('hex')}`;
  const password = randomBytes(18).toString('hex');
  const passwordHash = await bcrypt.hash(password, 12);

  await client.connect();
  try {
    const { rows: cineRows } = await client.query(
      "INSERT INTO cine (nombre_del_cine, cine_cont) VALUES ('Cine de carga HT12', 'Fixture local') RETURNING cine_id");
    const { rows: sucursalRows } = await client.query(
      'INSERT INTO sucursal (bran_location, cine_id) VALUES ($1, $2) RETURNING bran_id',
      [`Sucursal HT12 ${usuarioPrefix}`, cineRows[0].cine_id]);
    const { rows: salaRows } = await client.query(
      `INSERT INTO sala (nombre, tipo, capacidad, filas, columnas, sucursal_id)
       VALUES ($1, 'DOS_D', 1300, 26, 50, $2) RETURNING sala_id`,
      [`Sala HT12 ${usuarioPrefix}`, sucursalRows[0].bran_id]);
    const { rows: peliculaRows } = await client.query(
      `INSERT INTO pelicula (nombre, descripcion, duracion_min, genero, clasificacion)
       VALUES ($1, 'Fixture sintético para carga local', 120, 'Drama', 'TE')
       RETURNING movie_id`,
      [`Película HT12 ${usuarioPrefix}`]);

    await client.query(
      `INSERT INTO usuario (username, email, password_hash, rol, nombre_completo)
       SELECT $1 || n, $1 || n || '@example.test', $2, 'USER', 'Usuario de carga HT12'
         FROM generate_series(1, $3::int) AS n`,
      [usuarioPrefix, passwordHash, usuarioCount]);
    await client.query(
      `INSERT INTO cliente (nombre_cliente, cust_age, direccion_cliente, numero_cliente, usuario_id)
       SELECT 'Cliente HT12', 30, username || '@example.test', '3000000000', usuario_id
         FROM usuario
        WHERE username = ANY($1::text[])`,
      [Array.from({ length: usuarioCount }, (_, index) => `${usuarioPrefix}${index + 1}`)]);

    const { rows: nextIdRows } = await client.query(
      'SELECT COALESCE(MAX(funcion_id), 0) + 1 AS first_id FROM funcion');
    const firstFunctionId = Number(nextIdRows[0].first_id);
    await client.query(
      `INSERT INTO funcion
         (funcion_id, movie_id, sala_id, fecha, hora_inicio, precio_boleto, capacidad_total, asientos_disponibles)
       SELECT $1::bigint + ((usuario.n - 1) * $2::int) + (funcion.n - 1),
              $3, $4, TO_CHAR(CURRENT_DATE + 1, 'YYYY-MM-DD'), '23:50', 16000, 1300, 1300
         FROM generate_series(1, $5::int) AS usuario(n)
         CROSS JOIN generate_series(1, $2::int) AS funcion(n)`,
      [firstFunctionId, funcionesPorUsuario, peliculaRows[0].movie_id, salaRows[0].sala_id, usuarioCount]);
    await client.query('ANALYZE usuario');
    await client.query('ANALYZE cliente');
    await client.query('ANALYZE funcion');

    const functionIds = Array.from(
      { length: usuarioCount * funcionesPorUsuario },
      (_, index) => firstFunctionId + index);
    process.stdout.write(
      `Fixture HT12: ${usuarioCount} cuentas, ${usuarioCount} clientes y ${functionIds.length} funciones locales para reserva y pago.\n`);
    return { usuarioPrefix, password, functionIds, funcionesPorUsuario };
  } finally {
    await client.end();
  }
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function runLighthouse(baseUrl) {
  const browser = chromePath();
  if (!browser) throw new Error('No se encontró Chrome o Edge. Configura CHROME_PATH para ejecutar Lighthouse.');

  const evidenceDir = path.join(root, 'tests', 'performance', 'evidence');
  const outputPath = path.join(evidenceDir, 'ht12-lighthouse');
  const lighthouseArgs = [
    'exec', '--yes', '--package=lighthouse@12.8.2', '--',
    'lighthouse', baseUrl,
    '--only-categories=performance',
    '--output=html', '--output=json',
    `--output-path=${outputPath}`,
    `--chrome-path=${browser}`,
    '--chrome-flags=--headless=new',
    '--quiet',
  ];
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...lighthouseArgs], { cwd: root, encoding: 'utf8', stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
      '--yes', 'lighthouse@12.8.2', baseUrl,
      '--only-categories=performance',
      '--output=html', '--output=json',
      `--output-path=${outputPath}`,
      `--chrome-path=${browser}`,
      '--chrome-flags=--headless=new',
      '--quiet',
    ], { cwd: root, encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Lighthouse terminó con código ${result.status}.`);
  process.stdout.write('Informe Lighthouse guardado en tests/performance/evidence/.\n');
}

try {
  const version = spawnSync(k6, ['version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) {
    throw new Error('No se encontró k6. Instala Grafana k6 y comprueba `k6 version` antes de ejecutar la rampa.');
  }
  process.stdout.write(`${version.stdout.trim()}\n`);

  if (isHt12) {
    const frontendBuild = spawnSync(process.execPath, [
      path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build',
    ], { cwd: frontendRoot, encoding: 'utf8', stdio: 'inherit' });
    if (frontendBuild.error) throw frontendBuild.error;
    if (frontendBuild.status !== 0) throw new Error(`La compilación del frontend terminó con código ${frontendBuild.status}.`);
  }

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
  const ht12Fixture = isHt12 ? await seedHt12(databaseUrl) : null;

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
  const loadEnv = {
    ...process.env,
    BASE_URL: baseUrl,
    REPORT_DIR: resultsDir,
  };
  delete loadEnv.DATABASE_URL;
  delete loadEnv.TEST_DATABASE_URL;
  delete loadEnv.JWT_SECRET;
  if (ht12Fixture) {
    loadEnv.HT12_USER_PREFIX = ht12Fixture.usuarioPrefix;
    loadEnv.HT12_PASSWORD = ht12Fixture.password;
    loadEnv.HT12_FUNCTION_IDS = ht12Fixture.functionIds.join(',');
    loadEnv.HT12_FUNCTIONS_PER_USER = String(ht12Fixture.funcionesPorUsuario);
  }
  process.stdout.write(isHt12
    ? 'Objetivo local verificado: 127.0.0.1; ejecutando prueba HT12 de 20–50 VUs durante 5 minutos.\n'
    : 'Objetivo local verificado: 127.0.0.1; ejecutando rampa de cartelera de 0–50 VUs por 3 min y recuperación de 1 min.\n');

  const result = spawnSync(k6, [
    'run',
    '--summary-export', path.join(resultsDir, 'k6-summary.json'),
    scriptPath,
  ], {
    cwd: root,
    env: loadEnv,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    process.stdout.write(`k6 finalizó con código ${result.status}; revisa los umbrales y el informe generado.\n`);
  }
  if (isHt12) runLighthouse(baseUrl);
} finally {
  try {
    await detenerApi(server);
  } finally {
    const postgresPid = postgres?.process?.pid;
    try {
      if (postgres) await postgres.stop();
    } finally {
      try {
        detenerProcesosPostgresHuerfanos(postgresPid);
      } finally {
        if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
      }
    }
  }
}
