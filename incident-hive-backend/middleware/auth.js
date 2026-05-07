const TokenService = require('../services/tokenService');
const logger = require('../utils/logger');

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      return sendError(res, 401, 'ACCESS_TOKEN_REQUIRED', 'Access token required.');
    }

    const token = header.split(' ')[1];
    let decoded;

    try {
      decoded = TokenService.verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 401, 'TOKEN_EXPIRED', 'Session expired. Please log in again.');
      }

      return sendError(res, 401, 'INVALID_ACCESS_TOKEN', 'Invalid access token.');
    }

    const userId = decoded.sub;

    const active = await TokenService.isSessionActive(userId);

    if (!active) {
      return sendError(res, 401, 'SESSION_EXPIRED', 'Session timed out. Please log in again.');
    }

    await TokenService.touchSession(userId);

    req.user = {
      userId,
      email: decoded.email,
      role: decoded.role,
      amr: decoded.amr || ['pwd'],
    };

    return next();
  } catch (err) {
    logger.error('requireAuth error:', err);
    return sendError(res, 500, 'AUTHENTICATION_ERROR', 'Authentication error.');
  }
}

async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      return next();
    }

    const token = header.split(' ')[1];
    let decoded;

    try {
      decoded = TokenService.verifyAccessToken(token);
    } catch {
      return next();
    }

    const userId = decoded.sub;

    if (await TokenService.isSessionActive(userId)) {
      await TokenService.touchSession(userId);

      req.user = {
        userId,
        email: decoded.email,
        role: decoded.role,
        amr: decoded.amr || ['pwd'],
      };
    }
  } catch (err) {
    logger.error('optionalAuth error (non-fatal):', err);
  }

  return next();
}

module.exports = {
  requireAuth,
  optionalAuth,
};
