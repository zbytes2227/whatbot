import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode";
import { ensureDirSync, existsSync, readFileSync, removeSync, writeFileSync } from "fs-extra";
import * as path from "path";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ module: "whatsappClients" });

const SESSION_BASE_DIR = path.resolve(
  process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), ".wwebjs_auth")
);

const CLIENT_STATE_FILE = path.join(SESSION_BASE_DIR, "client_states.json");
const MAX_RECONNECT_ATTEMPTS = Math.max(1, Number(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || 6));
const BASE_RECONNECT_DELAY_MS = Math.max(1000, Number(process.env.WHATSAPP_RECONNECT_BASE_MS || 4000));
const MAX_RECONNECT_DELAY_MS = Math.max(BASE_RECONNECT_DELAY_MS, Number(process.env.WHATSAPP_RECONNECT_MAX_MS || 120000));
const INIT_TIMEOUT_MS = Math.max(30000, Number(process.env.WHATSAPP_INIT_TIMEOUT_MS || 120000));
const STATE_SAVE_DEBOUNCE_MS = Math.max(250, Number(process.env.WHATSAPP_STATE_SAVE_DEBOUNCE_MS || 1500));
const SHUTDOWN_KEY = "__whatmot_whatsapp_shutdown_registered";
const RESTORE_TIMER_KEY = "__whatmot_whatsapp_restore_timer";
const SAVE_TIMER_KEY = "__whatmot_whatsapp_save_timer";
const CLIENTS_KEY = "__whatmot_whatsapp_clients";
const READY_STATE_TIMEOUT_MS = 30000;

try {
  ensureDirSync(SESSION_BASE_DIR);
} catch (err) {
  logger.error("Failed to ensure WhatsApp session directory", { err, sessionDir: SESSION_BASE_DIR });
}

function buildPersistedState(client) {
  return {
    enabled: !!client.enabled,
    accountInfo: client.accountInfo || null,
    status: client.status || "disconnected",
    ready: !!client.ready,
    lastUpdate: client.lastUpdate || new Date(),
  };
}

function loadClientStates() {
  try {
    if (existsSync(CLIENT_STATE_FILE)) {
      const raw = readFileSync(CLIENT_STATE_FILE, "utf8");
      const data = JSON.parse(raw);
      logger.info("Loaded saved WhatsApp client states", { count: Object.keys(data).length });
      return data;
    }
  } catch (err) {
    logger.error("Error loading client states", { err });
  }
  return {};
}

function saveClientStates() {
  if (global[SAVE_TIMER_KEY]) return;
  global[SAVE_TIMER_KEY] = setTimeout(() => {
    global[SAVE_TIMER_KEY] = null;
    try {
      const states = {};
      Object.entries(clients).forEach(([id, client]) => {
        states[id] = buildPersistedState(client);
      });
      writeFileSync(CLIENT_STATE_FILE, JSON.stringify(states, null, 2));
    } catch (err) {
      logger.error("Error saving client states", { err });
    }
  }, STATE_SAVE_DEBOUNCE_MS);
  global[SAVE_TIMER_KEY].unref?.();
}

function flushClientStatesSync() {
  try {
    const states = {};
    Object.entries(clients).forEach(([id, client]) => {
      states[id] = buildPersistedState(client);
    });
    writeFileSync(CLIENT_STATE_FILE, JSON.stringify(states, null, 2));
  } catch (err) {
    logger.error("Error saving client states", { err });
  }
}

function updateClientStatus(clientId, clientObj, { status, error = null, qrCode = null, ready = false }) {
  if (!clientObj || typeof clientObj !== "object") {
    logger.error("Cannot update status: invalid client object", { clientId });
    return;
  }

  clientObj.status = status;
  clientObj.error = error;
  clientObj.qrCode = qrCode;
  clientObj.ready = ready;
  clientObj.lastUpdate = new Date();

  saveClientStates();
  logger.info("Client status updated", { clientId, status, ready, error });
}

function getPuppeteerConfig() {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
      ],
      timeout: 120000,
      protocolTimeout: 120000,
    };
  }
  return {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    timeout: 60000,
  };
}

function getChromiumProfileDir(clientId) {
  const clientDataPath = path.join(SESSION_BASE_DIR, clientId);
  return path.join(clientDataPath, `session-${clientId}`);
}

function isProfileLockLaunchError(err) {
  const text = `${err?.message || err || ""}`.toLowerCase();
  return text.includes("profile appears to be in use") || text.includes("process_singleton_posix");
}

