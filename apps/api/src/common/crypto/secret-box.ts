import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for secrets stored in the database (e.g. WhatsApp
 * access tokens). Output format: `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 *
 * The key is `ENCRYPTION_KEY`: 32 random bytes encoded as 64 hex chars
 * (generate with `openssl rand -hex 32`). It must never be committed.
 */
const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'v1';

function parseKey(keyHex: string | undefined): Buffer {
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be set to 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32');
  }
  return Buffer.from(keyHex, 'hex');
}

export function encryptSecret(plaintext: string, keyHex: string | undefined): string {
  const key = parseKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptSecret(payload: string, keyHex: string | undefined): string {
  const key = parseKey(keyHex);
  const [prefix, ivB64, tagB64, dataB64] = payload.split(':');
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unrecognised encrypted secret format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** True when the stored value looks like output of encryptSecret(). */
export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}:`) && value.split(':').length === 4;
}
