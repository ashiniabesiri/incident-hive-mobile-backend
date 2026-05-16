
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { set, get, del } = require('../config/redis');
const logger = require('../utils/logger');

const REFRESH_PREFIX = 'refresh:';
const SESSION_PREFIX = 'session:';

const ACCESS_TTL  = parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS  || '900',    10); // 15 min
const REFRESH_TTL = parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10); // 7 days
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS       || '1800',   10); // 30 min

const TokenService = {
  // Access Token

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

  verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  },

  // Refresh Token

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
    } catch (err) {
      throw new Error('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new Error('Token type mismatch');
    }

    const userId = decoded.sub;
    const stored = await get(`${REFRESH_PREFIX}${userId}`);

    if (!stored || stored !== token) {
      await del(`${REFRESH_PREFIX}${userId}`, `${SESSION_PREFIX}${userId}`);
      logger.warn(`Possible refresh token reuse detected for user ${userId}`);
      throw new Error('Refresh token reuse detected. Please log in again.');
    }

    return { userId };
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

  // Session (Inactivity TTL)

  async touchSession(userId) {
    await set(`${SESSION_PREFIX}${userId}`, 'active', SESSION_TTL);
  },

  async isSessionActive(userId) {
    const val = await get(`${SESSION_PREFIX}${userId}`);
    return val === 'active';
  },

  // Biometric Token

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
