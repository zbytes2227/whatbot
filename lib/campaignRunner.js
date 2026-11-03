// lib/campaignRunner.js
// Background campaign execution.
//
// Safety model
//  - A campaign is executed by at most one runner, enforced with a lease in
//    MongoDB (runnerLeaseId + runnerLeaseExpiresAt) renewed by a heartbeat.
//  - Progress counters are updated atomically ($inc) and filtered by the
//    lease, so a concurrent pause/stop/edit from the API is never overwritten.
//  - A message is recorded as "pending" in MessageHistory BEFORE it is sent.
//    If the process dies mid-send, the next runner finds that record and asks
//    a human to decide instead of silently sending a duplicate.
//  - Failures that are known to happen before WhatsApp received the message
//    are retried; failures during the send itself pause for review.

import os from 'os';
import { randomUUID } from 'crypto';
import Campaign from '@/models/Campaigns';
import ContactList from '@/models/ContactList';
import MessageHistory, { SENT_STATUSES } from '@/models/MessageHistory';
import Media from '@/models/Media';
import OptOut from '@/models/OptOut';
import connectToMongoDB from '@/lib/mongodb';
import { createLogger } from '@/lib/logger';
import { normalizePhone } from '@/lib/phone';
import { renderTemplate } from '@/lib/messageTemplate';
import { getReadyClientIds, sendWhatsAppMessage } from '@/lib/whatsappClients';
import {
  DEFAULT_TIMEZONE,
  dateKey,
  isWithinSendingHours,
  nextWindowStart,
  resolveScheduledStart,
  startOfDay,
} from '@/lib/campaignTime';

const logger = createLogger({ module: 'campaignRunner' });

const OWNER = process.env.RUNNER_INSTANCE_ID || os.hostname();
const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const TICK_MS = 15 * 1000;
const WAIT_FOR_CLIENT_MS = 30 * 1000;
const PRE_SEND_RETRY_MS = 30 * 1000;
const MAX_PRE_SEND_ATTEMPTS = 3;
const NOT_REGISTERED_PAUSE_MS = [3000, 8000];
const MONGO_RETRY_LIMIT = 3;

const STATE_KEY = '__whatbot_campaign_runner';
const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {
  running: new Map(),
  requeue: new Set(),
  timer: null,
  ticking: false,
  started: false,
  shuttingDown: false,
});

export function runFilter(runNumber = 1) {
  return runNumber === 1 ? { $in: [1, null] } : runNumber;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientMongoError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return /mongo(server)?selection|mongonetwork|timed out|timeout|econnreset|socket|topology|network/.test(text);
}

async function withMongoRetry(operation, context = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MONGO_RETRY_LIMIT; attempt += 1) {
    try {
      await connectToMongoDB();
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === MONGO_RETRY_LIMIT) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  logger.error('MongoDB operation failed', { ...context, err: lastError });
  throw lastError;
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function getDelayMs(delaySettings = {}) {
  const unitMs = delaySettings.unit === 'seconds' ? 1000 : 60000;
  const minFloor = delaySettings.unit === 'seconds' ? 10 : 1;
  const min = Math.max(minFloor, Number(delaySettings.minDelay) || (delaySettings.unit === 'seconds' ? 30 : 5));
  const max = Math.max(min, Number(delaySettings.maxDelay) || min);
  // Millisecond jitter so sends never land on round numbers.
  return randomBetween(min * unitMs, max * unitMs);
}

/** Sleep that a pause/stop/edit can cut short via wakeCampaign(). */
function interruptibleSleep(ctl, ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      ctl.wake = null;
      resolve();
    }
    ctl.wake = done;
  });
}

export function wakeCampaign(campaignId) {
  state.running.get(campaignId)?.wake?.();
}

export function isRunningLocally(campaignId) {
  return state.running.has(campaignId);
}

export function queueCampaignRun(campaignId, trigger = 'manual') {
  if (state.shuttingDown) return false;
  if (state.running.has(campaignId)) {
    // A runner exists (maybe asleep). Wake it; if it exits, run again.
    state.requeue.add(campaignId);
    wakeCampaign(campaignId);
    return false;
  }
  const ctl = { wake: null };
  state.running.set(campaignId, ctl);
  setImmediate(async () => {
    try {
      await runCampaign(campaignId, trigger, ctl);
    } catch (err) {
      logger.error('Campaign runner crashed; the scheduler will recover it', { campaignId, trigger, err });
    } finally {
      state.running.delete(campaignId);
      if (state.requeue.delete(campaignId)) queueCampaignRun(campaignId, 'requeue');
    }
  });
  return true;
}

