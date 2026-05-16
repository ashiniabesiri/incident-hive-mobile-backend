
const rateLimit = require('express-rate-limit');

// Shared options
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


// Limiters

const authLimiter = rateLimit({
  ...sharedOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX        || '5',     10),
  message:  'Too many authentication attempts. Please try again in 15 minutes.',
  // store: makeRedisStore('rl:auth:'),
});

const loginLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  skipSuccessfulRequests: true, // Only count failed logins
  message: 'Too many failed login attempts. Please try again in 15 minutes.',
  // store: makeRedisStore('rl:login:'),
});

const registerLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many registration attempts from this IP. Please try again in an hour.',
  // store: makeRedisStore('rl:register:'),
});

const mfaLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: 'Too many MFA attempts. Please try again in 15 minutes.',
  // store: makeRedisStore('rl:mfa:'),
});

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
