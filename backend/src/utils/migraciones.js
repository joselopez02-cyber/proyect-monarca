import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// KAN-61 (HT22): migraciones numeradas y reversibles.
// Cada archivo backend/migrations/NNN_nombre.sql tiene dos secciones: "-- up" (aplicar) y "-- down" (revertir).
// La tabla schema_migrations guarda qué versiones ya se aplicaron; solo se ejecutan las pendientes.
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const CLAVE_BLOQUEO = 727274; // evita que dos procesos migren a la vez (por ejemplo, dos despliegues)

export function leerMigraciones() {
  const lista = fs.readdirSync(DIR)
    .filter((f) => /^\d{3,}_.+\.sql$/.test(f))
    .sort()
    .map((archivo) => {
      const [, version, nombre] = /^(\d+)_(.+)\.sql$/.exec(archivo);
      const texto = fs.readFileSync(path.join(DIR, archivo), 'utf8').replace(/\r\n/g, '\n');
      const m = /^-- up[ \t]*$([\s\S]*?)^-- down[ \t]*$([\s\S]*)$/im.exec(texto);
      if (!m) throw new Error(`${archivo}: debe tener las secciones "-- up" y "-- down".`);
      return { version: Number(version), nombre, archivo, up: m[1].trim(), down: m[2].trim() };
    });
  const vistas = new Set();
  for (const mig of lista) {
    if (vistas.has(mig.version)) throw new Error(`Versión repetida: ${mig.version}.`);
    vistas.add(mig.version);
  }
  return lista;
}

async function conBloqueo(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [CLAVE_BLOQUEO]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version     INT PRIMARY KEY,
         nombre      VARCHAR(200) NOT NULL,
         aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    return await fn(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [CLAVE_BLOQUEO]).catch(() => {});
    client.release();
  }
}

const aplicadas = async (client) =>
  new Map((await client.query('SELECT version, nombre, aplicada_en FROM schema_migrations ORDER BY version')).rows
    .map((r) => [Number(r.version), r]));

// Aplica, en orden, las migraciones que todavía no están registradas. Cada una va en su propia transacción.
export async function aplicarPendientes(pool, log = console.log) {
  const todas = leerMigraciones();
  return conBloqueo(pool, async (client) => {
    const hechas = await aplicadas(client);
    const pendientes = todas.filter((m) => !hechas.has(m.version));
    for (const m of pendientes) {
      try {
        await client.query('BEGIN');
        await client.query(m.up);
        await client.query('INSERT INTO schema_migrations (version, nombre) VALUES ($1, $2)', [m.version, m.nombre]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`La migración ${m.archivo} falló y se deshizo: ${e.message}`);
      }
      log(`  aplicada  ${m.archivo}`);
    }
    if (!pendientes.length) log('  No hay migraciones pendientes.');
    return pendientes;
  });
}

// Revierte solo la última migración aplicada. La 001 (esquema base) borra todo y pide { force: true }.
export async function revertirUltima(pool, { force = false, log = console.log } = {}) {
  const todas = leerMigraciones();
  return conBloqueo(pool, async (client) => {
    const hechas = await aplicadas(client);
    if (!hechas.size) { log('  No hay migraciones aplicadas.'); return null; }
    const ultima = Math.max(...hechas.keys());
    const m = todas.find((x) => x.version === ultima);
    if (!m) throw new Error(`La versión ${ultima} está aplicada pero no existe su archivo en backend/migrations.`);
    if (m.version === 1 && !force) {
      throw new Error('La 001 borra TODAS las tablas. Si de verdad quieres hacerlo: npm run db:migrate:down -- --force');
    }
    try {
      await client.query('BEGIN');
      await client.query(m.down);
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [m.version]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`No se pudo revertir ${m.archivo}: ${e.message}`);
    }
    log(`  revertida ${m.archivo}`);
    return m;
  });
}

export async function estadoMigraciones(pool) {
  const todas = leerMigraciones();
  return conBloqueo(pool, async (client) => {
    const hechas = await aplicadas(client);
    return todas.map((m) => ({
      version: m.version, nombre: m.nombre, archivo: m.archivo,
      aplicada: hechas.has(m.version), aplicadaEn: hechas.get(m.version)?.aplicada_en ?? null,
    }));
  });
}
