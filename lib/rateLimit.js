// lib/rateLimit.js
// Small in-memory fixed-window limiter. Adequate for a single-instance
// deployment; state lives on globalThis so every API bundle shares it.

const STORE_KEY = '__whatbot_rate_limits';
const store = globalThis[STORE_KEY] || (globalThis[STORE_KEY] = new Map());
const MAX_KEYS = 20000;

function prune(now) {
  if (store.size < MAX_KEYS) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  prune(now);
  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function peekRateLimit(key, { limit }) {
  const entry = store.get(key);
  if (!entry || entry.resetAt <= Date.now()) return { blocked: false, retryAfterSec: 0 };
  return { blocked: entry.count >= limit, retryAfterSec: Math.ceil((entry.resetAt - Date.now()) / 1000) };
}

export function resetRateLimit(key) {
  store.delete(key);
}

const PRIVATE_IP = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|fc|fd)/i;

/**
 * Client IP for rate limiting. X-Forwarded-For is only honoured when the
 * direct peer is a loopback/private address (i.e. a reverse proxy), so a
 * client on the public internet cannot spoof it. TRUST_PROXY=1 forces it on,
 * TRUST_PROXY=0 forces it off.
 */
export function getClientIp(req) {
  const peer = req.socket?.remoteAddress || '';
  const trust = process.env.TRUST_PROXY === '1' || (process.env.TRUST_PROXY !== '0' && PRIVATE_IP.test(peer));
  if (trust) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real;
  }
  return peer || 'unknown';
}
