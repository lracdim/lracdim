/**
 * Outbound URL policy, ported from api/app/core/ssrf.py. Every user-supplied
 * URL passes through here before a single byte is requested, and again on
 * every redirect hop.
 *
 * Blocked: non-http(s) schemes, credentials in the URL, internal host names,
 * names without a public suffix, and IP literals in loopback, private,
 * link-local, multicast, reserved, or cloud-metadata ranges (IPv4 and IPv6).
 * `validateResolved` also resolves the host over DNS-over-HTTPS and rejects
 * names that point at private addresses; it is used for the address a visitor
 * types, while redirect hops get the literal checks (a Worker's own egress
 * cannot reach private networks).
 */

export class UnsafeURL extends Error {}

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home', '.corp'];
const METADATA_IPS = new Set(['169.254.169.254', 'fd00:ec2::254', '100.100.100.200']);

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function v4ToInt(ip) {
  const m = IPV4.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// [network, prefix length] ranges that are not publicly routable.
const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
].map(([net, bits]) => [v4ToInt(net), bits]);

function v4Public(ip) {
  const n = v4ToInt(ip);
  if (n === null) return false;
  return !V4_BLOCKED.some(([net, bits]) => ((n >>> (32 - bits)) << (32 - bits)) >>> 0 === net);
}

/** Expand an IPv6 literal to 8 hextets, or null when it is not one. */
function v6Hextets(ip) {
  let s = ip.toLowerCase();
  let tail = [];
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[2]);
    if (n === null) return null;
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    s = v4[1] + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (h) => (h ? h.split(':').map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN)) : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const out = [...head, ...Array(halves.length === 2 ? missing : 0).fill(0), ...rest];
  if (out.length !== 8 || out.some(Number.isNaN)) return null;
  if (tail.length) out.splice(6, 2, ...tail);
  return out;
}

function v6Public(ip) {
  const h = v6Hextets(ip);
  if (!h) return false;
  if (h.every((x) => x === 0)) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return v4Public(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`); // IPv4-mapped
  }
  const first = h[0];
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && h[1] === 0x0db8) return false; // documentation
  if (first === 0x2001 && h[1] < 0x0200) return false; // 2001::/23 IETF protocol assignments
  if (first === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return false; // discard prefix
  if (first === 0x0064 && h[1] === 0xff9b) return false; // NAT64
  return true;
}

export function isPublicIP(ip) {
  if (METADATA_IPS.has(ip)) return false;
  return ip.includes(':') ? v6Public(ip) : v4Public(ip);
}

const isIPLiteral = (host) => IPV4.test(host) || host.includes(':');

/** Normalise a typed address into an absolute http(s) URL without a fragment. */
export function normalize(raw) {
  raw = String(raw || '').trim();
  if (!raw) throw new UnsafeURL('Enter a website address.');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme && !['http', 'https'].includes(scheme[1].toLowerCase()) && !raw.includes('://')) {
    throw new UnsafeURL('Only http and https addresses can be examined.');
  }
  if (!raw.includes('://')) raw = 'https://' + raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeURL('That address is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new UnsafeURL('Only http and https addresses can be examined.');
  if (u.username || u.password) throw new UnsafeURL('Addresses with embedded credentials are not accepted.');
  if (!u.hostname) throw new UnsafeURL('That address has no host name.');
  if (u.hostname.endsWith('.') && !u.hostname.startsWith('[')) u.hostname = u.hostname.replace(/\.+$/, '');
  u.hash = '';
  return u.toString();
}

/** Literal checks: blocked names, private IP literals, bare names. Returns {url, host}. */
export function validate(raw) {
  const url = normalize(raw);
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeURL('Internal and local addresses cannot be examined.');
  }
  if (isIPLiteral(host)) {
    if (!isPublicIP(host)) throw new UnsafeURL('Private and reserved IP addresses cannot be examined.');
    return { url, host };
  }
  if (!host.includes('.')) throw new UnsafeURL('Enter a full domain name, for example example.com.');
  return { url, host };
}

const DOH = 'https://cloudflare-dns.com/dns-query';

async function lookup(host, type) {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error(`DoH ${res.status}`);
  const data = await res.json();
  const code = type === 'A' ? 1 : 28;
  return (data.Answer || []).filter((a) => a.type === code).map((a) => a.data);
}

/**
 * Literal checks plus DNS: the host must resolve, and only to public
 * addresses. `budget` (optional) is charged one request per lookup.
 */
export async function validateResolved(raw, budget) {
  const target = validate(raw);
  if (isIPLiteral(target.host)) return target;
  budget?.take(2);
  let addresses;
  try {
    const [a, aaaa] = await Promise.all([lookup(target.host, 'A'), lookup(target.host, 'AAAA')]);
    addresses = [...a, ...aaaa];
  } catch {
    // The resolver itself failed; do not block the visitor over it. The fetch
    // still cannot reach private networks from a Worker.
    return target;
  }
  if (!addresses.length) throw new UnsafeURL('That domain name could not be resolved.');
  if (addresses.some((ip) => !isPublicIP(ip))) {
    throw new UnsafeURL('That address resolves to a private network and cannot be examined.');
  }
  return target;
}
