const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12;
const TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set.');
  return crypto.createHash('sha256').update(raw).digest();
}

// Returns "iv:authTag:ciphertext" (hex, colon-separated)
function encrypt(plaintext) {
  const key    = getKey();
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

// Throws if tampered — GCM auth tag is always verified
function decrypt(encryptedValue) {
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format.');

  const [ivHex, authTagHex, dataHex] = parts;
  const key      = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'), { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

// Cryptographically secure 6-digit OTP (no modulo bias)
function generateOtp() {
  return crypto.randomInt(100_000, 999_999).toString();
}

// Constant-time string comparison — prevents timing oracle attacks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // consume time before returning false
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { encrypt, decrypt, generateOtp, timingSafeEqual };
