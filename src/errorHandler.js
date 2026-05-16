
const logger = require('../utils/logger');

// Known Postgres error codes
const PG_UNIQUE_VIOLATION = '23505';

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error('Unhandled error:', {
    message:  err.message,
    stack:    err.stack,
    method:   req.method,
    url:      req.originalUrl,
    userId:   req.user?.userId,
  });

  // PostgreSQL errors
  if (err.code === PG_UNIQUE_VIOLATION) {
    return res.status(409).json({
      success: false,
      message: 'A resource with those details already exists.',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token has expired.' });
  }

  // Joi validation errors (if thrown directly)
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors:  err.details.map((d) => d.message),
    });
  }

  // Explicit HTTP errors
  if (err.status && err.status < 500) {
    return res.status(err.status).json({
      success: false,
      message: err.message || 'Request error.',
    });
  }

  // Generic 500
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred. Please try again later.',
    // Only expose details in development
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
}

module.exports = errorHandler;