async function waitForConnectedState(client, timeoutMs = READY_STATE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    try {
      state = await client.getState();
      if (state === "CONNECTED") return state;
    } catch {
      // The web page may still be establishing the bridge.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`WhatsApp web session did not reach CONNECTED (state: ${state || "unknown"})`);
}

function clearChromiumProfileLockFiles(clientId) {
  const profileDir = getChromiumProfileDir(clientId);
  const lockCandidates = [
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "SingletonSocket.lock",
    "DevToolsActivePort",
  ];

  const removed = [];
  for (const name of lockCandidates) {
    const fullPath = path.join(profileDir, name);
    if (existsSync(fullPath)) {
      try {
        removeSync(fullPath);
        removed.push(name);
      } catch (err) {
        logger.warn("Failed to remove Chromium lock file", { clientId, fullPath, err });
      }
    }
  }

  return { profileDir, removed };
}

async function destroyClientInstance(clientId, clientObj, reason = "destroy") {
  if (!clientObj?.client) return;

  const clientLogger = logger.child({ clientId });
  try {
    await clientObj.client.destroy();
    clientLogger.info("Client destroyed", { reason });
  } catch (err) {
    clientLogger.warn("Failed to destroy client cleanly", { reason, err });
  } finally {
    clientObj.client = null;
  }
}

function clearReconnectTimer(clientObj) {
  if (clientObj?.reconnectTimer) {
    clearTimeout(clientObj.reconnectTimer);
    clientObj.reconnectTimer = null;
  }
}

function scheduleReconnect(clientId, clientObj, reason = "unknown") {
  if (!clientObj?.enabled) return;
  if (clientObj.reconnectTimer) return;

  if (clientObj.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    updateClientStatus(clientId, clientObj, {
      status: "error",
      error: `Reconnect limit reached after ${clientObj.reconnectAttempts} attempts`,
      ready: false,
      qrCode: null,
    });
    logger.error("Reconnect attempts exhausted", { clientId, reason, attempts: clientObj.reconnectAttempts });
    return;
  }

  const delay = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * Math.pow(2, clientObj.reconnectAttempts)
  );
  clientObj.reconnectAttempts += 1;

  updateClientStatus(clientId, clientObj, {
    status: "reconnecting",
    error: `Reconnecting in ${Math.round(delay / 1000)}s (${reason})`,
    ready: false,
    qrCode: null,
  });

  clientObj.reconnectTimer = setTimeout(() => {
    clientObj.reconnectTimer = null;
    initClient(clientId, clientObj, { forceReinit: true, trigger: "scheduled_reconnect" });
  }, delay);
  clientObj.reconnectTimer.unref?.();

  logger.warn("Reconnect scheduled", {
    clientId,
    reason,
    delayMs: delay,
    attempt: clientObj.reconnectAttempts,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
  });
}

async function toggleClient(clientId, enabled) {
  const clientObj = clients[clientId];
  if (!clientObj) return false;

  clientObj.enabled = !!enabled;
  clearReconnectTimer(clientObj);

  if (clientObj.enabled) {
    clientObj.error = null;
    clientObj.reconnectAttempts = 0;
    saveClientStates();
    await initClient(clientId, clientObj, { trigger: "toggle_enable" });
    return true;
  }

  await destroyClientInstance(clientId, clientObj, "toggle_disable");
  clientObj.initPromise = null;
  clientObj.initInProgress = false;
  updateClientStatus(clientId, clientObj, {
    status: "disconnected",
    error: null,
    qrCode: null,
    ready: false,
  });
  return true;
}

