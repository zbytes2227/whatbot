import { HttpError, intInRange, str, withApi } from '@/lib/api';
import { getRecentLogs } from '@/lib/logger';
import {
  clients,
  getClientsSnapshot,
  initClient,
  logoutClient,
  renameClient,
  restartClient,
  serializeClient,
  toggleClient,
} from '@/lib/whatsappClients';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForQrOrReady(clientId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entry = clients[clientId];
    if (!entry || entry.ready || entry.qrCode || ['error', 'disconnected', 'logged_out'].includes(entry.status)) return;
    await wait(300);
  }
}

function requireClient(clientId) {
  if (typeof clientId !== 'string' || !clients[clientId]) throw new HttpError(400, 'Unknown WhatsApp profile');
  return clients[clientId];
}

export default withApi(async (req, res, { logger }) => {
  if (req.method === 'GET') {
    const { action, clientId } = req.query;

    if (action === 'status') {
      return res.status(200).json({ success: true, clients: getClientsSnapshot() });
    }

    if (action === 'logs') {
      const limit = intInRange(req.query.limit, { min: 10, max: 200, fallback: 50 });
      const level = ['error', 'warn', 'info'].includes(req.query.level) ? req.query.level : null;
      return res.status(200).json({ success: true, logs: getRecentLogs(limit, level) });
    }

    if (action === 'qr') {
      const entry = requireClient(clientId);
      if (!entry.enabled) throw new HttpError(400, 'Turn the profile on first.');
      if (!entry.client && !entry.initPromise) {
        await initClient(clientId, { trigger: 'qr_request' }).catch((err) => logger.warn('QR init failed', { clientId, err }));
      }
      await waitForQrOrReady(clientId, 12000);
      return res.status(200).json({ success: true, client: serializeClient(entry), qrCode: entry.qrCode });
    }

    throw new HttpError(400, 'Unknown action');
  }

  const body = req.body || {};
  const entry = requireClient(body.clientId);

  switch (body.action) {
    case 'toggle':
      await toggleClient(entry.id, !!body.enabled);
      logger.info('Profile toggled', { clientId: entry.id, enabled: !!body.enabled });
      break;
    case 'connect':
      if (!entry.enabled) await toggleClient(entry.id, true);
      else await initClient(entry.id, { trigger: 'manual_connect' });
      break;
    case 'restart':
      if (!entry.enabled) throw new HttpError(400, 'Turn the profile on before restarting it.');
      await restartClient(entry.id);
      logger.info('Profile restarted', { clientId: entry.id });
      break;
    case 'logout':
      await logoutClient(entry.id);
      logger.info('Profile logged out', { clientId: entry.id });
      break;
    case 'rename': {
      const name = str(body.name, { max: 40 });
      if (!name) throw new HttpError(400, 'Name cannot be empty');
      renameClient(entry.id, name);
      break;
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }

  return res.status(200).json({ success: true, client: serializeClient(entry) });
}, { methods: ['GET', 'POST'], db: false, name: 'whatsapp' });
