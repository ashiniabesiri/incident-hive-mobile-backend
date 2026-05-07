/**
 * config/redis.js
 * Redis client singleton using ioredis.
 *
 * Key naming conventions used across the app:
 *   refresh:{userId}        → refresh token string,   TTL = 7 days
 *   session:{userId}        → "active",               TTL = 30 min (rolling)
 *   verify:{email}          → 6-digit code string,    TTL = 15 min
 *   mfa:{email}             → 6-digit code string,    TTL = 15 min
 *   biometric:{userId}      → biometric public key,   TTL = 30 days
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

/**
 * Creates and connects the Redis client.
 * Resolves when the client emits 'ready'.
 */
async function connectRedis() {
  return new Promise((resolve, reject) => {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.error('Redis: max reconnect attempts reached');
          return null; // stop retrying
        }
        return Math.min(times * 100, 3000); // exponential backoff up to 3 s
      },
      lazyConnect: false,
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      resolve(redisClient);
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err.message);
      // Don't reject after initial connect; ioredis handles reconnects internally
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
    });

    // Reject the promise only on the initial connection attempt
    redisClient.once('error', reject);
    setTimeout(() => redisClient.removeListener('error', reject), 5000);
  });
}

/**
 * Returns the active Redis client.
 * Throws if connectRedis() has not been called yet.
 */
function getRedis() {
  if (!redisClient) {
    throw new Error('Redis not initialised. Call connectRedis() first.');
  }
  return redisClient;
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

/** Store a value with an optional TTL (seconds). */
async function set(key, value, ttlSeconds) {
  const client = getRedis();
  if (ttlSeconds) {
    return client.set(key, value, 'EX', ttlSeconds);
  }
  return client.set(key, value);
}

/** Retrieve a value; returns null if the key doesn't exist. */
async function get(key) {
  return getRedis().get(key);
}

/** Delete one or more keys. */
async function del(...keys) {
  return getRedis().del(...keys);
}

/** Reset the TTL on an existing key (slide the expiry window). */
async function expire(key, ttlSeconds) {
  return getRedis().expire(key, ttlSeconds);
}

/** Check whether a key exists (returns 1 or 0). */
async function exists(key) {
  return getRedis().exists(key);
}

module.exports = { connectRedis, getRedis, set, get, del, expire, exists };
