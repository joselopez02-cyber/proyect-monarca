import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');
const reset = process.argv.includes('--reset');

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Copia .env.example a .env y revisa los valores.');
  }

  if (reset) {
    console.log('Borrando todas las tablas...');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  for (const file of ['01_schema.sql', '02_seed.sql']) {
    console.log(`Ejecutando ${file} ...`);
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }

  const tablas = ['usuario', 'cine', 'sucursal', 'gestor', 'cliente', 'sala',
                  'pelicula', 'funcion', 'reserva', 'silla', 'transaccion'];
  console.log('\nFilas por tabla:');
  for (const t of tablas) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    console.log(`  ${t.padEnd(12)} ${rows[0].n}`);
  }
  console.log('\nBase de datos lista.');
}

run()
  .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
