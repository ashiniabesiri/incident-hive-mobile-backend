/**
 * config/redis.js
 * Redis client singleton using ioredis.
 *
 * ─── Key naming conventions ────────────────────────────────────────────────────
 *   refresh:{userId}     → refresh token string          TTL: 7 days  (604 800 s)
 *   session:{userId}     → "active" string               TTL: 30 min  (1 800 s) — SLIDING
 *   verify:{email}       → 6-digit OTP string            TTL: 15 min  (900 s)
 *   mfa:{email}          → 6-digit OTP string            TTL: 15 min  (900 s)
 *   biometric:{userId}   → encrypted biometric key       TTL: 30 days (2 592 000 s)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Convenience helpers (set / get / del / expire / exists) are exported
 * so no file ever imports the ioredis client directly.
 */

require('dotenv').config();
const Redis = require('ioredis');
const logger = require('../utils/logger');

// ─── Singleton client ──────────────────────────────────────────────────────────
let redisClient;

/**
 * connectRedis
 * Creates the ioredis client and resolves once it emits 'ready'.
 * Must be called once at server startup (called in server.js).
 *
 * @returns {Promise<Redis>} The connected client.
 */
async function connectRedis() {
  return new Promise((resolve, reject) => {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      // ioredis will retry on network hiccups — cap at 5 attempts with backoff
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          logger.error('Redis: max reconnect attempts reached — giving up');
          return null; // Stop retrying; ioredis will emit an error
        }
        const delay = Math.min(times * 200, 3000); // up to 3 s between retries
        logger.warn(`Redis: reconnect attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      // Connect immediately (not lazily) so we know early if Redis is unavailable
      lazyConnect: false,
    });

    // ─── Event handlers ──────────────────────────────────────────────────────

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      resolve(redisClient);
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis: reconnecting...');
    });

    redisClient.on('error', (err) => {
      // Log but don't crash — ioredis will attempt reconnection automatically
      logger.error('Redis error:', err.message);
    });

    // Reject the startup promise only if the very first connect fails
    const onInitialError = (err) => reject(err);
    redisClient.once('error', onInitialError);
    // After 5 s, stop listening for the initial error (normal reconnect path)
    setTimeout(() => redisClient.removeListener('error', onInitialError), 5000);
  });
}

/**
 * getRedis
 * Returns the active client instance.
 * Throws if connectRedis() has not been called.
 *
 * @returns {Redis}
 */
function getRedis() {
  if (!redisClient) {
    throw new Error('Redis not initialised. Call connectRedis() first.');
  }
  return redisClient;
}

// ─── Convenience helpers ───────────────────────────────────────────────────────
// These thin wrappers mean the rest of the codebase never imports ioredis directly,
// making it easy to swap the Redis library or add telemetry later.

/**
 * set
 * Store a string value in Redis with an optional TTL.
 *
 * @param {string} key
 * @param {string} value
 * @param {number} [ttlSeconds]  If provided, key expires after this many seconds.
 */
async function set(key, value, ttlSeconds) {
  const client = getRedis();
  if (ttlSeconds) {
    return client.set(key, value, 'EX', ttlSeconds);
  }
  return client.set(key, value);
}

/**
 * get
 * Retrieve a value by key. Returns null if the key doesn't exist or has expired.
 *
 * @param {string} key
 * @returns {string|null}
 */
async function get(key) {
  return getRedis().get(key);
}

/**
 * del
 * Delete one or more keys atomically.
 *
 * @param {...string} keys
 */
async function del(...keys) {
  return getRedis().del(...keys);
}

/**
 * expire
 * Reset the TTL on an existing key (used for sliding session windows).
 *
 * @param {string} key
 * @param {number} ttlSeconds
 */
async function expire(key, ttlSeconds) {
  return getRedis().expire(key, ttlSeconds);
}

/**
 * exists
 * Check whether a key exists in Redis.
 *
 * @param {string} key
 * @returns {number} 1 if the key exists, 0 if it doesn't.
 */
async function exists(key) {
  return getRedis().exists(key);
}

module.exports = { connectRedis, getRedis, set, get, del, expire, exists };