function startHeartbeat(campaignId, leaseId) {
  let lost = null;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await withMongoRetry(() => Campaign.updateOne(
        { campaignId, runnerLeaseId: leaseId },
        { $set: { runnerLeaseExpiresAt: new Date(Date.now() + LEASE_MS) } }
      ), { campaignId, op: 'heartbeat' });
      if (!result.matchedCount) {
        lost = new Error('Campaign runner lease was lost');
        lost.code = 'RUNNER_LEASE_LOST';
      }
    } catch (err) {
      // Transient outage: keep going while the current lease is still valid.
      logger.warn('Campaign heartbeat failed', { campaignId, err });
    } finally {
      busy = false;
    }
  }, HEARTBEAT_MS);
  timer.unref?.();
  return {
    assertOwned() {
      if (lost) throw lost;
    },
    stop() {
      clearInterval(timer);
    },
  };
}

// --- per-run context helpers ---------------------------------------------

async function getNumbers(ctx, campaign) {
  const meta = await ContactList.findById(campaign.contactList).select('updatedAt').lean();
  if (!meta) return [];
  const key = `${campaign.contactList}:${new Date(meta.updatedAt || 0).getTime()}`;
  if (ctx.numbers?.key === key) return ctx.numbers.items;

  const list = await ContactList.findById(campaign.contactList).select('contacts').lean();
  const seen = new Set();
  const items = [];
  for (const original of list?.contacts || []) {
    const formatted = normalizePhone(original);
    if (formatted && !seen.has(formatted)) {
      seen.add(formatted);
      items.push({ original: String(original), formatted });
    }
  }
  ctx.numbers = { key, items };
  return items;
}

async function isOptedOut(number) {
  return !!(await OptOut.exists({ number }));
}

async function loadMedia(ctx, campaign, messageIndex, message) {
  if (!message?.hasMedia) return null;
  const cacheKey = message.mediaId ? String(message.mediaId) : `legacy:${messageIndex}`;
  if (ctx.media.has(cacheKey)) return ctx.media.get(cacheKey);

  let media = null;
  if (message.mediaId) {
    const doc = await Media.findById(message.mediaId).lean();
    if (doc) media = { buffer: Buffer.from(doc.data.buffer || doc.data), mimetype: doc.mimeType, fileName: message.mediaName || doc.name };
  } else {
    const legacy = await Campaign.findOne({ campaignId: campaign.campaignId }).select('messages.mediaData').lean();
    const data = legacy?.messages?.[messageIndex]?.mediaData;
    if (data) media = { buffer: Buffer.from(data, 'base64'), mimetype: message.mediaType || 'application/octet-stream', fileName: message.mediaName };
  }
  if (!media) logger.warn('Campaign attachment missing; sending text only', { campaignId: campaign.campaignId, messageIndex });
  ctx.media.set(cacheKey, media);
  return media;
}

// --- state transitions ------------------------------------------------------

/** Progress update: applies while we hold the lease, whatever the status. */
async function updateProgress(ctx, update) {
  const result = await withMongoRetry(() => Campaign.updateOne({ campaignId: ctx.campaignId, runnerLeaseId: ctx.leaseId }, update), { campaignId: ctx.campaignId, op: 'progress' });
  return result.matchedCount > 0;
}

/** Status transition: only from "running", so user actions always win. */
async function transition(ctx, update) {
  const result = await withMongoRetry(() => Campaign.updateOne({ campaignId: ctx.campaignId, runnerLeaseId: ctx.leaseId, status: 'running' }, update), { campaignId: ctx.campaignId, op: 'transition' });
  return result.matchedCount > 0;
}

function dailyCounterUpdate(campaign, today) {
  return campaign.dailyCountDate === today
    ? { inc: { dailyCount: 1 }, set: {} }
    : { inc: {}, set: { dailyCount: 1, dailyCountDate: today } };
}

