/**
 * middleware/errorHandler.js
 * Global error-handling middleware.
 */

const logger = require('../utils/logger');

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_NOT_NULL_VIOLATION = '23502';

function sendError(res, status, code, message, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.userId || 'unauthenticated',
  });

  // PostgreSQL errors
  if (err.code === PG_UNIQUE_VIOLATION) {
    return sendError(
      res,
      409,
      'DUPLICATE_RECORD',
      'A record with those details already exists.'
    );
  }

  if (err.code === PG_FOREIGN_KEY_VIOLATION) {
    return sendError(
      res,
      409,
      'FOREIGN_KEY_VIOLATION',
      'Referenced resource does not exist.'
    );
  }

  if (err.code === PG_NOT_NULL_VIOLATION) {
    return sendError(
      res,
      400,
      'REQUIRED_FIELD_MISSING',
      'A required field is missing.'
    );
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(
      res,
      401,
      'INVALID_ACCESS_TOKEN',
      'Invalid token. Please log in again.'
    );
  }

  if (err.name === 'TokenExpiredError') {
    return sendError(
      res,
      401,
      'TOKEN_EXPIRED',
      'Token has expired. Please log in again.'
    );
  }

  // Joi validation errors
  if (err.isJoi) {
    return sendError(
      res,
      422,
      'VALIDATION_ERROR',
      'Validation failed.',
      err.details.map((d) => d.message.replace(/['"]/g, ''))
    );
  }

  // Explicit HTTP errors
  if (err.status && err.status < 500) {
    return sendError(
      res,
      err.status,
      err.code || 'REQUEST_ERROR',
      err.message || 'Request error.'
    );
  }

  // Fallback 500
  return sendError(
    res,
    500,
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.',
    process.env.NODE_ENV === 'development'
      ? { detail: err.message }
      : null
  );
}

module.exports = errorHandler;