import { authConfigError, createSessionToken, getAdminProfile, isSameOrigin, safeEqual, sessionCookies } from '@/lib/auth';
import { HttpError, withApi } from '@/lib/api';
import { checkRateLimit, getClientIp, peekRateLimit, resetRateLimit } from '@/lib/rateLimit';

const FAILURE_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 };

export default withApi(async (req, res, { logger }) => {
  if (!isSameOrigin(req)) throw new HttpError(403, 'Cross-site request blocked');

  const configError = authConfigError();
  if (configError) {
    logger.error(`Login unavailable: ${configError}`);
    throw new HttpError(503, 'Sign-in is not configured on the server.');
  }

  const ip = getClientIp(req);
  const key = `login:${ip}`;
  const blocked = peekRateLimit(key, FAILURE_LIMIT);
  if (blocked.blocked) {
    res.setHeader('Retry-After', String(blocked.retryAfterSec));
    throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(blocked.retryAfterSec / 60)} minute(s).`);
  }

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || username.length > 200 || password.length > 500) {
    throw new HttpError(400, 'Enter your username and password.');
  }

  const userOk = safeEqual(username.trim().toLowerCase(), process.env.ADMIN_USERNAME.trim().toLowerCase());
  const passOk = safeEqual(password, process.env.ADMIN_PASSWORD);
  if (!(userOk && passOk)) {
    checkRateLimit(key, FAILURE_LIMIT);
    logger.warn('Failed sign-in attempt', { ip });
    throw new HttpError(401, 'Incorrect username or password.');
  }

  resetRateLimit(key);
  res.setHeader('Set-Cookie', sessionCookies(req, createSessionToken()));
  logger.info('Administrator signed in', { ip });
  return res.status(200).json({ success: true, user: getAdminProfile() });
}, { methods: ['POST'], auth: false, db: false, name: 'login' });
