import { createHash, randomBytes } from 'crypto';
import Campaign from '@/models/Campaigns';
import ContactList from '@/models/ContactList';
import Media from '@/models/Media';
import MessageHistory, { DELIVERY_STATUSES, SENT_STATUSES } from '@/models/MessageHistory';
import { HttpError, badRequest, firstFile, intInRange, parseMultipart, readJsonBody, requireObjectId, str, withApi } from '@/lib/api';
import { cleanupTempFiles, MAX_MEDIA_BYTES, storeUpload } from '@/lib/media';
import { csvRow, startCsvDownload } from '@/lib/csv';
import { normalizePhone } from '@/lib/phone';
import { buildCampaignSummary, isRunningLocally, queueCampaignRun, runFilter, wakeCampaign } from '@/lib/campaignRunner';
import { DEFAULT_TIMEZONE, isValidDate, isValidTime, isValidTimeZone, parseZonedDateTime, resolveScheduledStart } from '@/lib/campaignTime';
import { clients, getProfileIds } from '@/lib/whatsappClients';

export const config = { api: { bodyParser: false, responseLimit: false } };

const MAX_MESSAGES = 4;
const MAX_TEXT = 4096;

function generateCampaignId() {
  return `campaign_${Date.now()}_${randomBytes(5).toString('hex')}`;
}

function parseJsonField(value, label) {
  try {
    return JSON.parse(str(value, { max: 100000 }) || 'null');
  } catch {
    throw badRequest(`Invalid ${label}`);
  }
}

function boolField(value, fallback) {
  const v = str(value, { max: 10 });
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return fallback;
}

async function countValidNumbers(listId, userId) {
  const list = await ContactList.findOne({ _id: listId, userId }).select('contacts').lean();
  if (!list) throw new HttpError(404, 'Contact list not found');
  const unique = new Set();
  for (const raw of list.contacts || []) {
    const n = normalizePhone(raw);
    if (n) unique.add(n);
  }
  return unique.size;
}

/** Validate a create/edit form. Uploads are stored only after validation. */
async function parseCampaignForm(fields, files, user, existing = null) {
  const out = {};

  const campaignName = str(fields.campaignName, { max: 120 });
  if (!campaignName) throw badRequest('Campaign name is required');
  out.campaignName = campaignName;

  const contactList = str(fields.contactList, { max: 24 });
  requireObjectId(contactList, 'contact list');
  out.contactList = contactList;
  out.totalNumbers = await countValidNumbers(contactList, user.id);
  if (!out.totalNumbers) throw badRequest('The selected contact list has no valid numbers');

  const selectedClients = parseJsonField(fields.selectedClients, 'profile selection');
  const profileIds = new Set(getProfileIds());
  if (!Array.isArray(selectedClients) || !selectedClients.length) throw badRequest('Select at least one WhatsApp profile');
  if (selectedClients.some((id) => !profileIds.has(id))) throw badRequest('Unknown WhatsApp profile selected');
  out.selectedClients = [...new Set(selectedClients)];

  const unit = str(fields.delayUnit, { max: 10 }) === 'seconds' ? 'seconds' : 'minutes';
  const bounds = unit === 'seconds' ? { min: 10, max: 86400 } : { min: 1, max: 1440 };
  const minDelay = intInRange(fields.minDelay, { ...bounds, fallback: unit === 'seconds' ? 30 : 5 });
  const maxDelay = intInRange(fields.maxDelay, { ...bounds, fallback: minDelay });
  if (maxDelay < minDelay) throw badRequest('Maximum delay must be greater than or equal to the minimum delay');
  out.delaySettings = { minDelay, maxDelay, unit };
  out.dailyLimit = intInRange(fields.dailyLimit, { min: 0, max: 100000, fallback: 0 });

  const timezone = str(fields.timezone, { max: 60 }) || DEFAULT_TIMEZONE;
  if (!isValidTimeZone(timezone)) throw badRequest('Invalid time zone');
  const windowEnabled = boolField(fields.windowEnabled, true);
  const windowStart = str(fields.windowStart, { max: 5 }) || '09:00';
  const windowEnd = str(fields.windowEnd, { max: 5 }) || '21:00';
  if (windowEnabled && (!isValidTime(windowStart) || !isValidTime(windowEnd))) throw badRequest('Sending hours must be in HH:MM format');

  const scheduleDate = str(fields.scheduleDate, { max: 10 });
  const scheduleTime = str(fields.scheduleTime, { max: 5 }) || '09:00';
  let startAt = null;
  if (scheduleDate) {
    if (!isValidDate(scheduleDate) || !isValidTime(scheduleTime)) throw badRequest('Invalid schedule date or time');
    startAt = parseZonedDateTime(scheduleDate, scheduleTime, timezone);
  }
  out.scheduling = {
    startAt,
    startDate: startAt ? new Date(`${scheduleDate}T00:00:00Z`) : null,
    windowEnabled,
    startTime: windowEnabled ? windowStart : null,
    endTime: windowEnabled ? windowEnd : null,
    timezone,
    pauseOnEndTime: true,
    resumeNextDay: true,
  };

  const messageSpecs = parseJsonField(fields.messages, 'messages');
  if (!Array.isArray(messageSpecs) || !messageSpecs.length) throw badRequest('Add at least one message');
  if (messageSpecs.length > MAX_MESSAGES) throw badRequest(`At most ${MAX_MESSAGES} message variations are allowed`);

  const messages = [];
  for (let i = 0; i < messageSpecs.length; i += 1) {
    const spec = messageSpecs[i] || {};
    const text = String(spec.text || '').trim();
    if (text.length > MAX_TEXT) throw badRequest(`Message ${i + 1} exceeds ${MAX_TEXT} characters`);
    const message = { text, hasMedia: false };

    if (spec.media === 'new') {
      const file = firstFile(files, `media${i}`);
      if (!file) throw badRequest(`Attachment for message ${i + 1} is missing`);
      message.pendingFile = file;
      message.hasMedia = true;
    } else if (spec.media === 'keep') {
      const source = existing?.messages?.[Number(spec.mediaFrom)];
      if (!source?.hasMedia) throw badRequest(`Message ${i + 1} refers to an attachment that no longer exists`);
      Object.assign(message, {
        hasMedia: true,
        mediaId: source.mediaId,
        mediaType: source.mediaType,
        mediaName: source.mediaName,
        mediaSize: source.mediaSize,
        legacyIndex: source.mediaId ? undefined : Number(spec.mediaFrom),
      });
    }

    if (!message.text && !message.hasMedia) throw badRequest(`Message ${i + 1} needs text or an attachment`);
    messages.push(message);
  }

  for (const message of messages) {
    if (message.pendingFile) {
      Object.assign(message, await storeUpload(message.pendingFile, user.id));
      delete message.pendingFile;
    }
  }
  out.messages = messages;
  return out;
}

