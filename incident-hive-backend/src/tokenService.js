/**
 * services/tokenService.js
 * JWT generation, verification, and Redis-backed refresh token management.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { set, get, del } = require('../config/redis');
const logger = require('../utils/logger');

// Key prefixes mirror those documented in config/redis.js
const REFRESH_PREFIX = 'refresh:';
const SESSION_PREFIX = 'session:';

const ACCESS_TTL  = parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS  || '900',    10); // 15 min
const REFRESH_TTL = parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10); // 7 days
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS       || '1800',   10); // 30 min

const TokenService = {
  // ─── Access Token ──────────────────────────────────────────────────────────

  /**
   * Generate a short-lived JWT access token.
   * @param {Object} payload - { userId, email, role }
   * @returns {string} Signed JWT
   */
  generateAccessToken(payload) {
    return jwt.sign(
      {
        sub:   payload.userId,
        email: payload.email,
        role:  payload.role,
        type:  'access',
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: ACCESS_TTL }
    );
  },

  /**
   * Verify and decode a JWT access token.
   * @returns {Object} Decoded payload
   * @throws  {Error}  If the token is invalid or expired
   */
  verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  },

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  /**
   * Generate a cryptographically random refresh token, persist it in Redis,
   * and return the token string.
   *
   * Redis key: refresh:{userId}
   * Value:     the refresh token string
   * TTL:       REFRESH_TOKEN_TTL_SECONDS
   */
  async generateRefreshToken(userId) {
    // Use a signed JWT so we can detect tampering even without a Redis lookup
    const token = jwt.sign(
      { sub: userId, jti: uuidv4(), type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TTL }
    );

    // Store in Redis (only the latest token is valid — single-device model)
    await set(`${REFRESH_PREFIX}${userId}`, token, REFRESH_TTL);

    return token;
  },

  /**
   * Validate a refresh token:
   * 1. Verify JWT signature & expiry
   * 2. Confirm it matches what's stored in Redis (detects token reuse after rotation)
   *
   * @returns {{ userId: string }} The decoded token payload
   * @throws  {Error} On any validation failure
   */
  async validateRefreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw new Error('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new Error('Token type mismatch');
    }

    const userId = decoded.sub;
    const stored = await get(`${REFRESH_PREFIX}${userId}`);

    if (!stored || stored !== token) {
      // Possible token reuse attack — invalidate everything
      await del(`${REFRESH_PREFIX}${userId}`, `${SESSION_PREFIX}${userId}`);
      logger.warn(`Possible refresh token reuse detected for user ${userId}`);
      throw new Error('Refresh token reuse detected. Please log in again.');
    }

    return { userId };
  },

  /**
   * Rotate refresh token: delete the old one, issue a new one.
   * Returns both new tokens.
   */
  async rotateRefreshToken(userId, email, role) {
    // Delete old refresh token from Redis first
    await del(`${REFRESH_PREFIX}${userId}`);

    const accessToken  = TokenService.generateAccessToken({ userId, email, role });
    const refreshToken = await TokenService.generateRefreshToken(userId);

    return { accessToken, refreshToken };
  },

  /**
   * Invalidate all tokens for a user (logout / account deletion).
   */
  async revokeAllTokens(userId) {
    await del(`${REFRESH_PREFIX}${userId}`, `${SESSION_PREFIX}${userId}`);
  },

  // ─── Session (Inactivity TTL) ─────────────────────────────────────────────

  /**
   * Create or refresh the sliding session window in Redis.
   * Called by the auth middleware on every authenticated request.
   */
  async touchSession(userId) {
    await set(`${SESSION_PREFIX}${userId}`, 'active', SESSION_TTL);
  },

  /**
   * Check whether the user's session is still active.
   * Returns false if the key has expired (user was inactive for SESSION_TTL).
   */
  async isSessionActive(userId) {
    const val = await get(`${SESSION_PREFIX}${userId}`);
    return val === 'active';
  },

  // ─── Biometric Token ──────────────────────────────────────────────────────

  /**
   * Generate a short-lived token used in the biometric login flow.
   */
  generateBiometricToken(userId) {
    return jwt.sign(
      { sub: userId, type: 'biometric' },
      process.env.BIOMETRIC_JWT_SECRET,
      { expiresIn: '5m' }
    );
  },

  verifyBiometricToken(token) {
    const decoded = jwt.verify(token, process.env.BIOMETRIC_JWT_SECRET);
    if (decoded.type !== 'biometric') throw new Error('Token type mismatch');
    return decoded;
  },
};

module.exports = TokenService;
