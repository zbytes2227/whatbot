// lib/api.js
// Shared plumbing for API routes: method checks, auth, CSRF, DB connection,
// body parsing and consistent error responses.

import formidable from 'formidable';
import mongoose from 'mongoose';
import connectToMongoDB from '@/lib/mongodb';
import { getSession, isSameOrigin } from '@/lib/auth';
import { createLogger, getRequestContext } from '@/lib/logger';

const baseLogger = createLogger({ module: 'api' });
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function badRequest(message, extra) {
  return new HttpError(400, message, extra);
}

function toResponse(err) {
  if (err instanceof HttpError) return { status: err.status, msg: err.message, extra: err.extra };
  if (err?.name === 'CastError') return { status: 400, msg: 'Invalid identifier' };
  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return { status: 400, msg: first?.message || 'Validation failed' };
  }
  if (err?.code === 11000) return { status: 409, msg: 'Duplicate record' };
  if (err?.httpCode && err?.httpCode < 500) {
    // formidable errors (size limits, malformed multipart)
    return { status: err.httpCode === 413 || /maxFileSize|maxTotalFileSize/i.test(err.message) ? 413 : 400, msg: err.httpCode === 413 || /max/i.test(err.message) ? 'Upload is too large' : 'Malformed upload' };
  }
  if (/MongoServerSelectionError|MongooseServerSelectionError|MongoNetworkError/.test(err?.name || '')) {
    return { status: 503, msg: 'Database is temporarily unavailable' };
  }
  return { status: 500, msg: 'Internal server error' };
}

/**
 * Wrap an API handler.
 *   methods: allowed HTTP methods
 *   auth:    require a dashboard session (default true)
 *   db:      connect to MongoDB before the handler (default true)
 */
export function withApi(handler, { methods, auth = true, db = true, name = 'api' } = {}) {
  return async function apiHandler(req, res) {
    const logger = baseLogger.child({ ...getRequestContext(req), api: name });
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (methods && !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, `Method ${req.method} not allowed`);
      }

      let user = null;
      if (auth) {
        const session = getSession(req);
        if (!session) throw new HttpError(401, 'Your session has expired. Please sign in again.');
        if (session.via === 'cookie' && !SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
          throw new HttpError(403, 'Cross-site request blocked');
        }
        user = session.user;
      }

      if (db) await connectToMongoDB();
      return await handler(req, res, { user, logger });
    } catch (err) {
      const { status, msg, extra } = toResponse(err);
      if (status >= 500) logger.error('API request failed', { err });
      else if (status !== 401) logger.debug('API request rejected', { status, msg });
      if (res.headersSent) {
        try { res.end(); } catch {}
        return;
      }
      return res.status(status).json({ success: false, msg, ...(extra || {}) });
    }
  };
}

export function isObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value);
}

export function requireObjectId(value, label = 'id') {
  if (!isObjectId(value)) throw badRequest(`Invalid ${label}`);
  return value;
}

export function str(value, { max = 1000, trim = true } = {}) {
  if (Array.isArray(value)) value = value[0];
  if (value == null) return '';
  let out = String(value);
  if (trim) out = out.trim();
  if (out.length > max) throw badRequest(`Value is too long (max ${max} characters)`);
  return out;
}

export function intInRange(value, { min, max, fallback }) {
  const n = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Read a JSON body when the route disables Next's body parser. */
export function readJsonBody(req, limitBytes = 1024 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(badRequest('Request body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function parseMultipart(req, { maxFileSize = 10 * 1024 * 1024, maxFiles = 4 } = {}) {
  const form = formidable({
    multiples: true,
    maxFiles,
    maxFileSize,
    maxTotalFileSize: maxFileSize * maxFiles,
    maxFields: 60,
    maxFieldsSize: 2 * 1024 * 1024,
    allowEmptyFiles: false,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpError(408, 'Upload timed out')), 60000);
    form.parse(req, (err, fields, files) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export function firstFile(files, key) {
  const value = files?.[key];
  return Array.isArray(value) ? value[0] : value || null;
}
