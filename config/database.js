/**
 * config/database.js
 * PostgreSQL connection pool using the pg library.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const logger = require('../utils/logger');

// Parse NUMERIC/DECIMAL (OID 1700) as JS Number so JSON responses serialise
// budget and other money columns as numbers, not strings. Precision loss is
// acceptable here — budgets are bounded by the app's max value.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

let pool;

async function connectDB() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized: true,
            ...(process.env.DB_SSL_CA_PATH && {
              ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8'),
            }),
          }
        : false,
  });

  const client = await pool.connect();

  try {
    await client.query('SELECT NOW()');
  } finally {
    client.release();
  }

  pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error:', err);
  });

  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialised. Call connectDB() first.');
  }

  return pool;
}

async function query(text, params) {
  const start = Date.now();

  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;

    logger.debug(`DB [${duration}ms]: ${text.substring(0, 100)}`);

    return result;
  } catch (error) {
    logger.error('DB query error:', {
      sql: text.substring(0, 100),
      error: error.message,
      code: error.code,
    });

    throw error;
  }
}

async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDB() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

async function runMigrations() {
  await connectDB();

  const schemaPath = path.join(__dirname, '..', 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.sql not found at: ${schemaPath}`);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  await query(schemaSql);

  logger.info('✅ Database schema applied from schema.sql');

  await closeDB();
}

module.exports = {
  connectDB,
  getPool,
  query,
  withTransaction,
  closeDB,
  runMigrations,
};