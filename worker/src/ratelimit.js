/**
 * Fixed-window rate limiting stored in D1, keyed by bucket and a salted hash
 * of the client IP. Same spec format as the Python API: "5/hour".
 */

export function parseSpec(spec) {
  const [count, window] = String(spec || '').split('/');
  const seconds = { minute: 60, hour: 3600, day: 86400 }[(window || '').trim()] || 3600;
  return { limit: Math.max(1, parseInt(count, 10) || 1), seconds };
}

async function ipKey(salt, ip) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Counts one hit and reports whether it is within the limit. Expired windows
 * for the bucket are pruned in the background.
 */
export async function hit(env, ctx, bucket, ip, spec, now = Date.now()) {
  const { limit, seconds } = parseSpec(spec);
  const slot = Math.floor(now / 1000 / seconds);
  const key = await ipKey(env.RATE_LIMIT_SALT || '', ip);
  const row = await env.DB.prepare(
    'INSERT INTO rate_hits (bucket, ip_key, slot, count) VALUES (?, ?, ?, 1) ' +
      'ON CONFLICT (bucket, ip_key, slot) DO UPDATE SET count = count + 1 RETURNING count'
  )
    .bind(bucket, key, slot)
    .first();
  ctx.waitUntil(env.DB.prepare('DELETE FROM rate_hits WHERE bucket = ? AND slot < ?').bind(bucket, slot).run());
  return row.count <= limit;
}
