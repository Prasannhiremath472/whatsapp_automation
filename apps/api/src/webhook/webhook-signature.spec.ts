import { createHmac } from 'crypto';
import { verifyMetaSignature } from './webhook-signature';

const SECRET = 'app-secret';
const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
const sign = (b: Buffer, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(b).digest('hex')}`;

describe('verifyMetaSignature', () => {
  it('accepts a correctly signed body', () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyMetaSignature(Buffer.from('{"object":"x"}'), sign(body), SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyMetaSignature(body, sign(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects missing, malformed or wrongly-schemed headers', () => {
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=', SECRET)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=zz', SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body).replace('sha256', 'sha1'), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body).slice(0, -2), SECRET)).toBe(false);
  });

  it('rejects when there is no raw body or no secret configured', () => {
    expect(verifyMetaSignature(undefined, sign(body), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body), '')).toBe(false);
  });
});
