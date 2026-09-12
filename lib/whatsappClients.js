import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState, jidNormalizedUser } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import { ensureDirSync, existsSync, readFileSync, writeFileSync } from 'fs-extra';
import * as path from 'path';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ module: 'whatsappClients' });
const SESSION_BASE_DIR = path.resolve(process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), '.baileys_auth'));
const STATE_FILE = path.join(SESSION_BASE_DIR, 'client_states.json');
const CLIENTS_KEY = '__whatmot_baileys_clients';
const clients = globalThis[CLIENTS_KEY] || (globalThis[CLIENTS_KEY] = {});
const savedStates = (() => { try { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}; } catch { return {}; } })();
ensureDirSync(SESSION_BASE_DIR);

function saveStates() { try { writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(Object.entries(clients).map(([id, c]) => [id, { enabled: c.enabled, accountInfo: c.accountInfo, status: c.status, ready: c.ready }])), null, 2)); } catch (err) { logger.error('Could not save WhatsApp states', { err }); } }
function setStatus(id, patch) { Object.assign(clients[id], patch, { lastUpdate: new Date() }); saveStates(); }
function createProfile(id, label) { return { client: null, name: label, enabled: !!savedStates[id]?.enabled, status: 'disconnected', ready: false, qrCode: null, error: null, accountInfo: savedStates[id]?.accountInfo || null, initPromise: null, operationQueue: Promise.resolve(), reconnectTimer: null }; }
for (let i = 1; i <= 4; i += 1) clients[`client${i}`] ||= createProfile(`client${i}`, `Profile ${i}`);
function enqueue(id, operation) { const entry = clients[id]; const next = entry.operationQueue.catch(() => {}).then(operation); entry.operationQueue = next.catch(() => {}); return next; }
function toJid(value) { const raw = String(value || ''); return raw.includes('@') ? jidNormalizedUser(raw) : `${raw.replace(/[^0-9]/g, '')}@s.whatsapp.net`; }
function scheduleReconnect(id, delay = 5000) { const entry = clients[id]; if (!entry.enabled || entry.reconnectTimer) return; entry.reconnectTimer = setTimeout(() => { entry.reconnectTimer = null; startClient(id, entry, { trigger: 'reconnect' }).catch(() => {}); }, delay); entry.reconnectTimer.unref?.(); }

async function initClient(id, entry, { trigger = 'manual' } = {}) {
  if (!entry.enabled) return null;
  if (entry.initPromise) return entry.initPromise;
  entry.initPromise = (async () => {
    setStatus(id, { status: 'initializing', ready: false, qrCode: null, error: null });
    const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSION_BASE_DIR, id));
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({ version, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, browser: Browsers.ubuntu('WhatMot'), printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false, logger });
    entry.client = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) setStatus(id, { status: 'qr_ready', qrCode: await qrcode.toDataURL(qr), ready: false, error: null });
      if (connection === 'open') { const me = sock.user || {}; const accountInfo = { name: me.name || 'WhatsApp User', number: me.id?.split(':')[0] || null, me: true }; setStatus(id, { status: 'ready', ready: true, qrCode: null, error: null, accountInfo }); logger.info('Baileys client ready', { clientId: id, trigger }); }
      if (connection === 'close') {
        entry.client = null;
        const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.data?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const restarting = code === 515;
        setStatus(id, { status: loggedOut ? 'disconnected' : restarting ? 'reconnecting' : 'error', ready: false, qrCode: null, error: loggedOut ? 'Logged out' : restarting ? 'WhatsApp requested a connection restart' : 'Connection closed' });
        if (entry.enabled && !loggedOut) scheduleReconnect(id, restarting ? 1000 : 5000);
      }
    });
    return sock;
  })().catch((err) => { setStatus(id, { status: 'error', ready: false, error: err.message }); scheduleReconnect(id); throw err; }).finally(() => { entry.initPromise = null; });
  return entry.initPromise;
}
function startClient(id, entry, options = {}) { return enqueue(id, () => initClient(id, entry, options)); }

async function sendWhatsAppMessage({ clientId, chatId, text, media = null, options = {} }) {
  const entry = clients[clientId]; if (!entry?.client || !entry.ready) { const e = new Error(`Client ${clientId} is unavailable`); e.code = 'CLIENT_UNAVAILABLE'; throw e; }
  return enqueue(clientId, async () => { const started = Date.now(); const jid = toJid(chatId); const exists = await entry.client.onWhatsApp(jid); if (!exists?.[0]?.exists) { const e = new Error('This number is not registered on WhatsApp'); e.code = 'NUMBER_NOT_REGISTERED'; throw e; } let content;
    if (media?.data) { const buffer = Buffer.from(media.data, 'base64'); const type = media.type || media.mimetype || 'application/octet-stream'; if (type.startsWith('image/')) content = { image: buffer, caption: options.caption || text }; else if (type.startsWith('video/')) content = { video: buffer, caption: options.caption || text }; else if (type.startsWith('audio/')) content = { audio: buffer, mimetype: type, ptt: false }; else content = { document: buffer, mimetype: type, fileName: media.name || 'attachment', caption: options.caption || text }; } else content = { text };
    await entry.client.sendMessage(jid, content); entry.lastSuccessfulSend = new Date(); return { deliveryTime: Date.now() - started }; });
}
async function toggleClient(id, enabled) { const entry = clients[id]; if (!entry) return false; entry.enabled = !!enabled; if (!enabled) { clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; try { entry.client?.end?.(new Error('disabled')); } catch {} entry.client = null; setStatus(id, { status: 'disconnected', ready: false, qrCode: null }); return true; } await startClient(id, entry, { trigger: 'toggle_enable' }); return true; }
async function logoutClient(id) { const entry = clients[id]; if (!entry) return false; entry.enabled = false; clearTimeout(entry.reconnectTimer); entry.reconnectTimer = null; try { entry.client?.logout?.(); } catch {} entry.client = null; entry.accountInfo = null; setStatus(id, { status: 'disconnected', ready: false, qrCode: null, accountInfo: null }); return true; }

// Runtime connection state must never be restored as "ready" from disk. The
// socket is the source of truth; enabled profiles are rehydrated below and
// will become ready only after Baileys emits connection === 'open'.
for (const [id, entry] of Object.entries(clients)) {
  if (!entry.client) {
    entry.ready = false;
    entry.status = entry.enabled ? 'reconnecting' : 'disconnected';
    entry.qrCode = null;
  }
}

const STARTUP_RESTORE_KEY = '__whatmot_baileys_startup_restore';
if (!globalThis[STARTUP_RESTORE_KEY]) {
  globalThis[STARTUP_RESTORE_KEY] = true;
  setTimeout(() => {
    for (const [id, entry] of Object.entries(clients)) {
      if (!entry.enabled || entry.client || entry.initPromise) continue;
      startClient(id, entry, { trigger: 'startup_restore' }).catch((err) => {
        logger.error('Startup WhatsApp session restore failed', { clientId: id, err });
      });
    }
  }, 0).unref?.();
}

function getProfileLockDiagnostics() { return {}; }

export { clients, startClient, toggleClient, logoutClient, sendWhatsAppMessage, toJid, getProfileLockDiagnostics };
