import pg from 'pg';
import logger from '../logger.js';

const { Pool } = pg;

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', (err) => {
      logger.fatal(err, 'Unexpected idle database client error');
    });
  }
  return pool;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
    logger.info('Database pool closed');
  }
}

export { getPool, closePool };