async function advance(ctx, campaign, outcome, { countDaily = false } = {}) {
  const inc = { processedNumbers: 1, currentIndex: 1 };
  if (outcome === 'success') inc.successCount = 1;
  else if (outcome === 'failed') inc.failedCount = 1;
  else if (outcome === 'skipped') inc.skippedCount = 1;
  const set = { lastError: null };
  if (outcome === 'success') set.lastSentAt = new Date();
  if (countDaily) {
    const daily = dailyCounterUpdate(campaign, ctx.today);
    Object.assign(inc, daily.inc);
    Object.assign(set, daily.set);
  }
  return updateProgress(ctx, { $inc: inc, $set: set });
}

export async function buildCampaignSummary(campaignId, runNumber, messageCount = 0) {
  const rows = await MessageHistory.aggregate([
    { $match: { campaignId, source: 'campaign', runNumber: runFilter(runNumber) } },
    { $group: { _id: { status: '$deliveryStatus', messageIndex: '$messageIndex' }, count: { $sum: 1 }, avgTime: { $avg: '$deliveryTime' } } },
  ]);
  let sent = 0;
  let failed = 0;
  let weighted = 0;
  const distribution = new Map();
  for (const row of rows) {
    if (SENT_STATUSES.includes(row._id.status)) {
      sent += row.count;
      weighted += (row.avgTime || 0) * row.count;
      distribution.set(row._id.messageIndex, (distribution.get(row._id.messageIndex) || 0) + row.count);
    } else if (row._id.status === 'failed' || row._id.status === 'unknown') {
      failed += row.count;
    }
  }
  const totalProcessed = sent + failed;
  return {
    totalProcessed,
    successRate: totalProcessed ? Math.round((sent / totalProcessed) * 1000) / 10 : 0,
    averageDeliveryTime: sent ? Math.round(weighted / sent) : 0,
    messagesDistribution: Array.from({ length: messageCount }, (_, i) => ({ messageIndex: i, sentCount: distribution.get(i) || 0 })),
  };
}

// --- one step of the runner -------------------------------------------------

