// lib/bootstrap.js
// Started once per server process from instrumentation.js.

import { createLogger } from '@/lib/logger';
import { authConfigError } from '@/lib/auth';
import { registerMessageEvents } from '@/lib/messageEvents';
import { restoreSessions, shutdownClients } from '@/lib/whatsappClients';
import { startCampaignScheduler, stopCampaignScheduler } from '@/lib/campaignRunner';

const logger = createLogger({ module: 'bootstrap' });
const BOOT_KEY = '__whatbot_booted';

export async function startBackgroundServices() {
  if (globalThis[BOOT_KEY]) return;
  globalThis[BOOT_KEY] = true;

  const configError = authConfigError();
  if (configError) logger.error(`Configuration problem: ${configError}. Sign-in is disabled until this is fixed.`);
  if (!process.env.MONGODB_URI) logger.error('MONGODB_URI is not set; campaigns and history are unavailable.');

  registerMessageEvents();
  restoreSessions();
  startCampaignScheduler().catch((err) => logger.error('Campaign scheduler failed to start', { err }));

  const shutdown = (signal) => {
    logger.info('Shutting down background services', { signal });
    stopCampaignScheduler();
    shutdownClients();
    // Adding a signal listener disables Node's default exit. If nothing else
    // (e.g. the Next.js server) handles the signal, exit ourselves.
    if (process.listenerCount(signal) === 0) setTimeout(() => process.exit(0), 500);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  logger.info('Background services started');
}
