import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.AUTH_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/auth_service';

let pool = null;

export function getPgPool() {
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2500,
    });

    pool.on('error', (err) => {
      console.warn('[AUTH-INTEGRATION] Unexpected idle PostgreSQL client error:', err.message);
    });
  }
  return pool;
}

/**
 * Execute a query with error safety and connection check
 */
export async function query(text, params = []) {
  const p = getPgPool();
  try {
    return await p.query(text, params);
  } catch (error) {
    console.error('[AUTH-INTEGRATION] PostgreSQL Query Error:', error.message);
    throw error;
  }
}

/**
 * Health check to verify PostgreSQL connectivity without throwing
 */
export async function isPgConnected() {
  try {
    const p = getPgPool();
    const client = await p.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Close PostgreSQL pool (useful during test teardown or graceful shutdown)
 */
export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

