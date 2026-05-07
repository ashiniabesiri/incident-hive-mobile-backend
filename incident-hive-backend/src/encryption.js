/**
 * utils/encryption.js
 * AES-256-GCM symmetric encryption for sensitive data at rest
 * (e.g., biometric keys, MFA secrets before storing in the DB).
 *
 * Format:  iv:authTag:ciphertext  (all hex-encoded, colon-separated)
 */

const crypto = require('crypto');

const ALGORITHM   = 'aes-256-gcm';
const IV_LENGTH   = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH  = 16;   // 128-bit auth tag

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY env var.
 * In production, ENCRYPTION_KEY should itself be a 32-byte hex string or
 * a sufficiently random passphrase.
 */
function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set');
  // SHA-256 hash to ensure we always get exactly 32 bytes regardless of input length
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  iv:authTag:ciphertext  (hex-encoded, colon-separated)
 */
function encrypt(plaintext) {
  const key    = getKey();
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * @param {string} encryptedValue  iv:authTag:ciphertext  (hex-encoded)
 * @returns {string} Original plaintext
 * @throws  {Error}  If the data is tampered with (auth tag mismatch) or malformed
 */
function decrypt(encryptedValue) {
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format');

  const [ivHex, authTagHex, dataHex] = parts;

  const key     = getKey();
  const iv      = Buffer.from(ivHex,      'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data    = Buffer.from(dataHex,    'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Generate a cryptographically secure random 6-digit OTP.
 */
function generateOtp() {
  // Use crypto.randomInt for uniform distribution
  const code = crypto.randomInt(100000, 999999);
  return code.toString();
}

/**
 * Constant-time string comparison to prevent timing attacks when
 * comparing OTP codes or tokens.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a comparison to consume constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { encrypt, decrypt, generateOtp, timingSafeEqual };
