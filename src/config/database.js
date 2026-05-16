
const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

async function connectDB() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,                // max connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });

  // Test the connection
  const client = await pool.connect();
  await client.query('SELECT NOW()');
  client.release();

  // Log unexpected pool errors (don't crash on idle client errors)
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
    logger.debug(`DB query executed in ${duration}ms: ${text.substring(0, 80)}`);
    return result;
  } catch (error) {
    logger.error('DB query error:', { text: text.substring(0, 80), error: error.message });
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

// DDL: Create Tables
const CREATE_TABLES_SQL = `
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE IF NOT EXISTS users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    phone_number    VARCHAR(20),
    role            VARCHAR(20)  DEFAULT 'reporter'  CHECK (role IN ('reporter','expert','admin')),
    mfa_enabled     BOOLEAN      DEFAULT false,
    mfa_secret      VARCHAR(255),
    email_verified  BOOLEAN      DEFAULT false,
    account_status  VARCHAR(20)  DEFAULT 'active'    CHECK (account_status IN ('active','suspended','deleted')),
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP    DEFAULT NOW(),
    updated_at      TIMESTAMP    DEFAULT NOW(),
    deleted_at      TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);
`;

async function runMigrations() {
  await query(CREATE_TABLES_SQL);
  logger.info('✅ Database migrations applied');
}

module.exports = { connectDB, getPool, query, withTransaction, runMigrations };
