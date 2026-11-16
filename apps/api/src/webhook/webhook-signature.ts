import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies Meta's `X-Hub-Signature-256` header: `sha256=` followed by the
 * hex HMAC-SHA256 of the *raw* request body, keyed with the app secret.
 * Without this check anyone who learns the webhook URL could forge delivery
 * receipts, inbound messages or template approvals.
 */
export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header || !appSecret) return false;
  const [scheme, signature] = header.split('=');
  if (scheme !== 'sha256' || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