async function initClient(clientId, clientObj, options = {}) {
  if (!clientObj || typeof clientObj !== "object") {
    logger.error("Cannot initialize client: invalid object", { clientId });
    return null;
  }

  const { forceReinit = false, trigger = "manual", lockRecoveryAttempted = false } = options;
  const clientLogger = logger.child({ clientId, trigger });

  if (!clientObj.enabled) {
    clientLogger.info("Skipping init because client is disabled");
    return null;
  }

  if (clientObj.initInProgress) {
    clientLogger.debug("Init already in progress, reusing current promise");
    return clientObj.initPromise;
  }

  if (!forceReinit && clientObj.client && clientObj.ready) {
    clientLogger.debug("Client already ready, skipping init");
    return clientObj.client;
  }

  clearReconnectTimer(clientObj);
  clientObj.initInProgress = true;
  updateClientStatus(clientId, clientObj, { status: "initializing", error: null, ready: false, qrCode: null });

  const sessionDir = path.join(SESSION_BASE_DIR, clientId);
  try {
    ensureDirSync(sessionDir);
  } catch (err) {
    updateClientStatus(clientId, clientObj, { status: "error", error: err.message, ready: false, qrCode: null });
    clientObj.initInProgress = false;
    clientLogger.error("Failed to create session directory", { err, sessionDir });
    return null;
  }

  if (clientObj.client) {
    await destroyClientInstance(clientId, clientObj, "replace_existing_before_init");
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionDir, clientId }),
    puppeteer: getPuppeteerConfig(),
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000,
    authTimeoutMs: 60000,
    qrMaxRetries: 5,
  });

  client.setMaxListeners(20);

  client.on("qr", async (qr) => {
    try {
      const qrDataUrl = await qrcode.toDataURL(qr);
      clientObj.qrGeneratedAt = new Date();
      updateClientStatus(clientId, clientObj, {
        status: "qr_ready",
        qrCode: qrDataUrl,
        ready: false,
        error: null,
      });
      clientLogger.info("QR generated");
    } catch (err) {
      updateClientStatus(clientId, clientObj, {
        status: "error",
        error: `QR generation failed: ${err.message}`,
        ready: false,
        qrCode: null,
      });
      clientLogger.error("QR generation failed", { err });
    }
  });

  client.on("authenticated", () => {
    if (clientObj.authTimer) clearTimeout(clientObj.authTimer);
    clientObj.authTimer = setTimeout(async () => {
      if (clientObj.status !== "authenticating" || !clientObj.enabled) return;
      clientLogger.warn("Authentication stalled; restarting client automatically");
      await destroyClientInstance(clientId, clientObj, "authentication_timeout");
      clientObj.initPromise = null;
      clientObj.initInProgress = false;
      scheduleReconnect(clientId, clientObj, "authentication_timeout");
    }, 45000);
    clientObj.authTimer.unref?.();
    updateClientStatus(clientId, clientObj, {
      status: "authenticating",
      qrCode: null,
      ready: false,
      error: null,
    });
    clientLogger.info("Authenticated successfully");
  });

  client.on("ready", async () => {
    if (clientObj.authTimer) {
      clearTimeout(clientObj.authTimer);
      clientObj.authTimer = null;
    }
    try {
      // whatsapp-web.js can emit ready while its injected chat bridge is
      // still unavailable. Do not expose the client to campaigns/groups yet.
      await waitForConnectedState(client);
    } catch (err) {
      clientLogger.warn("Ready event received before WhatsApp bridge was usable", { err });
      updateClientStatus(clientId, clientObj, {
        status: "error",
        error: err.message,
        ready: false,
        qrCode: null,
      });
      if (clientObj.enabled) scheduleReconnect(clientId, clientObj, "ready_state_timeout");
      return;
    }

    try {
      const info = client.info || {};
      let profilePicUrl = null;
      if (info.wid?._serialized && typeof client.getProfilePicUrl === "function") {
        try {
          profilePicUrl = await client.getProfilePicUrl(info.wid._serialized);
        } catch {
          profilePicUrl = null;
        }
      }
      clientObj.accountInfo = {
        name: info.pushname || "WhatsApp User",
        number: info.wid?.user || null,
        profilePicUrl: profilePicUrl || null,
        me: true,
      };
    } catch (err) {
      clientLogger.warn("Failed to load account info on ready", { err });
    }

    clientObj.reconnectAttempts = 0;
    updateClientStatus(clientId, clientObj, {
      status: "ready",
      qrCode: null,
      ready: true,
      error: null,
    });
    clientLogger.info("Client is ready", { hasProfilePic: !!clientObj.accountInfo?.profilePicUrl });
  });

  client.on("loading_screen", (percent, message) => {
    clientLogger.debug("Loading screen update", { percent, message });
  });

  client.on("change_state", (state) => {
    clientLogger.debug("Client state changed", { state });
  });

  client.on("remote_session_saved", () => {
    clientLogger.info("Remote session saved");
  });

  client.on("disconnected", (reason) => {
    if (clientObj.authTimer) {
      clearTimeout(clientObj.authTimer);
      clientObj.authTimer = null;
    }
    clientObj.client = null;
    clientObj.initPromise = null;
    clientObj.initInProgress = false;

    const reasonText = String(reason || "unknown");
    updateClientStatus(clientId, clientObj, {
      status: "disconnected",
      error: reasonText,
      qrCode: null,
      ready: false,
    });
    clientLogger.warn("Client disconnected", { reason: reasonText });

    if (clientObj.enabled && !/logout/i.test(reasonText)) {
      scheduleReconnect(clientId, clientObj, reasonText);
    }
  });

  client.on("auth_failure", (error) => {
    if (clientObj.authTimer) {
      clearTimeout(clientObj.authTimer);
      clientObj.authTimer = null;
    }
    const reason = String(error || "authentication failure");
    clientObj.client = null;
    clientObj.initPromise = null;
    clientObj.initInProgress = false;
    updateClientStatus(clientId, clientObj, {
      status: "error",
      error: `Auth failure: ${reason}`,
      qrCode: null,
      ready: false,
    });
    clientLogger.error("Authentication failure", { reason });
    if (clientObj.enabled) {
      scheduleReconnect(clientId, clientObj, "auth_failure");
    }
  });

  client.on("error", (error) => {
    const message = error?.message || String(error || "unknown client error");
    updateClientStatus(clientId, clientObj, {
      status: "error",
      error: `Client error: ${message}`,
      qrCode: null,
      ready: false,
    });
    clientLogger.error("Client error event", { err: error });
    if (clientObj.enabled) {
      scheduleReconnect(clientId, clientObj, "client_error");
    }
  });

  clientObj.client = client;
  clientLogger.info("Initializing client");

  let initTimeout;
  const initPromise = Promise.race([
    client.initialize(),
    new Promise((_, reject) => {
      initTimeout = setTimeout(
        () => reject(new Error(`Initialization timed out after ${INIT_TIMEOUT_MS}ms`)),
        INIT_TIMEOUT_MS
      );
      initTimeout.unref?.();
    }),
  ])
    .then(() => {
      clientLogger.info("Client initialize call resolved");
      return client;
    })
    .catch(async (err) => {
      if (isProfileLockLaunchError(err) && !lockRecoveryAttempted) {
        // Release any browser started by this attempt before touching locks.
        await destroyClientInstance(clientId, clientObj, "profile_lock_recovery");
        const { profileDir, removed } = clearChromiumProfileLockFiles(clientId);
        clientLogger.warn("Detected Chromium profile lock; cleared lock files and retrying init", {
          profileDir,
          removed,
        });

        clientObj.initInProgress = false;
        clientObj.initPromise = null;
        return initClient(clientId, clientObj, {
          forceReinit: true,
          trigger: "profile_lock_recovery",
          lockRecoveryAttempted: true,
        });
      }

      updateClientStatus(clientId, clientObj, {
        status: "error",
        error: `Initialization error: ${err.message}`,
        ready: false,
        qrCode: null,
      });
      // initialize() can start Chromium before rejecting. Do not leave it
      // owning the profile while the reconnect timer starts another attempt.
      await destroyClientInstance(clientId, clientObj, "initialization_failed");
      clientLogger.error("Client initialization failed", { err });
      if (clientObj.enabled) {
        scheduleReconnect(clientId, clientObj, "initialize_failure");
      }
      return null;
    })
    .finally(() => {
      if (initTimeout) clearTimeout(initTimeout);
      clientObj.initInProgress = false;
    });

  clientObj.initPromise = initPromise;
  return initPromise;
}

