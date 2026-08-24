import { clients, startClient, toggleClient, logoutClient, getProfileLockDiagnostics } from '@/lib/whatsappClients';
import { verifyAuth } from '@/lib/auth';
import { createLogger, getRecentLogs, getRequestContext } from '@/lib/logger';

const baseLogger = createLogger({ module: 'api.whatsapp' });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForQRCodeOrReady(clientId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const client = clients[clientId];
    if (!client) break;
    if (client.ready || client.qrCode || client.status === 'error') break;
    await wait(400);
  }
}

function serializeClientStatus(clientId, client) {
  return {
    ready: client.ready,
    hasQR: !!client.qrCode,
    qrCode: client.qrCode,
    status: client.status,
    lastUpdate: client.lastUpdate,
    error: client.error,
    enabled: client.enabled,
    accountInfo: {
      name: client.accountInfo?.name || client.name || 'Unknown',
      number: client.accountInfo?.number || null,
      profilePicUrl: client.accountInfo?.profilePicUrl || null,
      me: client.accountInfo?.me ?? false,
    },
    detailedStatus: getDetailedStatus(client),
    uptime: client.lastUpdate ? Math.floor((Date.now() - new Date(client.lastUpdate).getTime()) / 1000) : null,
    sessionExists: !!client.client,
    reconnectAttempts: client.reconnectAttempts || 0,
    initInProgress: !!client.initInProgress,
    generation: client.generation || 0,
    bridgeState: client.bridgeState || 'unknown',
    browserPid: client.client?.pupBrowser?.process?.()?.pid || null,
    profileDir: client.profileDir || null,
    queueLength: client.queueLength || 0,
    activeOperation: client.activeOperation,
    operationDuration: client.operationStartedAt ? Date.now() - new Date(client.operationStartedAt).getTime() : null,
    lastSuccessfulBridgeOperation: client.lastSuccessfulBridgeOperation,
    lastSuccessfulSend: client.lastSuccessfulSend,
    lastBrowserDisconnect: client.lastBrowserDisconnect,
    lastAuthentication: client.lastAuthentication,
    lastQR: client.lastQR,
    profileLocks: getProfileLockDiagnostics(clientId),
  };
}

export default async function handler(req, res) {
  const requestContext = getRequestContext(req, '/api/whatsapp');
  const logger = baseLogger.child(requestContext);

  try {
    await verifyAuth(req);
  } catch (authError) {
    logger.warn('Authentication failed', { authError });
    return res.status(authError.status || 500).json(authError);
  }

  if (req.method === 'GET') {
    try {
      const { action, clientId } = req.query;

      if (action === 'logs') {
        const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100)));
        const level = typeof req.query.level === 'string' ? req.query.level : null;
        return res.status(200).json({
          success: true,
          logs: getRecentLogs(limit, level),
        });
      }

      if (clientId && !clients[clientId]) {
        return res.status(400).json({ success: false, msg: 'Invalid client ID' });
      }

      if (action === 'status') {
        const status = {};
        for (const [id, client] of Object.entries(clients)) {
          status[id] = serializeClientStatus(id, client);
        }
        return res.status(200).json({ success: true, clients: status });
      }

      if (action === 'qr' && clientId) {
        const client = clients[clientId];
        logger.info('QR requested', { clientId, currentStatus: client.status, ready: client.ready });

        if (!client.enabled) {
          return res.status(400).json({
            success: false,
            msg: 'Client is disabled. Please enable it first.',
          });
        }

        if (!client.client || ['error', 'disconnected'].includes(client.status)) {
          await startClient(clientId, client, { trigger: 'api_qr_request' });
          await waitForQRCodeOrReady(clientId, 12000);
        } else if (client.status === 'reconnecting') {
          await waitForQRCodeOrReady(clientId, 5000);
        }

        return res.status(200).json({
          success: true,
          clientId,
          ...serializeClientStatus(clientId, clients[clientId]),
        });
      }

      return res.status(400).json({ success: false, msg: 'Invalid or missing action parameter for GET' });
    } catch (error) {
      logger.error('GET /api/whatsapp error', { err: error });
      return res.status(500).json({ success: false, msg: 'Internal server error', details: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = req.body;
      if (!data || !data.action) {
        return res.status(400).json({ success: false, msg: 'Action is required' });
      }

      const { action } = data;

      if (action === 'toggle') {
        const { clientId, enabled } = data;
        if (!clientId || !clients[clientId]) {
          return res.status(400).json({ success: false, msg: 'Valid clientId is required for toggle' });
        }

        const success = await toggleClient(clientId, enabled);
        if (!success) {
          return res.status(400).json({ success: false, msg: 'Failed to toggle client' });
        }

        logger.info('Client toggled', { clientId, enabled: !!enabled });
        return res.status(200).json({
          success: true,
          msg: `${clientId} ${enabled ? 'enabled' : 'disabled'} successfully`,
          enabled: clients[clientId].enabled,
          status: serializeClientStatus(clientId, clients[clientId]),
        });
      }

      if (action === 'logout') {
        const { clientId } = data;
        if (!clientId || !clients[clientId]) {
          return res.status(400).json({ success: false, msg: 'Valid clientId is required for logout' });
        }

        const client = clients[clientId];
        if (!client.client) {
          return res.status(400).json({ success: false, msg: 'Client not initialized or already logged out' });
        }
        await logoutClient(clientId);

        logger.info('Client logged out', { clientId });
        return res.status(200).json({ success: true, msg: `${clientId} logged out successfully` });
      }

      if (action === 'restart') {
        const { clientId } = data;
        if (!clientId || !clients[clientId]) {
          return res.status(400).json({ success: false, msg: 'Valid clientId is required for restart' });
        }

        const client = clients[clientId];
        if (!client.enabled) {
          return res.status(400).json({ success: false, msg: 'Enable the client before restart' });
        }

        // initClient owns the single-flight destroy/recreate sequence. Manual
        // state clearing here can race initialize() and launch a second browser.
        client.reconnectAttempts = 0;
        await startClient(clientId, client, { forceReinit: true, trigger: 'api_restart' });

        logger.info('Client restart initiated', { clientId });
        return res.status(200).json({
          success: true,
          msg: `${clientId} restart initiated`,
          status: serializeClientStatus(clientId, clients[clientId]),
        });
      }

      return res.status(400).json({ success: false, msg: 'Invalid action for POST' });
    } catch (error) {
      logger.error('POST /api/whatsapp error', { err: error });
      return res.status(500).json({ success: false, msg: 'Internal server error', details: error.message });
    }
  }

  return res.status(405).json({ success: false, msg: 'Method not allowed' });
}

function getDetailedStatus(client) {
  if (!client.enabled) return 'Disabled - Toggle ON to activate';
  if (client.ready) return 'Connected and Ready for Messages';
  if (client.status === 'qr_ready') return 'QR Code Generated - Scan with WhatsApp';
  if (client.status === 'initializing') return 'Connecting to WhatsApp...';
  if (client.status === 'authenticating') return 'Authenticating Session...';
  if (client.status === 'reconnecting') return client.error || 'Reconnecting to WhatsApp...';
  if (client.status === 'disconnected') return 'Disconnected - Toggle ON to Connect';
  if (client.status === 'error') return `Error: ${client.error || 'Unknown error'}`;
  return client.status || 'Unknown Status';
}
