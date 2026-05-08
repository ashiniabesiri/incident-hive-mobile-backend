const rateLimit = require('express-rate-limit');

function rateLimitHandler(req, res) {
  const retryAfterSeconds = req.rateLimit?.resetTime
    ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    : null;

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

// Baseline — applied to all /api/v1/auth/* routes
const authLimiter = rateLimit({
  ...commonOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
});

// 5 failed attempts / 15 min — only failed requests count
const loginLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

// 3 registrations / hour
const registerLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  max: 3,
});

// 10 refresh attempts / 15 min per device_id
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

// 3 biometric enrolment attempts / 15 min per user_id + device_id
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

// 5 password changes / hour
const passwordLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
});

module.exports = {
  authLimiter,
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  biometricEnrollLimiter,
  mfaLimiter,
  passwordLimiter,
};