async function runStep(ctx) {
  const campaign = await withMongoRetry(
    () => Campaign.findOne({ campaignId: ctx.campaignId }).select('-messages.mediaData').lean(),
    { campaignId: ctx.campaignId, op: 'load' }
  );
  if (!campaign || campaign.status !== 'running' || campaign.runnerLeaseId !== ctx.leaseId) return { done: true };

  const now = new Date();
  const timeZone = campaign.scheduling?.timezone || DEFAULT_TIMEZONE;
  ctx.today = dateKey(now, timeZone);

  if (!isWithinSendingHours(campaign.scheduling, now)) {
    const nextResumeAt = campaign.scheduling?.resumeNextDay === false ? null : nextWindowStart(campaign.scheduling, now);
    await transition(ctx, { $set: { status: 'paused', pauseReason: 'outside_hours', lastPausedAt: now, nextResumeAt } });
    logger.info('Campaign paused outside sending hours', { campaignId: ctx.campaignId, nextResumeAt });
    return { done: true };
  }

  const sentToday = campaign.dailyCountDate === ctx.today ? campaign.dailyCount || 0 : 0;
  if (campaign.dailyLimit > 0 && sentToday >= campaign.dailyLimit) {
    const nextResumeAt = nextWindowStart(campaign.scheduling, startOfDay(now, timeZone, 1));
    await transition(ctx, { $set: { status: 'paused', pauseReason: 'daily_limit', lastPausedAt: now, nextResumeAt } });
    logger.info('Campaign reached its daily limit', { campaignId: ctx.campaignId, dailyLimit: campaign.dailyLimit, nextResumeAt });
    return { done: true };
  }

  const numbers = await getNumbers(ctx, campaign);
  if (!numbers.length) {
    await transition(ctx, { $set: { status: 'error', lastError: 'The contact list is empty or has no valid numbers.' } });
    return { done: true };
  }
  if (campaign.totalNumbers !== numbers.length) {
    await updateProgress(ctx, { $set: { totalNumbers: numbers.length } });
  }

  if (campaign.currentIndex >= numbers.length) {
    const summary = await buildCampaignSummary(ctx.campaignId, campaign.runNumber || 1, campaign.messages.length);
    await transition(ctx, { $set: { status: 'completed', endTime: new Date(), summary, lastError: null, nextResumeAt: null } });
    logger.info('Campaign completed', { campaignId: ctx.campaignId, ...summary });
    return { done: true };
  }

  const readyClients = getReadyClientIds(campaign.selectedClients || []);
  if (!readyClients.length) {
    await updateProgress(ctx, { $set: { lastError: 'Waiting for a selected WhatsApp profile to connect.' } });
    return { sleepMs: WAIT_FOR_CLIENT_MS };
  }

  const item = numbers[campaign.currentIndex];
  const runNumber = campaign.runNumber || 1;

  if (await isOptedOut(item.formatted)) {
    await MessageHistory.create({
      campaignId: ctx.campaignId, runNumber, number: item.formatted, originalNumber: item.original,
      message: '', deliveryStatus: 'skipped', source: 'campaign', clientUsed: '-', error: 'Recipient opted out',
    });
    await advance(ctx, campaign, 'skipped');
    return { sleepMs: 0 };
  }

  // Idempotency: never send twice to the same number within a run.
  const existing = await MessageHistory.findOne({
    campaignId: ctx.campaignId, runNumber: runFilter(runNumber), number: item.formatted, source: 'campaign',
    deliveryStatus: { $nin: ['failed', 'skipped'] },
  }).sort({ createdAt: -1 }).lean();

  if (existing) {
    if (SENT_STATUSES.includes(existing.deliveryStatus)) {
      await advance(ctx, campaign, 'success');
      logger.info('Reconciled an already-sent message without resending', { campaignId: ctx.campaignId, number: item.formatted });
      return { sleepMs: 0 };
    }
    await transition(ctx, {
      $set: {
        status: 'needs_review',
        review: { historyId: existing._id, number: item.formatted, reason: existing.error || 'The previous run stopped while this message was being sent.' },
        lastError: 'Delivery outcome is uncertain for one recipient. Review it to continue.',
      },
    });
    logger.warn('Campaign needs review before continuing', { campaignId: ctx.campaignId, number: item.formatted, status: existing.deliveryStatus });
    return { done: true };
  }

  const clientId = readyClients[Math.floor(Math.random() * readyClients.length)];
  const messageIndex = Math.floor(Math.random() * campaign.messages.length);
  const message = campaign.messages[messageIndex];
  const text = renderTemplate(message.text, { number: item.formatted });
  const media = await loadMedia(ctx, campaign, messageIndex, message);

  const history = await MessageHistory.create({
    campaignId: ctx.campaignId, runNumber, messageIndex, number: item.formatted, originalNumber: item.original,
    message: text, deliveryStatus: 'pending', source: 'campaign', clientUsed: clientId,
    hasMedia: !!media, mediaType: media?.mimetype, mediaName: media?.fileName, sentTime: new Date(),
  });

  try {
    const result = await sendWhatsAppMessage({ clientId, to: item.formatted, text, media });
    await MessageHistory.updateOne({ _id: history._id }, {
      $set: { deliveryStatus: 'sent', deliveryTime: result.deliveryTime, waMessageId: result.messageId, sentTime: new Date() },
    });
    ctx.preSendAttempts.delete(item.formatted);
    await advance(ctx, campaign, 'success', { countDaily: true });
    return { sleepMs: getDelayMs(campaign.delaySettings) };
  } catch (err) {
    const deliveryTime = Date.now() - history.sentTime.getTime();

    if (err.code === 'NUMBER_NOT_REGISTERED') {
      await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: 'failed', deliveryTime, error: err.message } });
      await advance(ctx, campaign, 'failed');
      return { sleepMs: randomBetween(...NOT_REGISTERED_PAUSE_MS) };
    }

    if (err.stage === 'pre_send') {
      const attempts = (ctx.preSendAttempts.get(item.formatted) || 0) + 1;
      ctx.preSendAttempts.set(item.formatted, attempts);
      if (attempts >= MAX_PRE_SEND_ATTEMPTS) {
        await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: 'failed', deliveryTime, error: `Not sent after ${attempts} attempts: ${err.message}` } });
        ctx.preSendAttempts.delete(item.formatted);
        await advance(ctx, campaign, 'failed');
        return { sleepMs: 5000 };
      }
      // Never reached WhatsApp: drop the record and retry this number.
      await MessageHistory.deleteOne({ _id: history._id });
      await updateProgress(ctx, { $set: { lastError: `Retrying ${item.formatted} (${attempts}/${MAX_PRE_SEND_ATTEMPTS}): ${err.message}` } });
      return { sleepMs: PRE_SEND_RETRY_MS };
    }

    await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: 'unknown', deliveryTime, error: err.message } });
    await transition(ctx, {
      $set: {
        status: 'needs_review',
        review: { historyId: history._id, number: item.formatted, reason: err.message },
        lastError: 'Delivery outcome is uncertain for one recipient. Review it to continue.',
      },
    });
    logger.error('Campaign send outcome uncertain; paused for review', { campaignId: ctx.campaignId, number: item.formatted, clientId, err });
    return { done: true };
  }
}

