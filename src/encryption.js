
const crypto = require('crypto');

const ALGORITHM   = 'aes-256-gcm';
const IV_LENGTH   = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH  = 16;   // 128-bit auth tag

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set');
  return crypto.createHash('sha256').update(raw).digest();
}

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

function generateOtp() {
  const code = crypto.randomInt(100000, 999999);
  return code.toString();
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { encrypt, decrypt, generateOtp, timingSafeEqual };