/** Legacy campaigns embed base64 media; migrate kept attachments to Media. */
async function migrateLegacyMedia(messages, campaignId, userId) {
  if (!messages.some((m) => m.legacyIndex != null)) return messages;
  const legacy = await Campaign.findOne({ campaignId }).select('messages.mediaData').lean();
  for (const message of messages) {
    if (message.legacyIndex == null) continue;
    const data = legacy?.messages?.[message.legacyIndex]?.mediaData;
    if (data) {
      const buffer = Buffer.from(data, 'base64');
      const doc = await Media.create({
        userId, name: message.mediaName || 'attachment', mimeType: message.mediaType || 'application/octet-stream',
        size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), data: buffer,
      });
      message.mediaId = doc._id;
      message.mediaSize = buffer.length;
    } else {
      message.hasMedia = false;
    }
    delete message.legacyIndex;
  }
  return messages;
}

async function deleteUnreferencedMedia(mediaIds) {
  for (const id of new Set(mediaIds.filter(Boolean).map(String))) {
    if (!(await Campaign.exists({ 'messages.mediaId': id }))) await Media.deleteOne({ _id: id });
  }
}

function presentCampaign(campaign) {
  const startAt = resolveScheduledStart(campaign);
  const { messages = [], runnerLeaseId, runnerOwner, runnerLeaseExpiresAt, numberReports, ...rest } = campaign;
  return {
    ...rest,
    messages: messages.map(({ mediaData, ...m }) => ({ ...m, hasMedia: !!m.hasMedia })),
    scheduledStartAt: startAt,
    isActive: !!runnerLeaseId && runnerLeaseExpiresAt && new Date(runnerLeaseExpiresAt) > new Date(),
    runningHere: isRunningLocally(campaign.campaignId),
    clientNames: Object.fromEntries((campaign.selectedClients || []).map((id) => [id, clients[id]?.name || id])),
  };
}

async function campaignStats(campaign) {
  const match = { campaignId: campaign.campaignId, source: 'campaign', runNumber: runFilter(campaign.runNumber || 1) };
  const [byStatus, replied] = await Promise.all([
    MessageHistory.aggregate([{ $match: match }, { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } }]),
    MessageHistory.countDocuments({ ...match, repliedAt: { $ne: null } }),
  ]);
  const stats = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) stats[row._id] = row.count;
  stats.replied = replied;
  stats.sentTotal = SENT_STATUSES.reduce((sum, s) => sum + stats[s], 0);
  return stats;
}

