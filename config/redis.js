
require('dotenv').config();
const Redis = require('ioredis');
const logger = require('../utils/logger');

// Singleton client
let redisClient;

async function connectRedis() {
  return new Promise((resolve, reject) => {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          logger.error('Redis: max reconnect attempts reached — giving up');
          return null;
        }
        const delay = Math.min(times * 200, 3000); // up to 3 s between retries
        logger.warn(`Redis: reconnect attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      lazyConnect: false,
    });

    // Event handlers

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

    const onInitialError = (err) => reject(err);
    redisClient.once('error', onInitialError);
    setTimeout(() => redisClient.removeListener('error', onInitialError), 5000);
  });
}

function getRedis() {
  if (!redisClient) {
    throw new Error('Redis not initialised. Call connectRedis() first.');
  }
  return redisClient;
}

// Convenience helpers

async function set(key, value, ttlSeconds) {
  const client = getRedis();
  if (ttlSeconds) {
    return client.set(key, value, 'EX', ttlSeconds);
  }
  return client.set(key, value);
}

async function get(key) {
  return getRedis().get(key);
}

async function del(...keys) {
  return getRedis().del(...keys);
}

async function expire(key, ttlSeconds) {
  return getRedis().expire(key, ttlSeconds);
}

async function exists(key) {
  return getRedis().exists(key);
}

module.exports = { connectRedis, getRedis, set, get, del, expire, exists };
