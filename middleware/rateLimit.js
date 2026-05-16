const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

function rateLimitHandler(req, res) {
  const retryAfterSeconds = req.rateLimit?.resetTime
    ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    : null;

  // Log every rate-limit hit so devs can see why a request was rejected
  logger.warn(
    `Rate limit hit: ${req.method} ${req.originalUrl} | email=${req.body?.email || '-'} | retry_after=${retryAfterSeconds}s`
  );

  return res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before trying again.',
      details: {
        retry_after_seconds: retryAfterSeconds,
      },
    },
  });
}

const commonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
};

const authLimiter = rateLimit({
  ...commonOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
});

const loginLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

// previous config:
//     email, etc.) don't consume the budget, so a few bad attempts in a row
const registerLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 3 : 1000,
  skipFailedRequests: true,
});

const refreshLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.body?.device_id || req.ip,
});

// 10 OTP attempts / 15 min
const mfaLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
});

const biometricEnrollLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const userId = req.user?.userId || 'unknown';
    const deviceId = req.body?.device_id || 'unknown';
    return `${userId}:${deviceId}`;
  },
});

const verifyEmailLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.email?.toLowerCase() || req.ip,
});

const resendVerificationLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.body?.email?.toLowerCase() || req.ip,
});

const biometricLoginLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const userId = req.body?.user_id || 'unknown';
    const deviceId = req.body?.device_id || 'unknown';
    return `bio-login:${userId}:${deviceId}`;
  },
});

// 5 password changes / hour
const passwordLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
});

module.exports = {
  authLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  biometricEnrollLimiter,
  biometricLoginLimiter,
  mfaLimiter,
  passwordLimiter,
};