async function loadOwned(campaignId, user, projection = '-messages.mediaData') {
  if (typeof campaignId !== 'string' || !campaignId || campaignId.length > 80) throw badRequest('campaignId is required');
  const campaign = await Campaign.findOne({ campaignId, userId: user.id }).select(projection);
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  return campaign;
}

async function exportCsv(res, campaign, type) {
  const runNumber = campaign.runNumber || 1;
  startCsvDownload(res, `${campaign.campaignName}_${type}.csv`);
  res.write(csvRow(['number', 'original_number', 'status', 'profile', 'message_variant', 'sent_at', 'delivered_at', 'read_at', 'replied_at', 'error']));

  const statusFilter = type === 'sent' ? { $in: SENT_STATUSES } : type === 'failed' ? { $in: ['failed', 'unknown'] } : undefined;
  const seen = new Set();
  if (type !== 'unsent') {
    const cursor = MessageHistory.find({
      campaignId: campaign.campaignId, source: 'campaign', runNumber: runFilter(runNumber),
      ...(statusFilter ? { deliveryStatus: statusFilter } : {}),
    }).sort({ sentTime: 1 }).lean().cursor();
    for await (const row of cursor) {
      seen.add(row.number);
      res.write(csvRow([row.number, row.originalNumber, row.deliveryStatus, clients[row.clientUsed]?.name || row.clientUsed, row.messageIndex != null ? row.messageIndex + 1 : '', row.sentTime, row.deliveredAt, row.readAt, row.repliedAt, row.error]));
    }
  }
  if (type === 'all' || type === 'unsent') {
    if (type === 'unsent') {
      const sent = await MessageHistory.distinct('number', { campaignId: campaign.campaignId, source: 'campaign', runNumber: runFilter(runNumber) });
      sent.forEach((n) => seen.add(n));
    }
    const list = await ContactList.findById(campaign.contactList).select('contacts').lean();
    for (const raw of list?.contacts || []) {
      const number = normalizePhone(raw);
      if (!number || seen.has(number)) continue;
      seen.add(number);
      res.write(csvRow([number, raw, 'not_sent', '', '', '', '', '', '', '']));
    }
  }
  res.end();
}

