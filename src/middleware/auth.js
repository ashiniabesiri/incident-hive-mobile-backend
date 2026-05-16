
const TokenService = require('../services/tokenService');
const logger = require('../utils/logger');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required. Please log in.',
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = TokenService.verifyAccessToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Your session has expired. Please log in again.'
          : 'Invalid access token. Please log in again.';
      return res.status(401).json({ success: false, message });
    }

    const userId = decoded.sub;

    const sessionActive = await TokenService.isSessionActive(userId);
    if (!sessionActive) {
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please log in again.',
      });
    }

    await TokenService.touchSession(userId);

    req.user = {
      userId,
      email: decoded.email,
      role:  decoded.role,
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Authentication error. Please try again.' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = TokenService.verifyAccessToken(token);
    const userId = decoded.sub;

    const sessionActive = await TokenService.isSessionActive(userId);
    if (sessionActive) {
      await TokenService.touchSession(userId);
      req.user = { userId, email: decoded.email, role: decoded.role };
    }
  } catch {
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
