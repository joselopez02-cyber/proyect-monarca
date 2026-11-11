import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';

dotenv.config();
dotenv.config({ path: '.env.test' });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Las pruebas de integración no se pueden ejecutar con NODE_ENV=production.');
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('Configura TEST_DATABASE_URL con la URL de una base PostgreSQL exclusiva para pruebas.');
}

let testDatabase;
try {
  testDatabase = new URL(testDatabaseUrl);
} catch {
  throw new Error('TEST_DATABASE_URL no es una URL válida de PostgreSQL.');
}

if (!['postgres:', 'postgresql:'].includes(testDatabase.protocol)) {
  throw new Error('TEST_DATABASE_URL debe usar el protocolo postgres:// o postgresql://.');
}

const databaseName = decodeURIComponent(testDatabase.pathname.slice(1));
if (!/^([a-z0-9]+[_-])*test([_-][a-z0-9]+)*$/i.test(databaseName)) {
  throw new Error('La base de pruebas debe tener "test" como segmento de su nombre (por ejemplo, cinema_monarca_test).');
}

const mismoDestinoPostgres = (a, b) =>
  a.hostname.toLowerCase() === b.hostname.toLowerCase()
  && (a.port || '5432') === (b.port || '5432')
  && decodeURIComponent(a.pathname).toLowerCase() === decodeURIComponent(b.pathname).toLowerCase();

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (configuredDatabaseUrl) {
  try {
    const configuredDatabase = new URL(configuredDatabaseUrl);
    if (mismoDestinoPostgres(configuredDatabase, testDatabase)) {
      throw new Error('DATABASE_URL y TEST_DATABASE_URL apuntan a la misma base; configura una base de pruebas separada.');
    }
  } catch (error) {
    if (error.message.includes('apuntan a la misma base')) throw error;
  }
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.DATABASE_URL = testDatabaseUrl;
