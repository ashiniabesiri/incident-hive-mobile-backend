
require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

// Infrastructure
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');

// Swagger definition
const swaggerDefinition = require('./docs/swaggerDefinition');

// Route files
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const bidRoutes = require('./routes/bidRoutes');
const expertRoutes = require('./routes/expertRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const contentRoutes = require('./routes/contentRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Global middleware
const errorHandler = require('./middleware/errorHandler');
const auditLog     = require('./middleware/auditLog');

const app = express();

const PORT = parseInt(process.env.PORT || '3000', 10);
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

// Per-request CSP nonce
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: true,
  })
);

// CORS
const corsAllowlist = (process.env.FRONTEND_URL || 'http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // native mobile / curl / same-origin
      if (process.env.NODE_ENV !== 'production') return cb(null, true);
      if (corsAllowlist.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Body parsing + compression
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
    skip: (req) => req.url === '/health',
  })
);

if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/api-docs',
    (req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
      );
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(swaggerDefinition, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Incident Hive API Docs',
    })
  );
}

// Health check
const healthHandler = async (req, res) => {
  const { getPool } = require('./config/database');
  const { getRedis } = require('./config/redis');

  let dbStatus = 'unknown';
  let redisStatus = 'unknown';

  try {
    await getPool().query('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  try {
    await getRedis().ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  });
};
app.get('/health', healthHandler);
app.get(`${API_PREFIX}/health`, healthHandler);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'incident-hive-api', api: API_PREFIX });
});

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Audit logging (state-changing requests only)
app.use(auditLog);

// API routes with /api/v1 prefix
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/profile`, profileRoutes);
// bidRoutes must mount BEFORE incidentRoutes: both share /incidents, and
// otherwise intercept expert-only bid endpoints (e.g. POST /:id/bids).
app.use(`${API_PREFIX}/incidents`, bidRoutes);
app.use(`${API_PREFIX}/incidents`, incidentRoutes);
app.use(API_PREFIX, expertRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(API_PREFIX, contentRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found.`,
    },
  });
});

// Global error handler
app.use(errorHandler);

// Server bootstrap
async function startServer() {
  try {
    await connectDB();
    logger.info('PostgreSQL connected');

    await connectRedis();
    logger.info('Redis connected');

    const HOST = process.env.HOST || 'localhost';
    app.listen(PORT, HOST, () => {
      logger.info(`Incident Hive API running on ${HOST}:${PORT}`);
      logger.info(`API docs  →  http://localhost:${PORT}/api-docs`);
      logger.info(`Health    →  http://localhost:${PORT}/health`);
      logger.info(`API base  →  http://localhost:${PORT}${API_PREFIX}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);

  try {
    const { getPool } = require('./config/database');
    const { getRedis } = require('./config/redis');

    await getPool().end();
    await getRedis().quit();

    logger.info('All connections closed. Goodbye.');
  } catch (err) {
    logger.error('Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Boot
startServer();

module.exports = app;