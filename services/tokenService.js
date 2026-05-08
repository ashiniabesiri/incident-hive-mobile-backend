const jwt            = require('jsonwebtoken');
const crypto         = require('crypto');
const fs             = require('fs');
const path           = require('path');
const { v4: uuidv4 } = require('uuid');
const { set, get, del } = require('../config/redis');
const logger         = require('../utils/logger');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const REFRESH_PREFIX    = 'refresh:';
const SESSION_PREFIX    = 'session:';
const BLACKLIST_PREFIX  = 'blacklist:';

const ACCESS_TTL  = parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS  || '900',    10);
const REFRESH_TTL = parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS       || '1800',   10);

// ─── RSA Key Loading ─────────────────────────────────────────────────────────
function loadKey(envPath, envInline) {
  if (envInline) return envInline.replace(/\\n/g, '\n');
  if (envPath) {
    const resolved = path.isAbsolute(envPath)
      ? envPath
      : path.join(process.cwd(), envPath);
    return fs.readFileSync(resolved, 'utf8');
  }
  return null;
}

const privateKey = loadKey(process.env.JWT_PRIVATE_KEY_PATH, process.env.JWT_PRIVATE_KEY);
const publicKey  = loadKey(process.env.JWT_PUBLIC_KEY_PATH,  process.env.JWT_PUBLIC_KEY);

const useRS256 = !!(privateKey && publicKey);

const SIGN_KEY      = useRS256 ? privateKey : process.env.JWT_ACCESS_SECRET;
const VERIFY_KEY    = useRS256 ? publicKey  : process.env.JWT_ACCESS_SECRET;
const REFRESH_SIGN  = useRS256 ? privateKey : process.env.JWT_REFRESH_SECRET;
const REFRESH_VERIFY = useRS256 ? publicKey : process.env.JWT_REFRESH_SECRET;
const SIGN_OPTIONS  = useRS256 ? { algorithm: 'RS256' } : {};
const VERIFY_OPTIONS = useRS256 ? { algorithms: ['RS256'] } : {};

if (useRS256) {
  logger.info('JWT signing: RS256 (RSA asymmetric)');
} else {
  logger.warn('JWT signing: HS256 (symmetric fallback). Set JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH for RS256.');
}

const TokenService = {

  generateAccessToken({ userId, email, role, amr = ['pwd'] }) {
    return jwt.sign(
      { sub: userId, email, role, type: 'access', amr, jti: uuidv4() },
      SIGN_KEY,
      { expiresIn: ACCESS_TTL, ...SIGN_OPTIONS }
    );
  },

  verifyAccessToken(token) {
    return jwt.verify(token, VERIFY_KEY, VERIFY_OPTIONS);
  },

  async generateRefreshToken(userId, deviceId = null) {
    const payload = { sub: userId, jti: uuidv4(), type: 'refresh' };
    if (deviceId) payload.device_id = deviceId;

    const token = jwt.sign(payload, REFRESH_SIGN, {
      expiresIn: REFRESH_TTL,
      ...SIGN_OPTIONS,
    });
    await set(`${REFRESH_PREFIX}${userId}`, hashToken(token), REFRESH_TTL);
    return token;
  },

  async validateRefreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, REFRESH_VERIFY, VERIFY_OPTIONS);
    } catch {
      throw new Error('Invalid or expired refresh token.');
    }

    if (decoded.type !== 'refresh') throw new Error('Token type mismatch.');

    const userId = decoded.sub;
    const stored = await get(`${REFRESH_PREFIX}${userId}`);

    if (!stored || stored !== hashToken(token)) {
      await del(`${REFRESH_PREFIX}${userId}`, `${SESSION_PREFIX}${userId}`);
      logger.warn(`Refresh token replay detected for user ${userId}`);
      const err = new Error('Token reuse detected. All sessions revoked. Please log in again.');
      err.code = 'TOKEN_REPLAY';
      throw err;
    }

    return { userId, deviceId: decoded.device_id || null };
  },

  async rotateRefreshToken(userId, email, role, deviceId = null) {
    await del(`${REFRESH_PREFIX}${userId}`);
    const accessToken  = TokenService.generateAccessToken({ userId, email, role });
    const refreshToken = await TokenService.generateRefreshToken(userId, deviceId);
    return { accessToken, refreshToken };
  },

  async blacklistRefreshToken(refreshTokenString) {
    let decoded;
    try {
      decoded = jwt.verify(refreshTokenString, REFRESH_VERIFY, VERIFY_OPTIONS);
    } catch {
      decoded = jwt.decode(refreshTokenString);
    }

    if (!decoded?.jti) return;

    const remainingTtl = decoded.exp
      ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1)
      : REFRESH_TTL;

    await set(`${BLACKLIST_PREFIX}${decoded.jti}`, '1', remainingTtl);
    await del(`${REFRESH_PREFIX}${decoded.sub}`);
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