const savedStates = loadClientStates();

function buildClientProfile(clientKey, label) {
  return {
    client: null,
    qrCode: null,
    qrGeneratedAt: null,
    ready: false,
    status: "disconnected",
    error: null,
    lastUpdate: new Date(),
    name: label,
    enabled: savedStates[clientKey]?.enabled || false,
    accountInfo: savedStates[clientKey]?.accountInfo || null,
    initInProgress: false,
    initPromise: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    authTimer: null,
    init: function init() {
      return initClient(clientKey, this, { trigger: "direct_init" });
    },
  };
}

// Next dev/API reloads can evaluate this module more than once. Keep the
// actual Client objects on globalThis so a reload cannot create a second
// Puppeteer owner for the same LocalAuth profile.
const clients = globalThis[CLIENTS_KEY] || (globalThis[CLIENTS_KEY] = {
  client1: buildClientProfile("client1", "Profile 1"),
  client2: buildClientProfile("client2", "Profile 2"),
  client3: buildClientProfile("client3", "Profile 3"),
  client4: buildClientProfile("client4", "Profile 4"),
});

if (!global[RESTORE_TIMER_KEY]) {
  logger.info("Restoring enabled WhatsApp clients on boot");
  global[RESTORE_TIMER_KEY] = setTimeout(() => {
  Object.entries(clients).forEach(([id, client], index) => {
    if (!client.enabled) return;
    setTimeout(() => {
      logger.info("Auto-restoring client", { clientId: id });
      initClient(id, client, { trigger: "boot_restore" });
    }, index * 1500);
  });
  }, 2500);
}
global[RESTORE_TIMER_KEY].unref?.();

function shutdownWhatsAppClients() {
  for (const [clientId, clientObj] of Object.entries(clients)) {
    clearReconnectTimer(clientObj);
    void destroyClientInstance(clientId, clientObj, "process_shutdown");
  }
  if (global[SAVE_TIMER_KEY]) {
    clearTimeout(global[SAVE_TIMER_KEY]);
    global[SAVE_TIMER_KEY] = null;
  }
  flushClientStatesSync();
}

if (!global[SHUTDOWN_KEY]) {
  global[SHUTDOWN_KEY] = true;
  process.once("SIGTERM", shutdownWhatsAppClients);
  process.once("SIGINT", shutdownWhatsAppClients);
  process.once("beforeExit", flushClientStatesSync);
}

export { clients, initClient, toggleClient, updateClientStatus };
