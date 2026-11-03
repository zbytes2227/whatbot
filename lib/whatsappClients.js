// lib/whatsappClients.js
// Owns the Baileys sockets for every WhatsApp profile.
//
// Invariants:
//  - At most one live socket per profile. Every (re)initialisation tears the
//    previous socket down first, so two sockets never share credentials.
//  - Runtime state (ready, QR) is never restored from disk; only `enabled`,
//    the display name and last known account info are persisted.
//  - Sends for a profile are serialised through a per-profile queue.

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import { ensureDirSync, existsSync, readFileSync, removeSync, renameSync, writeFileSync } from 'fs-extra';
import * as path from 'path';
import { createLogger } from '@/lib/logger';
import { mediaKind } from '@/lib/media';

const logger = createLogger({ module: 'whatsappClients' });
// Baileys emits high-volume protocol chatter; keep only warnings and errors.
const baileysLogger = createLogger({ module: 'baileys' }, { minLevel: 'warn' });

const SESSION_BASE_DIR = path.resolve(
  process.env.WHATSAPP_SESSION_PATH || path.join(/* turbopackIgnore: true */ process.cwd(), '.baileys_auth')
);
const STATE_FILE = path.join(SESSION_BASE_DIR, 'client_states.json');
const PROFILE_COUNT = Math.min(10, Math.max(1, Number(process.env.WHATSAPP_PROFILE_COUNT || 4)));
const SEND_TIMEOUT_MS = Math.max(15000, Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 90000));
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 5 * 60 * 1000;
const VERSION_TTL_MS = 6 * 60 * 60 * 1000;

const REGISTRY_KEY = '__whatbot_wa_registry';
const registry = globalThis[REGISTRY_KEY] || (globalThis[REGISTRY_KEY] = {
  clients: {},
  hooks: { onMessageStatus: null, onIncoming: null },
  restored: false,
  version: null,
  versionFetchedAt: 0,
  persistTimer: null,
});
const clients = registry.clients;

ensureDirSync(SESSION_BASE_DIR);

const savedStates = (() => {
  try {
    return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
  } catch (err) {
    logger.warn('Could not read WhatsApp state file', { error: err.message });
    return {};
  }
})();

function createProfile(id, index) {
  const saved = savedStates[id] || {};
  return {
    id,
    name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 40) : `Profile ${index}`,
    enabled: !!saved.enabled,
    status: saved.enabled ? 'reconnecting' : 'disconnected',
    ready: false,
    qrCode: null,
    error: null,
    accountInfo: saved.accountInfo || null,
    client: null,
    initPromise: null,
    sendQueue: Promise.resolve(),
    queueLength: 0,
    reconnectTimer: null,
    reconnectAttempts: 0,
    lastUpdate: new Date(),
    lastConnectedAt: saved.lastConnectedAt || null,
    lastSuccessfulSend: null,
  };
}

for (let i = 1; i <= PROFILE_COUNT; i += 1) {
  const id = `client${i}`;
  clients[id] ||= createProfile(id, i);
  clients[id].sendQueue ||= Promise.resolve();
}

let persistFailureLogged = false;
function persistNow() {
  registry.persistTimer = null;
  const data = Object.fromEntries(Object.values(clients).map((c) => [c.id, {
    enabled: c.enabled,
    name: c.name,
    accountInfo: c.accountInfo,
    lastConnectedAt: c.lastConnectedAt,
  }]));
  try {
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, STATE_FILE);
    persistFailureLogged = false;
  } catch (err) {
    if (!persistFailureLogged) {
      persistFailureLogged = true;
      logger.error('WhatsApp state persistence failed; check session volume permissions', { path: STATE_FILE, error: err.message });
    }
  }
}

function schedulePersist() {
  if (registry.persistTimer) return;
  registry.persistTimer = setTimeout(persistNow, 300);
  registry.persistTimer.unref?.();
}

function setStatus(entry, patch) {
  Object.assign(entry, patch, { lastUpdate: new Date() });
  schedulePersist();
}

