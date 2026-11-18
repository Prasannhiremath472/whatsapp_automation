import { createHmac } from 'node:crypto';
import { assertSafeWebhookUrl, isPrivateAddress } from './safe-url';
import { signPayload } from './webhook-delivery.worker';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1',
  ])('blocks %s', (address) => expect(isPrivateAddress(address)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '203.0.113.10', '2606:4700:4700::1111'])('allows %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );

  it('treats a non-IP as unsafe', () => expect(isPrivateAddress('example.com')).toBe(true));
});

describe('assertSafeWebhookUrl', () => {
  it('rejects non-https, credentials, local names and private IPs', async () => {
    await expect(assertSafeWebhookUrl('http://example.com/hook')).rejects.toThrow(/https/);
    await expect(assertSafeWebhookUrl('https://user:pw@example.com/hook')).rejects.toThrow(/password/);
    await expect(assertSafeWebhookUrl('https://localhost/hook')).rejects.toThrow(/Local/);
    await expect(assertSafeWebhookUrl('https://printer.local/hook')).rejects.toThrow(/Local/);
    await expect(assertSafeWebhookUrl('https://127.0.0.1/hook')).rejects.toThrow(/public/);
    await expect(assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow(/public/);
    await expect(assertSafeWebhookUrl('https://[::1]/hook')).rejects.toThrow(/public/);
    await expect(assertSafeWebhookUrl('not a url')).rejects.toThrow(/valid URL/);
  });

  it('accepts a public IP address', async () => {
    await expect(assertSafeWebhookUrl('https://203.0.113.10/hook')).resolves.toBeUndefined();
  });
});

describe('signPayload', () => {
  it('is a verifiable HMAC over "<timestamp>.<body>"', () => {
    const header = signPayload('whsec_test', '{"a":1}', 1_700_000_000);
    const expected = createHmac('sha256', 'whsec_test').update('1700000000.{"a":1}').digest('hex');
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });
  it('changes with the secret and the body', () => {
    expect(signPayload('a', 'x', 1)).not.toBe(signPayload('b', 'x', 1));
    expect(signPayload('a', 'x', 1)).not.toBe(signPayload('a', 'y', 1));
  });
});
