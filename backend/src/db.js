import 'dotenv/config';
import pg from 'pg';

// Una sola conexion compartida (pool) para toda la API
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export default pool;
