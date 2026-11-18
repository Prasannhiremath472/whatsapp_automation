import dns from 'node:dns';
import net from 'node:net';
import https from 'node:https';

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b = 0] = address.split('.').map(Number) as [number, number?];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return true; // not an IP address: treat as unsafe
}

/** A DNS lookup that refuses to connect to non-public addresses (checked at connect time, so DNS tricks cannot bypass it). */
const safeLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error('Blocked: the address is not a public internet address'));
    }
    return options.all ? callback(null, list) : callback(null, list[0]!.address, list[0]!.family);
  });
}) as unknown as net.LookupFunction;

/** HTTPS agent for outgoing webhook calls. */
export const safeHttpsAgent = new https.Agent({ lookup: safeLookup, keepAlive: false });

/** Validates a webhook URL when it is saved: https, no credentials, and a public host. */
export async function assertSafeWebhookUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That is not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('The URL must use https');
  if (url.username || url.password) throw new Error('Do not put a username or password in the URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('That address is not a public internet address');
    return;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local addresses cannot receive webhooks');
  }
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new Error('Could not find that website. Check the address.');
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That address is not a public internet address');
  }
}
