// lib/auth.js
// Session handling for the single-administrator dashboard.
//
// Sessions are HS256 JWTs carried in an httpOnly cookie. Bearer tokens are
// also accepted so scripts can call the dashboard API with a session token.
// The public API token (TOKEN_API_PUBLIC) is deliberately NOT accepted here;
// it only authorises /api/sendMessage.

import jwt from 'jsonwebtoken';
import { parse, serialize } from 'cookie';
import { createHash, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'wb_session';
const LEGACY_COOKIE = 'token';
const ISSUER = 'whatbot';
const AUDIENCE = 'whatbot-dashboard';
const SESSION_TTL_SEC = Math.max(3600, Number(process.env.SESSION_TTL_HOURS || 168) * 3600);

function getSecret() {
  const secret = (process.env.JWT_SECRET || process.env.JWT_TOKEN_ADMIN || '').trim();
  return secret || null;
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

/** Constant-time string comparison that does not leak length. */
export function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

// Changing ADMIN_PASSWORD or SESSION_VERSION invalidates every session.
function sessionFingerprint() {
  const password = process.env.ADMIN_PASSWORD || '';
  const version = process.env.SESSION_VERSION || '1';
  return createHash('sha256').update(`${version}:${password}`).digest('hex').slice(0, 16);
}

export function getAdminProfile() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  return {
    id: 'admin',
    role: 'admin',
    username,
    name: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL || '',
  };
}

export function authConfigError() {
  if (!process.env.ADMIN_USERNAME?.trim() || !process.env.ADMIN_PASSWORD) return 'ADMIN_USERNAME and ADMIN_PASSWORD must be set';
  const secret = getSecret();
  if (!secret) return 'JWT_SECRET must be set';
  if (process.env.NODE_ENV === 'production' && secret.length < 32) return 'JWT_SECRET must be at least 32 characters in production';
  return null;
}

export function createSessionToken() {
  const profile = getAdminProfile();
  return jwt.sign(
    { sub: profile.id, role: profile.role, username: profile.username, fp: sessionFingerprint() },
    getSecret(),
    { algorithm: 'HS256', expiresIn: SESSION_TTL_SEC, issuer: ISSUER, audience: AUDIENCE }
  );
}

export function verifySessionToken(token) {
  const secret = getSecret();
  if (!token || !secret || typeof token !== 'string' || token.length > 4096) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    if (payload.fp !== sessionFingerprint()) return null;
    return { ...getAdminProfile(), id: payload.sub, role: payload.role, expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

function readCookies(req) {
  try {
    return parse(req?.headers?.cookie || '');
  } catch {
    return {};
  }
}

/** Returns { user, via } or null. `via` is "cookie" or "bearer". */
export function getSession(req) {
  const cookieToken = readCookies(req)[SESSION_COOKIE];
  if (cookieToken) {
    const user = verifySessionToken(cookieToken);
    if (user) return { user, via: 'cookie' };
  }
  const header = req?.headers?.authorization;
  if (typeof header === 'string' && /^bearer\s+/i.test(header)) {
    const user = verifySessionToken(header.replace(/^bearer\s+/i, '').trim());
    if (user) return { user, via: 'bearer' };
  }
  return null;
}

function isSecureRequest(req) {
  const setting = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
  if (setting === 'true' || setting === '1') return true;
  if (setting === 'false' || setting === '0') return false;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || !!req.socket?.encrypted;
}

export function sessionCookies(req, token) {
  const secure = isSecureRequest(req);
  return [
    serialize(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SEC }),
    serialize(LEGACY_COOKIE, '', { path: '/', maxAge: 0 }),
  ];
}

export function clearedSessionCookies(req) {
  const secure = isSecureRequest(req);
  return [
    serialize(SESSION_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }),
    serialize(LEGACY_COOKIE, '', { path: '/', maxAge: 0 }),
  ];
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests. Browsers
 * send Sec-Fetch-Site on every request; fall back to comparing Origin with
 * the Host (or APP_ORIGIN for deployments behind a proxy that rewrites Host).
 */
export function isSameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none';

  const origin = req.headers.origin;
  if (!origin) return true; // Non-browser client; it would need the cookie anyway.
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set([req.headers.host, req.headers['x-forwarded-host']].filter(Boolean));
  for (const configured of String(process.env.APP_ORIGIN || '').split(',')) {
    try {
      if (configured.trim()) allowed.add(new URL(configured.trim()).host);
    } catch {
      // ignore malformed entries
    }
  }
  return allowed.has(originHost);
}

/** Validates the public API token from body, X-API-Key or Bearer header. */
export function verifyPublicApiToken(req, bodyToken) {
  const expected = process.env.TOKEN_API_PUBLIC?.trim();
  if (!expected) return false;
  const header = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^bearer\s+/i, '');
  const provided = bodyToken || header;
  if (!provided || typeof provided !== 'string') return false;
  return safeEqual(provided.trim(), expected);
}
