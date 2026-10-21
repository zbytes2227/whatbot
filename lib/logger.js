import { appendFileSync, ensureDirSync } from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";

const LEVELS = {
  trace: 4,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const configuredLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const activeLevel = LEVELS[configuredLevel] ?? LEVELS.info;
const LOG_TO_FILE = process.env.LOG_TO_FILE === "1";
const LOG_FILE = process.env.LOG_FILE_PATH || path.join(process.cwd(), "logs", "app.log");
const RECENT_LOG_LIMIT = 500;
const recentLogs = [];

function shouldLog(level) {
  return (LEVELS[level] ?? LEVELS.info) <= activeLevel;
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = {};
  const seen = new WeakSet();
  const serialize = (value) => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Uint8Array || Buffer.isBuffer(value)) return `[binary ${value.byteLength} bytes]`;
    if (typeof value !== "object") return String(value);
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.length > 32 ? `[array ${value.length} items]` : value.map(serialize);
    const keys = Object.keys(value);
    if (keys.length > 40) return `[object with ${keys.length} fields]`;
    return Object.fromEntries(keys.map((key) => [key, serialize(value[key])]));
  };
  for (const [key, value] of Object.entries(meta)) {
    out[key] = serialize(value);
  }
  return out;
}

function pushRecent(entry) {
  recentLogs.push(entry);
  if (recentLogs.length > RECENT_LOG_LIMIT) {
    recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT);
  }
}

function write(level, message, meta = {}, minimumLevel = null) {
  if (minimumLevel && (LEVELS[level] ?? LEVELS.info) > (LEVELS[minimumLevel] ?? LEVELS.info)) return;
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    message: typeof message === "string" ? message : JSON.stringify(sanitizeMeta({ message }).message),
    ...sanitizeMeta(meta),
  };

  pushRecent(entry);

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  if (LOG_TO_FILE) {
    try {
      ensureDirSync(path.dirname(LOG_FILE));
      appendFileSync(LOG_FILE, `${line}\n`);
    } catch (err) {
      console.error(`Failed to write log file: ${err.message}`);
    }
  }
}

export function formatLogMessage(message) {
  if (typeof message === "string") return message;
  if (message instanceof Error) return message.message || message.name;
  if (!message || typeof message !== "object") return String(message);
  const candidate = message.message || message.msg || message.reason || message.error || message.code;
  if (typeof candidate === "string") return candidate;
  try { return JSON.stringify(sanitizeMeta({ value: message }).value); } catch { return "Structured log event"; }
}

export function logError(error, fallbackMessage = "Unknown error") {
  if (!error) return fallbackMessage;
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error(error.message || fallbackMessage);
}

export function createLogger(context = {}, options = {}) {
  const baseMeta = sanitizeMeta(context);
  const minimumLevel = options.minLevel || null;
  const normalize = (message, meta) => {
    // Baileys uses the pino signature: logger.info(object, message).
    if (message && typeof message === 'object' && typeof meta === 'string') {
      return { message: meta, meta: message };
    }
    return { message, meta };
  };
  return {
    trace(message, meta = {}) {
      // Baileys (and several websocket dependencies) use trace-level logging.
      // Keep it available even when the application log level filters it out.
      const normalized = normalize(message, meta);
      if (activeLevel >= LEVELS.trace) write("debug", normalized.message, { ...baseMeta, ...normalized.meta }, minimumLevel);
    },
    debug(message, meta = {}) {
      const normalized = normalize(message, meta);
      write("debug", normalized.message, { ...baseMeta, ...normalized.meta }, minimumLevel);
    },
    info(message, meta = {}) {
      const normalized = normalize(message, meta);
      write("info", normalized.message, { ...baseMeta, ...normalized.meta }, minimumLevel);
    },
    warn(message, meta = {}) {
      const normalized = normalize(message, meta);
      write("warn", normalized.message, { ...baseMeta, ...normalized.meta }, minimumLevel);
    },
    error(message, meta = {}) {
      const normalized = normalize(message, meta);
      write("error", normalized.message, { ...baseMeta, ...normalized.meta }, minimumLevel);
    },
    child(meta = {}) {
      return createLogger({ ...baseMeta, ...meta }, options);
    },
  };
}

export function getRecentLogs(limit = 100, level = null) {
  const normalizedLevel = level && LEVELS[level] !== undefined ? level : null;
  const filtered = normalizedLevel
    ? recentLogs.filter((entry) => entry.level === normalizedLevel)
    : recentLogs;
  return filtered.slice(Math.max(0, filtered.length - limit));
}

export function getRequestContext(req, fallbackRoute = "unknown") {
  const requestId = req?.headers?.["x-request-id"] || randomUUID();
  return {
    requestId,
    route: req?.url || fallbackRoute,
    method: req?.method || "unknown",
  };
}
