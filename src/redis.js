
const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

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

    redisClient.once('error', reject);
    setTimeout(() => redisClient.removeListener('error', reject), 5000);
  });
}

function getRedis() {
  if (!redisClient) {
    throw new Error('Redis not initialised. Call connectRedis() first.');
  }
  return redisClient;
}

// Convenience Helpers

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
