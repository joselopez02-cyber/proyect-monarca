import 'dotenv/config';
import pool from '../src/db.js';
import { aplicarPendientes, revertirUltima, estadoMigraciones } from '../src/utils/migraciones.js';

// Uso:
//   npm run db:migrate                  aplica las migraciones pendientes
//   npm run db:migrate:status           muestra cuáles están aplicadas y cuáles pendientes
//   npm run db:migrate:down             revierte la última migración
const comando = process.argv[2] || 'up';

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Copia .env.example a .env y revisa los valores.');
  }
  if (comando === 'up') {
    console.log('Aplicando migraciones pendientes ...');
    await aplicarPendientes(pool);
  } else if (comando === 'down') {
    console.log('Revirtiendo la última migración ...');
    await revertirUltima(pool, { force: process.argv.includes('--force') });
  } else if (comando === 'status') {
    const estado = await estadoMigraciones(pool);
    for (const m of estado) {
      console.log(`  ${m.aplicada ? '[x]' : '[ ]'} ${m.archivo}${m.aplicada ? `   (${new Date(m.aplicadaEn).toISOString()})` : '   pendiente'}`);
    }
  } else {
    throw new Error(`Comando desconocido "${comando}". Usa: up | down | status`);
  }
}

run()
  .catch((err) => { console.error('Error:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
