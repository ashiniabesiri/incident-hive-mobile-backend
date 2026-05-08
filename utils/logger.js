/**
 * utils/logger.js
 * Winston logger — structured JSON in production, colourised in development.
 * Used by every layer: config, middleware, services, controllers.
 */

const { createLogger, format, transports } = require('winston');

const { combine, timestamp, errors, json, colorize, printf } = format;

const isDev = process.env.NODE_ENV !== 'production';

// ─── Development Format ────────────────────────────────────────────────────────
// Human-readable, colourised, timestamp + stack traces on errors.
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `${timestamp} [${level}]: ${message}\n${stack}`
      : `${timestamp} [${level}]: ${message}`
  )
);

// ─── Production Format ─────────────────────────────────────────────────────────
// Structured JSON so log aggregators (Datadog, CloudWatch, etc.) can parse it.
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  // LOG_LEVEL env override; defaults to debug in dev, info in production
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
  ],
});

// ─── HTTP level ────────────────────────────────────────────────────────────────
// Morgan pipes its access-log messages here via stream.write.
logger.http = (message) => logger.log('http', message);

module.exports = logger;
