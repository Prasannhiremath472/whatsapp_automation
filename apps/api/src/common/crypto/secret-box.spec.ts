import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret-box';

const KEY = 'a'.repeat(64);

describe('secret-box', () => {
  it('round-trips a secret', () => {
    const token = 'EAAG-example-access-token';
    const stored = encryptSecret(token, KEY);
    expect(stored).not.toContain(token);
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(decryptSecret(stored, KEY)).toBe(token);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });

  it('rejects tampered ciphertext', () => {
    const [p, iv, tag, data] = encryptSecret('secret', KEY).split(':');
    const flipped = Buffer.from(data!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptSecret([p, iv, tag, flipped.toString('base64')].join(':'), KEY)).toThrow();
  });

  it('rejects the wrong key', () => {
    expect(() => decryptSecret(encryptSecret('secret', KEY), 'b'.repeat(64))).toThrow();
  });

  it('refuses to work without a valid key', () => {
    expect(() => encryptSecret('x', undefined)).toThrow(/ENCRYPTION_KEY/);
    expect(() => encryptSecret('x', 'short')).toThrow(/ENCRYPTION_KEY/);
  });
});
