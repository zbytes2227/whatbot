// lib/auth.js

import jwt from "jsonwebtoken";
import { parse } from "cookie";

const DEFAULT_SECRET = "whatmot-super-secret-jwt-key-2026";

export function extractToken(req) {
  if (!req) return null;

  // 1. Check cookies
  try {
    const cookies = parse(req?.headers?.cookie || "");
    if (cookies.token) return cookies.token;
  } catch {}

  // 2. Check Authorization Header
  const authHeader = req?.headers?.authorization;
  if (authHeader && typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
      const extracted = authHeader.substring(7).trim();
      if (extracted) return extracted;
    }
    const trimmed = authHeader.trim();
    if (trimmed) return trimmed;
  }

  // 3. Check custom headers
  if (req?.headers?.["x-auth-token"]) {
    return req.headers["x-auth-token"];
  }
  if (req?.headers?.["x-api-key"]) {
    return req.headers["x-api-key"];
  }

  // 4. Check query params
  if (req?.query) {
    if (req.query.token) return req.query.token;
    if (req.query.apiKey) return req.query.apiKey;
    if (req.query.api_key) return req.query.api_key;
  }

  return null;
}

export async function verifyAuth(req) {
  try {
    const token = extractToken(req);

    if (!token) {
      throw { success: false, msg: "No authentication token found.", status: 401 };
    }

    // Check public API token match
    const publicToken = process.env.TOKEN_API_PUBLIC;
    if (publicToken && (token === publicToken || token === `Bearer ${publicToken}`)) {
      return {
        user: {
          id: 'admin',
          role: 'admin',
          name: 'Workspace Administrator',
          username: process.env.ADMIN_USERNAME || 'Paradox',
          email: process.env.ADMIN_EMAIL || 'admin@whatmot.com',
        },
      };
    }

    const secrets = [
      process.env.JWT_TOKEN_ADMIN,
      process.env.JWT_TOKEN_STAFF,
      DEFAULT_SECRET,
      "Mhce3bu7NGtMvLqZ0H343434frD1HgB",
      "FpO7tKvUS1YlPuAze343NpqPbN6ksHg",
    ].filter(Boolean);

    for (const secret of secrets) {
      try {
        const decoded = jwt.verify(token, secret);
        return { user: decoded };
      } catch {
        // Try next secret
      }
    }

    throw { success: false, msg: "Invalid or expired token.", status: 401 };
  } catch (error) {
    if (error?.status) throw error;
    throw { success: false, msg: "Server error during authentication.", status: 500 };
  }
}