async function runCampaign(campaignId, trigger, ctl) {
  const leaseId = randomUUID();
  const now = new Date();
  const acquired = await withMongoRetry(() => Campaign.findOneAndUpdate(
    {
      campaignId,
      status: { $in: ['pending', 'running'] },
      $or: [{ runnerLeaseId: null }, { runnerLeaseExpiresAt: null }, { runnerLeaseExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        status: 'running',
        runnerLeaseId: leaseId,
        runnerOwner: OWNER,
        runnerLeaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        pauseReason: null,
        nextResumeAt: null,
      },
    },
    { new: true, projection: { campaignId: 1, startTime: 1 } }
  ), { campaignId, op: 'acquire' });
  if (!acquired) return;
  if (!acquired.startTime) await Campaign.updateOne({ campaignId, runnerLeaseId: leaseId }, { $set: { startTime: now } });

  logger.info('Campaign runner started', { campaignId, trigger });
  const heartbeat = startHeartbeat(campaignId, leaseId);
  const ctx = { campaignId, leaseId, ctl, numbers: null, media: new Map(), preSendAttempts: new Map(), today: null };

  try {
    while (!state.shuttingDown) {
      heartbeat.assertOwned();
      const step = await runStep(ctx);
      if (step.done) break;
      if (step.sleepMs) await interruptibleSleep(ctl, step.sleepMs);
    }
  } finally {
    heartbeat.stop();
    await Campaign.updateOne({ campaignId, runnerLeaseId: leaseId }, { $set: { runnerLeaseId: null, runnerLeaseExpiresAt: null } })
      .catch((err) => logger.warn('Could not release campaign lease; it will expire', { campaignId, err }));
    logger.info('Campaign runner stopped', { campaignId });
  }
}

// --- scheduler ----------------------------------------------------------------

async function tick() {
  if (state.ticking || state.shuttingDown) return;
  state.ticking = true;
  try {
    await connectToMongoDB();
    const now = new Date();

    const scheduled = await Campaign.find({ status: 'scheduled' }).select('campaignId scheduling').lean();
    for (const campaign of scheduled) {
      const startAt = resolveScheduledStart(campaign);
      if (!startAt || startAt <= now) {
        await Campaign.updateOne({ campaignId: campaign.campaignId, status: 'scheduled' }, { $set: { status: 'pending' } });
      }
    }

    await Campaign.updateMany(
      { status: 'paused', nextResumeAt: { $ne: null, $lte: now } },
      { $set: { status: 'pending', nextResumeAt: null, pauseReason: null } }
    );

    const runnable = await Campaign.find({
      status: { $in: ['pending', 'running'] },
      $or: [{ runnerLeaseId: null }, { runnerLeaseExpiresAt: null }, { runnerLeaseExpiresAt: { $lte: now } }],
    }).select('campaignId').lean();
    for (const campaign of runnable) queueCampaignRun(campaign.campaignId, 'scheduler');
  } catch (err) {
    logger.error('Campaign scheduler tick failed', { err });
  } finally {
    state.ticking = false;
  }
}

export async function startCampaignScheduler() {
  if (state.started) return;
  state.started = true;
  try {
    await connectToMongoDB();
    // Leases held by a previous process on this host are dead: free them so
    // campaigns resume immediately instead of waiting for expiry.
    const freed = await Campaign.updateMany(
      { runnerOwner: OWNER, runnerLeaseId: { $ne: null } },
      { $set: { runnerLeaseId: null, runnerLeaseExpiresAt: null } }
    );
    if (freed.modifiedCount) logger.info('Released stale campaign leases from a previous process', { count: freed.modifiedCount });
  } catch (err) {
    logger.error('Could not release stale campaign leases', { err });
  }
  state.timer = setInterval(tick, TICK_MS);
  state.timer.unref?.();
  setTimeout(tick, 2000).unref?.();
  logger.info('Campaign scheduler started', { owner: OWNER });
}

export async function stopCampaignScheduler() {
  state.shuttingDown = true;
  if (state.timer) clearInterval(state.timer);
  for (const ctl of state.running.values()) ctl.wake?.();
}
