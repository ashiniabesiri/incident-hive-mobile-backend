/**
 * middleware/rateLimit.js
 * Express-rate-limit configurations for different endpoint groups.
 *
 * All limiters use the in-memory store (default) so they work out of the box.
 * For multi-instance deployments, swap the store for RedisStore (see comment below).
 */

const rateLimit = require('express-rate-limit');

// ─── Shared options ────────────────────────────────────────────────────────────
const sharedOptions = {
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders:   false,  // Don't use X-RateLimit-* headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait before trying again.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
};

/*
 * ─── Redis Store (for multi-instance deployments) ─────────────────────────────
 * Uncomment and install 'rate-limit-redis' to share rate limit state across
 * multiple server instances:
 *
 * const { RedisStore } = require('rate-limit-redis');
 * const { getRedis } = require('../config/redis');
 *
 * function makeRedisStore(prefix) {
 *   return new RedisStore({
 *     sendCommand: (...args) => getRedis().call(...args),
 *     prefix,
 *   });
 * }
 */

// ─── Limiters ──────────────────────────────────────────────────────────────────

/**
 * General auth limiter — applied to all /api/auth/* routes.
 * 5 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  ...sharedOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX        || '5',     10),
  message:  'Too many authentication attempts. Please try again in 15 minutes.',
  // store: makeRedisStore('rl:auth:'),
});

/**
 * Login limiter — stricter, prevents brute-force attacks.
 * 5 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  skipSuccessfulRequests: true, // Only count failed logins
  message: 'Too many failed login attempts. Please try again in 15 minutes.',
  // store: makeRedisStore('rl:login:'),
});

/**
 * Registration limiter — prevents mass account creation.
 * 3 attempts per hour per IP.
 */
const registerLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many registration attempts from this IP. Please try again in an hour.',
  // store: makeRedisStore('rl:register:'),
});

/**
 * MFA code limiter — prevents OTP brute-force.
 * 10 attempts per 15 minutes per IP.
 */
const mfaLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: 'Too many MFA attempts. Please try again in 15 minutes.',
  // store: makeRedisStore('rl:mfa:'),
});

/**
 * Password change limiter.
 * 5 per hour per IP.
 */
const passwordLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many password change attempts. Please try again in an hour.',
  // store: makeRedisStore('rl:password:'),
});

module.exports = {
  authLimiter,
  loginLimiter,
  registerLimiter,
  mfaLimiter,
  passwordLimiter,
};
