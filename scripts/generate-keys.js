#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey, 'utf8');
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey, 'utf8');

console.log('RSA key pair generated in keys/ directory:');
console.log('  keys/private.pem  (keep secret)');
console.log('  keys/public.pem');
console.log('');
console.log('Set in .env:');
console.log('  JWT_PRIVATE_KEY_PATH=./keys/private.pem');
console.log('  JWT_PUBLIC_KEY_PATH=./keys/public.pem');
