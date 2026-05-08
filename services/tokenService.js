const jwt            = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { set, get, del } = require('../config/redis');
const logger         = require('../utils/logger');

const REFRESH_PREFIX = 'refresh:';
const SESSION_PREFIX = 'session:';

const ACCESS_TTL  = parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS  || '900',    10);
const REFRESH_TTL = parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS       || '1800',   10);

const TokenService = {

  generateAccessToken({ userId, email, role, amr = ['pwd'] }) {
    return jwt.sign(
      { sub: userId, email, role, type: 'access', amr },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: ACCESS_TTL }
    );
  },

  verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  },

  async generateRefreshToken(userId) {
    const token = jwt.sign(
      { sub: userId, jti: uuidv4(), type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TTL }
    );
    await set(`${REFRESH_PREFIX}${userId}`, token, REFRESH_TTL);
    return token;
  },

  async validateRefreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new Error('Invalid or expired refresh token.');
    }

    if (decoded.type !== 'refresh') throw new Error('Token type mismatch.');

    const userId = decoded.sub;
    const stored = await get(`${REFRESH_PREFIX}${userId}`);

    if (!stored || stored !== token) {
      await del(`${REFRESH_PREFIX}${userId}`, `${SESSION_PREFIX}${userId}`);
      logger.warn(`Refresh token replay detected for user ${userId}`);
      const err = new Error('Token reuse detected. All sessions revoked. Please log in again.');
      err.code = 'TOKEN_REPLAY';
      throw err;
    }

    return { userId, deviceId: decoded.device_id || null };
  },

  async rotateRefreshToken(userId, email, role) {
    await del(`${REFRESH_PREFIX}${userId}`);
    const accessToken  = TokenService.generateAccessToken({ userId, email, role });
    const refreshToken = await TokenService.generateRefreshToken(userId);
    return { accessToken, refreshToken };
  },

  async revokeAllTokens(userId) {
    await del(`${REFRESH_PREFIX}${userId}`, `${SESSION_PREFIX}${userId}`);
  },

  async touchSession(userId) {
    await set(`${SESSION_PREFIX}${userId}`, 'active', SESSION_TTL);
  },

  async isSessionActive(userId) {
    return (await get(`${SESSION_PREFIX}${userId}`)) === 'active';
  },

};

TokenService.ACCESS_TTL  = ACCESS_TTL;
TokenService.SESSION_TTL = SESSION_TTL;

module.exports = TokenService;