async function handleGet(req, res, user) {
  const { campaignId, action } = req.query;

  if (!campaignId) {
    const campaigns = await Campaign.find({ userId: user.id })
      .select('-messages.mediaData')
      .populate('contactList', 'name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({ success: true, campaigns: campaigns.map(presentCampaign) });
  }

  const campaign = (await loadOwned(campaignId, user)).toObject();

  if (action === 'exportCsv') {
    const type = ['all', 'sent', 'failed', 'unsent'].includes(req.query.type) ? req.query.type : 'all';
    return exportCsv(res, campaign, type);
  }

  if (action === 'messages') {
    const page = intInRange(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = intInRange(req.query.limit, { min: 5, max: 100, fallback: 25 });
    const filter = { campaignId, source: 'campaign', runNumber: runFilter(campaign.runNumber || 1) };
    if (DELIVERY_STATUSES.includes(req.query.status)) filter.deliveryStatus = req.query.status;
    if (req.query.status === 'replied') filter.repliedAt = { $ne: null };
    const [total, messages] = await Promise.all([
      MessageHistory.countDocuments(filter),
      MessageHistory.find(filter).sort({ sentTime: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return res.status(200).json({ success: true, messages, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }

  await Campaign.populate(campaign, { path: 'contactList', select: 'name' });
  const [stats, review] = await Promise.all([
    campaignStats(campaign),
    campaign.status === 'needs_review' && campaign.review?.historyId ? MessageHistory.findById(campaign.review.historyId).lean() : null,
  ]);
  return res.status(200).json({ success: true, campaign: presentCampaign(campaign), stats, reviewMessage: review });
}

async function handleCreate(req, res, user, logger) {
  const { fields, files } = await parseMultipart(req, { maxFileSize: MAX_MEDIA_BYTES, maxFiles: MAX_MESSAGES });
  try {
    const input = await parseCampaignForm(fields, files, user);
    const { totalNumbers } = input;

    const draft = boolField(fields.saveAsDraft, false);
    const startAt = input.scheduling.startAt;
    const status = draft ? 'draft' : startAt && startAt > new Date() ? 'scheduled' : 'pending';
    const campaignId = generateCampaignId();

    await Campaign.create({ ...input, campaignId, userId: user.id, status, totalNumbers });
    if (status === 'pending') queueCampaignRun(campaignId, 'created');
    logger.info('Campaign created', { campaignId, status, totalNumbers });
    return res.status(201).json({ success: true, campaignId, status, totalNumbers });
  } finally {
    await cleanupTempFiles(files);
  }
}

async function handleEdit(req, res, user, logger) {
  const campaign = await loadOwned(req.query.campaignId, user, '');
  const { fields, files } = await parseMultipart(req, { maxFileSize: MAX_MEDIA_BYTES, maxFiles: MAX_MESSAGES });
  try {
    const input = await parseCampaignForm(fields, files, user, campaign.toObject());
    if (String(input.contactList) !== String(campaign.contactList) && campaign.processedNumbers > 0) {
      throw new HttpError(409, 'This campaign has already sent messages. Duplicate it to target a different contact list.');
    }
    input.messages = await migrateLegacyMedia(input.messages, campaign.campaignId, user.id);
    const previousMedia = campaign.messages.map((m) => m.mediaId);

    const update = { ...input };
    if (campaign.status === 'scheduled' && (!input.scheduling.startAt || input.scheduling.startAt <= new Date())) update.status = 'pending';
    if (['pending', 'draft', 'stopped'].includes(campaign.status) && input.scheduling.startAt > new Date()) update.status = 'scheduled';

    // Replace messages wholesale; also drops any legacy embedded base64.
    await Campaign.updateOne({ _id: campaign._id }, { $set: update });
    await deleteUnreferencedMedia(previousMedia);

    const status = update.status || campaign.status;
    if (status === 'pending' || status === 'running') queueCampaignRun(campaign.campaignId, 'edited');
    wakeCampaign(campaign.campaignId);
    logger.info('Campaign updated', { campaignId: campaign.campaignId });
    return res.status(200).json({ success: true, status });
  } finally {
    await cleanupTempFiles(files);
  }
}

async function setStatus(campaign, fromStatuses, set, errorMsg) {
  const result = await Campaign.updateOne({ _id: campaign._id, status: { $in: fromStatuses } }, set);
  if (!result.matchedCount) throw new HttpError(409, errorMsg || `Cannot do that while the campaign is ${campaign.status}`);
}

async function handlePatch(req, res, user, logger) {
  const body = await readJsonBody(req);
  const campaign = await loadOwned(req.query.campaignId, user);
  const { campaignId } = campaign;
  const action = body.action;
  let message = 'Campaign updated';

  switch (action) {
    case 'pause':
      await setStatus(campaign, ['running', 'pending', 'paused'], { $set: { status: 'paused', pauseReason: 'manual', lastPausedAt: new Date(), nextResumeAt: null, lastError: null } });
      message = 'Campaign paused';
      break;

    case 'resume':
    case 'start':
      await setStatus(campaign, ['paused', 'stopped', 'error', 'scheduled', 'draft'], { $set: { status: 'pending', pauseReason: null, nextResumeAt: null, lastError: null } },
        campaign.status === 'needs_review' ? 'Resolve the review item first' : campaign.status === 'completed' ? 'Campaign is complete. Use Run again.' : undefined);
      queueCampaignRun(campaignId, 'resume');
      message = 'Campaign started';
      break;

    case 'stop':
      await setStatus(campaign, ['running', 'pending', 'paused', 'scheduled', 'needs_review', 'error', 'draft'], { $set: { status: 'stopped', endTime: new Date(), nextResumeAt: null, lastError: null } });
      message = 'Campaign stopped';
      break;

    case 'rerun':
      // Clearing the lease detaches any live runner so its late updates
      // cannot touch the new run's counters.
      await Campaign.updateOne({ _id: campaign._id }, {
        $set: {
          status: 'pending', startTime: null, endTime: null, lastPausedAt: null, nextResumeAt: null, pauseReason: null,
          currentIndex: 0, processedNumbers: 0, successCount: 0, failedCount: 0, skippedCount: 0, dailyCount: 0,
          lastError: null, runnerLeaseId: null, runnerLeaseExpiresAt: null,
          summary: { totalProcessed: 0, successRate: 0, averageDeliveryTime: 0, messagesDistribution: [] },
        },
        $inc: { runNumber: 1 },
        $unset: { numberReports: '', review: '' },
      });
      wakeCampaign(campaignId);
      queueCampaignRun(campaignId, 'rerun');
      message = 'Campaign restarted from the beginning';
      break;

    case 'reschedule': {
      const date = str(body.date, { max: 10 });
      const time = str(body.time, { max: 5 });
      if (!isValidDate(date) || !isValidTime(time)) throw badRequest('Enter a valid date and time');
      const startAt = parseZonedDateTime(date, time, campaign.scheduling?.timezone || DEFAULT_TIMEZONE);
      const status = startAt > new Date() ? 'scheduled' : 'pending';
      await setStatus(campaign, ['scheduled', 'pending', 'paused', 'stopped', 'error', 'draft'], {
        $set: { status, 'scheduling.startAt': startAt, 'scheduling.startDate': new Date(`${date}T00:00:00Z`), nextResumeAt: null, pauseReason: null },
      });
      if (status === 'pending') queueCampaignRun(campaignId, 'reschedule');
      message = status === 'scheduled' ? 'Campaign rescheduled' : 'Scheduled time has passed; campaign started';
      break;
    }

    case 'resolve': {
      if (campaign.status !== 'needs_review') throw new HttpError(409, 'Nothing to review');
      const mode = body.mode;
      const historyId = campaign.review?.historyId;
      if (mode === 'mark_sent') {
        if (historyId) await MessageHistory.updateOne({ _id: historyId, deliveryStatus: { $in: ['pending', 'unknown'] } }, { $set: { deliveryStatus: 'sent', error: 'Marked as sent after review' } });
        await setStatus(campaign, ['needs_review'], { $set: { status: 'pending', lastError: null }, $unset: { review: '' } });
      } else if (mode === 'resend') {
        if (historyId) await MessageHistory.updateOne({ _id: historyId }, { $set: { deliveryStatus: 'failed', error: 'Outcome uncertain; resent after review' } });
        await setStatus(campaign, ['needs_review'], { $set: { status: 'pending', lastError: null }, $unset: { review: '' } });
      } else if (mode === 'skip') {
        if (historyId) await MessageHistory.updateOne({ _id: historyId }, { $set: { deliveryStatus: 'failed', error: 'Outcome uncertain; skipped after review' } });
        await setStatus(campaign, ['needs_review'], {
          $set: { status: 'pending', lastError: null },
          $unset: { review: '' },
          $inc: { currentIndex: 1, processedNumbers: 1, failedCount: 1 },
        });
      } else {
        throw badRequest('Choose mark_sent, resend or skip');
      }
      queueCampaignRun(campaignId, 'review_resolved');
      message = 'Review resolved; campaign continuing';
      break;
    }

    case 'duplicate': {
      const source = await Campaign.findById(campaign._id).lean();
      const messages = await migrateLegacyMedia(
        source.messages.map(({ mediaData, ...m }, i) => ({ ...m, legacyIndex: m.hasMedia && !m.mediaId ? i : undefined })),
        campaignId, user.id
      );
      const copyId = generateCampaignId();
      await Campaign.create({
        campaignId: copyId,
        campaignName: `${source.campaignName} (copy)`.slice(0, 120),
        userId: user.id,
        contactList: source.contactList,
        messages,
        scheduling: { ...source.scheduling, startAt: null, startDate: null },
        selectedClients: source.selectedClients,
        delaySettings: source.delaySettings,
        dailyLimit: source.dailyLimit || 0,
        totalNumbers: source.totalNumbers,
        status: 'draft',
      });
      logger.info('Campaign duplicated', { from: campaignId, to: copyId });
      return res.status(201).json({ success: true, msg: 'Campaign duplicated as a draft', campaignId: copyId });
    }

    default:
      throw badRequest('Unknown action');
  }

  wakeCampaign(campaignId);
  logger.info('Campaign action', { campaignId, action });
  return res.status(200).json({ success: true, msg: message });
}

async function handleDelete(req, res, user, logger) {
  const campaign = await loadOwned(req.query.campaignId, user);
  const deleteHistory = req.query.deleteHistory === '1';
  await Campaign.deleteOne({ _id: campaign._id });
  wakeCampaign(campaign.campaignId);
  if (deleteHistory) await MessageHistory.deleteMany({ campaignId: campaign.campaignId, source: 'campaign' });
  await deleteUnreferencedMedia(campaign.messages.map((m) => m.mediaId));
  logger.info('Campaign deleted', { campaignId: campaign.campaignId, deleteHistory });
  return res.status(200).json({ success: true, msg: 'Campaign deleted' });
}

export default withApi(async (req, res, { user, logger }) => {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user);
    case 'POST':
      return handleCreate(req, res, user, logger);
    case 'PUT':
      return handleEdit(req, res, user, logger);
    case 'PATCH':
      return handlePatch(req, res, user, logger);
    case 'DELETE':
      return handleDelete(req, res, user, logger);
    default:
      throw new HttpError(405, 'Method not allowed');
  }
}, { methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], name: 'campaigns' });
