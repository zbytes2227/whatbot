import { appendFileSync, ensureDirSync } from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";

const LEVELS = {
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
  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      out[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      continue;
    }
    if (typeof value === "bigint") {
      out[key] = value.toString();
      continue;
    }
    if (value instanceof Date) {
      out[key] = value.toISOString();
      continue;
    }
    out[key] = value;
  }
  return out;
}

function pushRecent(entry) {
  recentLogs.push(entry);
  if (recentLogs.length > RECENT_LOG_LIMIT) {
    recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT);
  }
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
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

export function logError(error, fallbackMessage = "Unknown error") {
  if (!error) return fallbackMessage;
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error(error.message || fallbackMessage);
}

export function createLogger(context = {}) {
  const baseMeta = sanitizeMeta(context);
  return {
    debug(message, meta = {}) {
      write("debug", message, { ...baseMeta, ...meta });
    },
    info(message, meta = {}) {
      write("info", message, { ...baseMeta, ...meta });
    },
    warn(message, meta = {}) {
      write("warn", message, { ...baseMeta, ...meta });
    },
    error(message, meta = {}) {
      write("error", message, { ...baseMeta, ...meta });
    },
    child(meta = {}) {
      return createLogger({ ...baseMeta, ...meta });
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
