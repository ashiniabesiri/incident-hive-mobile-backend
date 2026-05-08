/**
 * middleware/auth.js
 * JWT verification middleware.
 *
 * - Extracts the Bearer token from the Authorization header
 * - Verifies the JWT signature and expiry
 * - Checks the Redis session is still active (inactivity guard)
 * - Slides the session TTL on every request
 * - Attaches { userId, email, role } to req.user
 */

const TokenService = require('../services/tokenService');
const logger = require('../utils/logger');

/**
 * requireAuth
 * Protect any route — rejects requests without a valid, unexpired JWT.
 */
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

    // 1. Verify JWT signature + expiry
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

    // 2. Check Redis session is still alive (30-min inactivity window)
    const sessionActive = await TokenService.isSessionActive(userId);
    if (!sessionActive) {
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please log in again.',
      });
    }

    // 3. Slide the inactivity TTL forward
    await TokenService.touchSession(userId);

    // 4. Attach user info for downstream handlers
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

/**
 * optionalAuth
 * Like requireAuth but doesn't reject unauthenticated requests.
 * Used on endpoints that serve different data based on whether the user is logged in.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // unauthenticated — continue without req.user
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
    // Silently ignore invalid tokens in optional mode
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