export function toJid(value) {
  const raw = String(value || '');
  return raw.includes('@') ? jidNormalizedUser(raw) : `${raw.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
}

function clearAuthState(entry, reason) {
  const authDir = path.join(SESSION_BASE_DIR, entry.id);
  try {
    if (existsSync(authDir)) removeSync(authDir);
    logger.warn('Cleared WhatsApp auth state', { clientId: entry.id, reason });
    return true;
  } catch (err) {
    logger.error('Could not clear WhatsApp auth state', { clientId: entry.id, reason, err });
    return false;
  }
}

function clearReconnect(entry) {
  if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
  entry.reconnectTimer = null;
}

const SOCKET_EVENTS = ['creds.update', 'connection.update', 'messages.update', 'messages.upsert'];

/** Detach and close a socket without logging the device out. */
function teardownSocket(entry, reason) {
  const sock = entry.client;
  entry.client = null;
  if (!sock) return;
  for (const event of SOCKET_EVENTS) {
    try { sock.ev.removeAllListeners(event); } catch {}
  }
  try { sock.end(new Error(reason)); } catch {}
}

function scheduleReconnect(entry, delayMs) {
  if (!entry.enabled || entry.reconnectTimer) return;
  const delay = delayMs ?? Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(entry.reconnectAttempts, 8));
  entry.reconnectAttempts += 1;
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null;
    initClient(entry.id, { trigger: 'reconnect' }).catch((err) => logger.error('WhatsApp reconnect failed', { clientId: entry.id, err }));
  }, delay);
  entry.reconnectTimer.unref?.();
  logger.info('WhatsApp reconnect scheduled', { clientId: entry.id, delayMs: delay, attempt: entry.reconnectAttempts });
}

async function getWaVersion() {
  if (registry.version && Date.now() - registry.versionFetchedAt < VERSION_TTL_MS) return registry.version;
  try {
    const { version } = await fetchLatestBaileysVersion();
    if (version) {
      registry.version = version;
      registry.versionFetchedAt = Date.now();
    }
  } catch (err) {
    logger.warn('Could not fetch latest WhatsApp Web version; using bundled default', { error: err.message });
  }
  return registry.version || undefined;
}

async function handleConnectionUpdate(entry, sock, state, update) {
  if (entry.client !== sock) return;
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    setStatus(entry, { status: 'qr_ready', qrCode: await qrcode.toDataURL(qr, { margin: 1, width: 320 }), ready: false, error: null });
  }

  if (connection === 'open') {
    const me = sock.user || {};
    entry.reconnectAttempts = 0;
    setStatus(entry, {
      status: 'ready',
      ready: true,
      qrCode: null,
      error: null,
      lastConnectedAt: new Date().toISOString(),
      accountInfo: { name: me.name || me.verifiedName || 'WhatsApp User', number: me.id?.split(':')[0]?.split('@')[0] || null, me: true },
    });
    logger.info('WhatsApp profile connected', { clientId: entry.id });
    return;
  }

  if (connection !== 'close') return;

  teardownSocket(entry, 'connection closed');
  const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.data?.statusCode;
  const paired = !!state.creds?.me?.id;
  logger.warn('WhatsApp connection closed', { clientId: entry.id, code: code ?? 'unknown', paired });

  if (code === DisconnectReason.restartRequired) {
    // Normal right after pairing: WhatsApp asks for a fresh connection.
    setStatus(entry, { status: 'reconnecting', ready: false, qrCode: null, error: null });
    scheduleReconnect(entry, 500);
    return;
  }

  if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
    clearAuthState(entry, code === DisconnectReason.loggedOut ? 'logged_out' : 'bad_session');
    setStatus(entry, {
      status: 'logged_out',
      ready: false,
      qrCode: null,
      accountInfo: null,
      error: code === DisconnectReason.loggedOut
        ? 'This device was logged out from the phone. Connect again to scan a new QR code.'
        : 'The saved session was corrupted and has been reset. Connect again to scan a new QR code.',
    });
    return;
  }

  if (code === DisconnectReason.forbidden) {
    setStatus(entry, { status: 'error', ready: false, qrCode: null, error: 'WhatsApp refused this account (403). It may be restricted or banned.' });
    return;
  }

  if (!paired) {
    // QR codes expired without being scanned. Do not loop forever; the user
    // can request a fresh QR from the dashboard.
    setStatus(entry, { status: 'disconnected', ready: false, qrCode: null, error: 'QR code expired. Click Connect to generate a new one.' });
    return;
  }

  if (code === DisconnectReason.connectionReplaced) {
    setStatus(entry, { status: 'reconnecting', ready: false, qrCode: null, error: 'Session was opened elsewhere (connection replaced). Retrying shortly.' });
    scheduleReconnect(entry, Math.max(60000, RECONNECT_BASE_MS * 2 ** Math.min(entry.reconnectAttempts, 8)));
    return;
  }

  setStatus(entry, { status: 'reconnecting', ready: false, qrCode: null, error: 'Connection lost. Reconnecting…' });
  scheduleReconnect(entry);
}

/**
 * Start (or with force=true, restart) a profile's socket. Single-flight:
 * concurrent callers share the same initialisation.
 */
export async function initClient(id, { force = false, trigger = 'manual' } = {}) {
  const entry = clients[id];
  if (!entry?.enabled) return null;
  if (entry.initPromise) return entry.initPromise;
  if (entry.client && !force) return entry.client;

  entry.initPromise = (async () => {
    clearReconnect(entry);
    teardownSocket(entry, 'reinitialising');
    setStatus(entry, { status: 'initializing', ready: false, qrCode: null, error: null });

    const authDir = path.join(/* turbopackIgnore: true */ SESSION_BASE_DIR, id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const version = await getWaVersion();
    if (!entry.enabled) return null;

    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
      browser: Browsers.ubuntu('WhatBot'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      logger: baileysLogger,
    });
    entry.client = sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      handleConnectionUpdate(entry, sock, state, update).catch((err) => logger.error('Connection update handler failed', { clientId: id, err }));
    });
    sock.ev.on('messages.update', (updates) => {
      if (entry.client === sock) Promise.resolve(registry.hooks.onMessageStatus?.(id, updates)).catch((err) => logger.warn('Message status hook failed', { err }));
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (entry.client === sock && type === 'notify') Promise.resolve(registry.hooks.onIncoming?.(id, messages)).catch((err) => logger.warn('Incoming message hook failed', { err }));
    });

    logger.info('WhatsApp socket created', { clientId: id, trigger });
    return sock;
  })()
    .catch((err) => {
      setStatus(entry, { status: 'reconnecting', ready: false, error: `Failed to start: ${err.message}` });
      scheduleReconnect(entry);
      throw err;
    })
    .finally(() => {
      entry.initPromise = null;
    });

  return entry.initPromise;
}

export const startClient = (id, _entry, options = {}) => initClient(id, options);

export async function toggleClient(id, enabled) {
  const entry = clients[id];
  if (!entry) return false;
  entry.enabled = !!enabled;
  if (!enabled) {
    clearReconnect(entry);
    teardownSocket(entry, 'disabled');
    setStatus(entry, { status: 'disconnected', ready: false, qrCode: null, error: null });
    return true;
  }
  setStatus(entry, { error: null });
  await initClient(id, { trigger: 'toggle_enable' });
  return true;
}

export async function restartClient(id) {
  const entry = clients[id];
  if (!entry) return false;
  entry.reconnectAttempts = 0;
  await initClient(id, { force: true, trigger: 'manual_restart' });
  return true;
}

export async function logoutClient(id) {
  const entry = clients[id];
  if (!entry) return false;
  entry.enabled = false;
  clearReconnect(entry);
  const sock = entry.client;
  if (sock) {
    for (const event of SOCKET_EVENTS) {
      try { sock.ev.removeAllListeners(event); } catch {}
    }
    entry.client = null;
    await Promise.race([
      Promise.resolve().then(() => sock.logout()).catch((err) => logger.warn('WhatsApp logout request failed', { clientId: id, error: err?.message })),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    try { sock.end(new Error('logged out')); } catch {}
  }
  clearAuthState(entry, 'manual_logout');
  setStatus(entry, { status: 'disconnected', ready: false, qrCode: null, accountInfo: null, error: null });
  return true;
}

export function renameClient(id, name) {
  const entry = clients[id];
  const cleaned = String(name || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 40);
  if (!entry || !cleaned) return false;
  setStatus(entry, { name: cleaned });
  return true;
}

export function isClientReady(id) {
  const entry = clients[id];
  return !!(entry?.enabled && entry.ready && entry.client);
}

export function getReadyClientIds(ids = Object.keys(clients)) {
  return ids.filter(isClientReady);
}

export function getProfileIds() {
  return Object.keys(clients);
}

function buildContent(text, media) {
  if (!media?.buffer) return { text };
  const caption = text || undefined;
  switch (mediaKind(media.mimetype)) {
    case 'image':
      return { image: media.buffer, caption, mimetype: media.mimetype };
    case 'video':
      return { video: media.buffer, caption, mimetype: media.mimetype };
    case 'audio':
      return { audio: media.buffer, mimetype: media.mimetype, ptt: false };
    default:
      return { document: media.buffer, mimetype: media.mimetype, fileName: media.fileName || 'attachment', caption };
  }
}

function sendError(message, code, stage) {
  const error = new Error(message);
  error.code = code;
  error.stage = stage;
  return error;
}

/**
 * Send one message. Errors carry `stage`:
 *   "pre_send" - the message was definitely not handed to WhatsApp
 *   "send"     - the send was attempted; the outcome is uncertain
 */
export async function sendWhatsAppMessage({ clientId, to, chatId, text = '', media = null }) {
  const entry = clients[clientId];
  if (!isClientReady(clientId)) throw sendError(`WhatsApp profile ${clientId} is not connected`, 'CLIENT_UNAVAILABLE', 'pre_send');

  const progress = { stage: 'queued' };
  entry.queueLength += 1;
  const operation = entry.sendQueue.catch(() => {}).then(async () => {
    const sock = entry.client;
    if (!sock || !entry.ready) throw sendError(`WhatsApp profile ${clientId} disconnected`, 'CLIENT_UNAVAILABLE', 'pre_send');
    const started = Date.now();
    progress.stage = 'lookup';
    let jid = toJid(to || chatId);
    if (jid.endsWith('@s.whatsapp.net')) {
      const [result] = (await sock.onWhatsApp(jid)) || [];
      if (!result?.exists) throw sendError('This number is not registered on WhatsApp', 'NUMBER_NOT_REGISTERED', 'pre_send');
      jid = result.jid || jid;
    }
    progress.stage = 'sending';
    const sent = await sock.sendMessage(jid, buildContent(text, media));
    progress.stage = 'sent';
    entry.lastSuccessfulSend = new Date();
    return { deliveryTime: Date.now() - started, messageId: sent?.key?.id || null, jid };
  });
  entry.sendQueue = operation.catch(() => {}).finally(() => { entry.queueLength = Math.max(0, entry.queueLength - 1); });

  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(sendError(`WhatsApp send timed out after ${Math.round(SEND_TIMEOUT_MS / 1000)}s`, 'SEND_TIMEOUT', progress.stage === 'sending' ? 'send' : 'pre_send'));
        }, SEND_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    if (!err.stage) err.stage = progress.stage === 'sending' ? 'send' : 'pre_send';
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function setMessageHooks(hooks) {
  Object.assign(registry.hooks, hooks);
}

export function serializeClient(entry) {
  return {
    id: entry.id,
    name: entry.name,
    enabled: entry.enabled,
    ready: entry.ready,
    status: entry.status,
    error: entry.error,
    hasQR: !!entry.qrCode,
    accountInfo: entry.accountInfo ? { name: entry.accountInfo.name || null, number: entry.accountInfo.number || null } : null,
    lastUpdate: entry.lastUpdate,
    lastConnectedAt: entry.lastConnectedAt,
    lastSuccessfulSend: entry.lastSuccessfulSend,
    reconnectAttempts: entry.reconnectAttempts,
    queueLength: entry.queueLength,
  };
}

export function getClientsSnapshot() {
  return Object.values(clients).map(serializeClient);
}

/** Bring enabled profiles back after a restart, staggered to avoid bursts. */
export function restoreSessions() {
  if (registry.restored) return;
  registry.restored = true;
  let delay = 0;
  for (const entry of Object.values(clients)) {
    if (!entry.enabled || entry.client || entry.initPromise) continue;
    const timer = setTimeout(() => {
      initClient(entry.id, { trigger: 'startup_restore' }).catch((err) => logger.error('Startup session restore failed', { clientId: entry.id, err }));
    }, delay);
    timer.unref?.();
    delay += 1500;
  }
}

export function shutdownClients() {
  for (const entry of Object.values(clients)) {
    clearReconnect(entry);
    teardownSocket(entry, 'shutdown');
  }
  if (registry.persistTimer) {
    clearTimeout(registry.persistTimer);
    persistNow();
  }
}

export { clients };
