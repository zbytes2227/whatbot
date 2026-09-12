import Campaign from '@/models/Campaigns';
import ContactList from '@/models/ContactList';
import { clients, sendWhatsAppMessage } from '@/lib/whatsappClients';
import { verifyAuth } from '@/lib/auth';
import formidable from 'formidable';
import fs from 'fs';
import connectToMongoDB from '@/lib/mongodb';
import MessageHistory from '@/models/MessageHistory';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ module: 'api.campaigns' });

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const SCHEDULER_KEY = '__whatmot_campaign_scheduler';
const RUNNING_KEY = '__whatmot_campaign_running_set';
const TICK_KEY = '__whatmot_campaign_scheduler_tick_active';

if (!global[SCHEDULER_KEY]) {
  global[SCHEDULER_KEY] = { started: false, timer: null };
}
if (!global[RUNNING_KEY]) {
  global[RUNNING_KEY] = new Set();
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: true,
      maxFileSize: 10 * 1024 * 1024,
    });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function getFieldValue(field) {
  if (Array.isArray(field)) return field[0] || '';
  return field || '';
}

function formatIndianNumber(number) {
  const cleaned = String(number).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith('0') && cleaned.length === 11) return `91${cleaned.substring(1)}`;
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
}

function generateCampaignId() {
  return `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function isWithinSendingHours(scheduling) {
  if (!scheduling?.startTime || !scheduling?.endTime) return true;
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  return currentTime >= scheduling.startTime && currentTime <= scheduling.endTime;
}

function getNextResumeTime(scheduling) {
  if (!scheduling?.resumeNextDay) return null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [hours, minutes] = (scheduling.startTime || '07:00').split(':');
  tomorrow.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return tomorrow;
}

function getCampaignScheduledDateTime(campaign) {
  if (!campaign?.scheduling?.startDate || !campaign?.scheduling?.startTime) return null;
  const dateObj = new Date(campaign.scheduling.startDate);
  if (Number.isNaN(dateObj.getTime())) return null;
  const dateStr = dateObj.toISOString().slice(0, 10);
  return new Date(`${dateStr}T${campaign.scheduling.startTime}:00+05:30`);
}

function getScheduledTime(campaign) {
  const scheduledDateTime = getCampaignScheduledDateTime(campaign);
  if (!scheduledDateTime) return null;

  return {
    dateTime: scheduledDateTime,
    formatted: scheduledDateTime.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    isUpcoming: scheduledDateTime > new Date(),
    isPast: scheduledDateTime < new Date(),
  };
}

function toCsv(rows) {
  const escapeCell = (value) => {
    const str = value == null ? '' : String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return rows.map((row) => row.map(escapeCell).join(',')).join('\n');
}

function getDelayMs(delaySettings = {}) {
  const minDelay = Math.max(1, Number(delaySettings.minDelay || 5));
  const maxDelay = Math.max(minDelay, Number(delaySettings.maxDelay || 25));
  const delayMinutes = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
  return delayMinutes * 60 * 1000;
}

async function buildFormattedNumbers(campaign) {
  const contactList = await ContactList.findById(campaign.contactList).lean();
  if (!contactList) return [];

  return (contactList.contacts || [])
    .map((number) => ({ original: number, formatted: formatIndianNumber(number) }))
    .filter((pair) => pair.formatted.length >= 10);
}

function getReadyCampaignClientIds(selectedClients = []) {
  return selectedClients.filter((clientId) => {
    const clientObj = clients[clientId];
    return clientObj && clientObj.ready && clientObj.client;
  });
}

async function queueCampaignRun(campaignId, trigger = 'manual') {
  const runningSet = global[RUNNING_KEY];
  if (runningSet.has(campaignId)) {
    return false;
  }

  runningSet.add(campaignId);
  logger.info('Queueing campaign run', { campaignId, trigger });

  setImmediate(async () => {
    try {
      await runCampaign(campaignId, trigger);
    } catch (err) {
      logger.error('Campaign run crashed', { campaignId, trigger, err });
      await Campaign.findOneAndUpdate({ campaignId }, { status: 'error' }).catch(() => {});
    } finally {
      runningSet.delete(campaignId);
    }
  });

  return true;
}

async function ensureSchedulerRunning() {
  const scheduler = global[SCHEDULER_KEY];
  if (scheduler.started) return;

  scheduler.started = true;
  scheduler.timer = setInterval(async () => {
    if (global[TICK_KEY]) return;
    global[TICK_KEY] = true;
    try {
      await connectToMongoDB();
      const now = new Date();

      const dueScheduled = await Campaign.find({ status: 'scheduled' }).lean();
      for (const campaign of dueScheduled) {
        const startAt = getCampaignScheduledDateTime(campaign);
        if (startAt && startAt <= now) {
          await Campaign.updateOne({ campaignId: campaign.campaignId, status: 'scheduled' }, { status: 'pending' });
          await queueCampaignRun(campaign.campaignId, 'scheduler_scheduled_start');
        }
      }

      const dueResume = await Campaign.find({
        status: 'paused',
        nextResumeAt: { $ne: null, $lte: now },
      }).lean();

      for (const campaign of dueResume) {
        await Campaign.updateOne(
          { campaignId: campaign.campaignId, status: 'paused' },
          { status: 'running', nextResumeAt: null }
        );
        await queueCampaignRun(campaign.campaignId, 'scheduler_resume');
      }

      const pending = await Campaign.find({ status: 'pending' }).select('campaignId').lean();
      for (const campaign of pending) {
        await queueCampaignRun(campaign.campaignId, 'scheduler_pending');
      }
    } catch (err) {
      logger.error('Campaign scheduler tick failed', { err });
    } finally {
      global[TICK_KEY] = false;
    }
  }, 30000);
  scheduler.timer.unref?.();

  logger.info('Campaign scheduler started');
}

async function runCampaign(campaignId, trigger = 'manual') {
  logger.info('Starting campaign runner', { campaignId, trigger });
  let iteration = 0;
  while (iteration < 5000) {
    iteration += 1;
    const campaign = await Campaign.findOne({ campaignId });
    if (!campaign) {
      logger.warn('Campaign not found during run', { campaignId });
      return;
    }

    if (!['pending', 'running'].includes(campaign.status)) {
      logger.info('Campaign status no longer runnable, stopping runner', { campaignId, status: campaign.status });
      return;
    }

    const numbers = await buildFormattedNumbers(campaign);
    if (!numbers.length) {
      campaign.status = 'error';
      await campaign.save();
      logger.error('Campaign has no valid numbers', { campaignId });
      return;
    }

    if (campaign.totalNumbers !== numbers.length) {
      campaign.totalNumbers = numbers.length;
      if (campaign.currentIndex > numbers.length) {
        campaign.currentIndex = numbers.length;
      }
      await campaign.save();
    }

    const clientIds = getReadyCampaignClientIds(campaign.selectedClients || []);
    if (!clientIds.length) {
      logger.warn('No ready clients available for campaign', { campaignId });
      campaign.status = 'paused';
      campaign.lastPausedAt = new Date();
      campaign.nextResumeAt = new Date(Date.now() + 5 * 60 * 1000);
      await campaign.save();
      return;
    }

    if (!isWithinSendingHours(campaign.scheduling)) {
      campaign.status = 'paused';
      campaign.lastPausedAt = new Date();
      campaign.nextResumeAt = getNextResumeTime(campaign.scheduling);
      await campaign.save();
      logger.info('Campaign paused due to sending hours window', { campaignId, nextResumeAt: campaign.nextResumeAt });
      return;
    }

    if (campaign.currentIndex >= numbers.length) {
      campaign.status = 'completed';
      campaign.endTime = new Date();

      const totalProcessed = campaign.successCount + campaign.failedCount;
      const successRecords = campaign.numberReports.filter((report) => report.status === 'success');
      const averageDeliveryTime = successRecords.length
        ? successRecords.reduce((sum, report) => sum + (report.deliveryTime || 0), 0) / successRecords.length
        : 0;

      campaign.summary = {
        totalProcessed,
        successRate: totalProcessed ? (campaign.successCount / totalProcessed) * 100 : 0,
        averageDeliveryTime,
        messagesDistribution: campaign.messages.map((_, index) => ({
          messageIndex: index,
          sentCount: campaign.numberReports.filter(
            (report) => report.messageIndex === index && report.status === 'success'
          ).length,
        })),
      };

      await campaign.save();
      logger.info('Campaign completed', { campaignId, totalProcessed });
      return;
    }

    campaign.status = 'running';
    campaign.startTime = campaign.startTime || new Date();
    await campaign.save();

    const item = numbers[campaign.currentIndex];
    const selectedClientId = clientIds[Math.floor(Math.random() * clientIds.length)];
    const client = clients[selectedClientId]?.client;
    if (!client) {
      campaign.currentIndex += 1;
      campaign.failedCount += 1;
      campaign.processedNumbers += 1;
      campaign.numberReports.push({
        number: item.formatted,
        originalNumber: item.original,
        messageIndex: 0,
        messageText: '',
        status: 'failed',
        client: selectedClientId,
        timestamp: new Date(),
        deliveryTime: 0,
        errorMessage: 'Client unavailable',
        attemptNumber: 1,
      });
      await campaign.save();
      continue;
    }

    const messageIndex = Math.floor(Math.random() * campaign.messages.length);
    const selectedMessage = campaign.messages[messageIndex];
    const attemptStart = Date.now();

    const messageHistory = new MessageHistory({
      campaignId,
      number: item.formatted,
      originalNumber: item.original,
      message: selectedMessage.text,
      deliveryStatus: 'pending',
      source: 'campaign',
      clientUsed: selectedClientId,
      hasMedia: selectedMessage.hasMedia,
      mediaType: selectedMessage.mediaType,
      mediaName: selectedMessage.mediaName,
      sentTime: new Date(),
    });

    await messageHistory.save();

    try {
      const chatId = `${item.formatted}@c.us`;
      const media = selectedMessage.hasMedia && selectedMessage.mediaData
        ? { data: selectedMessage.mediaData, type: selectedMessage.mediaType, name: selectedMessage.mediaName }
        : null;
      const { deliveryTime: measuredDeliveryTime } = await sendWhatsAppMessage({
        clientId: selectedClientId,
        chatId,
        text: selectedMessage.text,
        media,
        options: media && selectedMessage.text.trim() ? { caption: selectedMessage.text } : {},
      });

      const deliveryTime = measuredDeliveryTime || (Date.now() - attemptStart);
      campaign.successCount += 1;
      campaign.processedNumbers += 1;
      campaign.currentIndex += 1;
      campaign.numberReports.push({
        number: item.formatted,
        originalNumber: item.original,
        messageIndex,
        messageText: selectedMessage.text,
        status: 'success',
        client: selectedClientId,
        timestamp: new Date(),
        deliveryTime,
        attemptNumber: 1,
      });

      messageHistory.deliveryStatus = 'delivered';
      messageHistory.deliveryTime = deliveryTime;
      await messageHistory.save();
      await campaign.save();
    } catch (err) {
      const deliveryTime = Date.now() - attemptStart;
      campaign.failedCount += 1;
      campaign.processedNumbers += 1;
      campaign.currentIndex += 1;
      campaign.numberReports.push({
        number: item.formatted,
        originalNumber: item.original,
        messageIndex,
        messageText: selectedMessage.text,
        status: 'failed',
        client: selectedClientId,
        timestamp: new Date(),
        deliveryTime,
        errorMessage: err.message,
        attemptNumber: 1,
      });

      messageHistory.deliveryStatus = 'failed';
      messageHistory.deliveryTime = deliveryTime;
      messageHistory.error = err.message;
      await messageHistory.save();
      await campaign.save();

      logger.error('Campaign message send failed', {
        campaignId,
        number: item.formatted,
        clientId: selectedClientId,
        err,
      });
    }

    const delayMs = getDelayMs(campaign.delaySettings);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  logger.warn('Campaign runner stopped after iteration cap', { campaignId, trigger, iteration });
}

async function buildCampaignCsv(campaign, type = 'all') {
  const formattedNumbers = await buildFormattedNumbers(campaign);
  const reportByNumber = new Map();

  for (const report of campaign.numberReports || []) {
    const key = String(report.number);
    if (!reportByNumber.has(key)) {
      reportByNumber.set(key, report);
    }
  }

  const sentRows = [];
  const unsentRows = [];

  for (const pair of formattedNumbers) {
    const report = reportByNumber.get(pair.formatted);
    if (report) {
      sentRows.push([
        pair.formatted,
        pair.original,
        report.status,
        report.client || '',
        report.messageIndex != null ? report.messageIndex + 1 : '',
        report.timestamp ? new Date(report.timestamp).toISOString() : '',
        report.errorMessage || '',
      ]);
    } else {
      unsentRows.push([
        pair.formatted,
        pair.original,
        'not_sent',
        '',
        '',
        '',
        '',
      ]);
    }
  }

  const header = [['formatted_number', 'original_number', 'status', 'client', 'message_variant', 'timestamp', 'error']];

  if (type === 'sent') return toCsv([...header, ...sentRows]);
  if (type === 'unsent') return toCsv([...header, ...unsentRows]);
  return toCsv([...header, ...sentRows, ...unsentRows]);
}

export default async function handler(req, res) {
  res.setTimeout(120000);

  try {
    await connectToMongoDB();
    await ensureSchedulerRunning();
  } catch (error) {
    logger.error('MongoDB connection failed', { err: error });
    return res.status(500).json({ success: false, msg: 'Database connection failed' });
  }

  let user;
  try {
    const auth = await verifyAuth(req);
    user = auth.user;
  } catch (err) {
    return res.status(err.status || 401).json({ success: false, msg: err.msg || 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { campaignId, action, type } = req.query;

      if (campaignId && action === 'exportCsv') {
        const campaign = await Campaign.findOne({ campaignId, userId: user.id }).lean();
        if (!campaign) {
          return res.status(404).json({ success: false, msg: 'Campaign not found' });
        }

        const csv = await buildCampaignCsv(campaign, String(type || 'all'));
        const fileType = String(type || 'all');
        const fileName = `${campaignId}_${fileType}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.status(200).send(csv);
      }

      if (campaignId) {
        const campaign = await Campaign.findOne({ campaignId, userId: user.id })
          .populate('contactList', 'name contacts')
          .lean();

        if (!campaign) {
          return res.status(404).json({ success: false, msg: 'Campaign not found' });
        }

        const scheduledTime = getScheduledTime(campaign);
        const messageHistory = await MessageHistory.find({
          source: 'campaign',
          campaignId,
        })
          .sort({ sentTime: -1 })
          .limit(150)
          .lean();

        return res.status(200).json({
          success: true,
          campaign: {
            ...campaign,
            scheduledTime,
            recentMessages: messageHistory,
          },
        });
      }

      const campaigns = await Campaign.find({ userId: user.id })
        .select('-messages.mediaData -numberReports')
        .populate('contactList', 'name')
        .sort({ createdAt: -1 })
        .lean();

      const campaignsWithScheduleInfo = campaigns.map((campaign) => ({
        ...campaign,
        scheduledTime: getScheduledTime(campaign),
      }));

      return res.status(200).json({ success: true, campaigns: campaignsWithScheduleInfo });
    }

    if (req.method === 'POST') {
      const { fields, files } = await Promise.race([
        parseForm(req),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Form parsing timeout')), 30000)),
      ]);

      const campaignName = getFieldValue(fields.campaignName).trim();
      const contactListId = getFieldValue(fields.contactList);
      const selectedClientsRaw = getFieldValue(fields.selectedClients) || '[]';
      const minDelayRaw = getFieldValue(fields.minDelay) || '5';
      const maxDelayRaw = getFieldValue(fields.maxDelay) || '25';
      const startDate = getFieldValue(fields.startDate);
      const startTime = getFieldValue(fields.startTime) || '07:00';
      const endTime = getFieldValue(fields.endTime) || '21:00';
      const action = getFieldValue(fields.action) || req.query.action;
      const targetCampaignId = getFieldValue(fields.campaignId) || req.query.campaignId;

      const messages = [];
      // Edit requests use the existing campaign messages as their source of
      // truth. Do not read/delete upload temp files in the create path first;
      // the edit path below must be the only consumer of those files.
      if (!(action === 'edit' && targetCampaignId)) for (let i = 1; i <= 4; i++) {
        const messageText = getFieldValue(fields[`message${i}`]);
        if (!messageText || !messageText.trim()) continue;

        const messageObj = {
          text: messageText.trim(),
          hasMedia: false,
          mediaType: null,
          mediaName: null,
          mediaData: null,
        };

        const mediaFile = files[`media${i}`];
        if (mediaFile) {
          try {
            const fileObj = Array.isArray(mediaFile) ? mediaFile[0] : mediaFile;
            const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/jpg'];
            if (allowedMimes.includes(fileObj.mimetype) && fileObj.size < 10 * 1024 * 1024) {
              const mediaBuffer = fs.readFileSync(fileObj.filepath);
              messageObj.hasMedia = true;
              messageObj.mediaType = fileObj.mimetype;
              messageObj.mediaName = fileObj.originalFilename;
              messageObj.mediaData = mediaBuffer.toString('base64');
            }

            try {
              fs.unlinkSync(fileObj.filepath);
            } catch {
              // ignore cleanup failure
            }
          } catch (fileError) {
            logger.warn('Error processing media file', { index: i, err: fileError });
          }
        }

        messages.push(messageObj);
      }

      let selectedClients = [];
      try {
        selectedClients = JSON.parse(selectedClientsRaw);
      } catch {
        return res.status(400).json({ success: false, msg: 'Invalid client selection data' });
      }

      const minDelay = parseInt(minDelayRaw, 10) || 5;
      const maxDelay = parseInt(maxDelayRaw, 10) || 25;

      if (action === 'edit' && targetCampaignId) {
        const campaign = await Campaign.findOne({ campaignId: targetCampaignId, userId: user.id });
        if (!campaign) {
          return res.status(404).json({ success: false, msg: 'Campaign not found' });
        }

        if (campaignName) {
          campaign.campaignName = campaignName;
        }

        if (contactListId && String(contactListId) !== String(campaign.contactList)) {
          const contactList = await ContactList.findOne({ _id: contactListId, userId: user.id }).lean();
          if (contactList) {
            campaign.contactList = contactListId;
            const updatedNumbers = (contactList.contacts || [])
              .map((num) => ({ original: num, formatted: formatIndianNumber(num) }))
              .filter((pair) => pair.formatted.length >= 10);
            campaign.totalNumbers = updatedNumbers.length;
            if (campaign.currentIndex > campaign.totalNumbers) {
              campaign.currentIndex = campaign.totalNumbers;
            }
          }
        }

        const updatedMessages = [];
        for (let i = 1; i <= 4; i++) {
          const messageText = getFieldValue(fields[`message${i}`]);
          if (!messageText || !messageText.trim()) continue;

          const existingMsg = campaign.messages && campaign.messages[i - 1];
          const removeMedia = getFieldValue(fields[`removeMedia${i}`]) === 'true';
          const mediaFile = files[`media${i}`];

          let messageObj = {
            text: messageText.trim(),
            hasMedia: existingMsg ? !!existingMsg.hasMedia : false,
            mediaType: existingMsg ? existingMsg.mediaType || null : null,
            mediaName: existingMsg ? existingMsg.mediaName || null : null,
            mediaData: existingMsg ? existingMsg.mediaData || null : null,
          };

          if (removeMedia) {
            messageObj.hasMedia = false;
            messageObj.mediaType = null;
            messageObj.mediaName = null;
            messageObj.mediaData = null;
          }

          if (mediaFile) {
            try {
              const fileObj = Array.isArray(mediaFile) ? mediaFile[0] : mediaFile;
              const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/jpg'];
              if (allowedMimes.includes(fileObj.mimetype) && fileObj.size < 10 * 1024 * 1024) {
                const mediaBuffer = fs.readFileSync(fileObj.filepath);
                messageObj.hasMedia = true;
                messageObj.mediaType = fileObj.mimetype;
                messageObj.mediaName = fileObj.originalFilename;
                messageObj.mediaData = mediaBuffer.toString('base64');
              }
              try { fs.unlinkSync(fileObj.filepath); } catch {}
            } catch (err) {
              logger.warn('Error processing updated media file', { index: i, err });
            }
          }

          updatedMessages.push(messageObj);
        }

        if (updatedMessages.length) {
          campaign.messages = updatedMessages;
        }

        if (Array.isArray(selectedClients) && selectedClients.length) {
          const readyClients = getReadyCampaignClientIds(selectedClients);
          if (readyClients.length) {
            campaign.selectedClients = readyClients;
          }
        }

        campaign.delaySettings = {
          minDelay: Math.max(1, minDelay),
          maxDelay: Math.max(Math.max(1, minDelay), maxDelay),
        };

        campaign.scheduling = {
          ...campaign.scheduling,
          startDate: startDate ? new Date(startDate) : campaign.scheduling?.startDate,
          startTime: startTime || campaign.scheduling?.startTime,
          endTime: endTime || campaign.scheduling?.endTime,
        };

        await campaign.save();

        if (campaign.status === 'pending' || campaign.status === 'running') {
          await queueCampaignRun(targetCampaignId, 'edited_resume');
        }

        return res.status(200).json({ success: true, msg: 'Campaign updated successfully', campaign });
      }

      if (!campaignName) {
        return res.status(400).json({ success: false, msg: 'Campaign name is required' });
      }
      if (!contactListId) {
        return res.status(400).json({ success: false, msg: 'Contact list selection is required' });
      }
      if (!messages.length) {
        return res.status(400).json({ success: false, msg: 'At least one message is required' });
      }
      if (!Array.isArray(selectedClients) || !selectedClients.length) {
        return res.status(400).json({ success: false, msg: 'At least one WhatsApp client must be selected' });
      }

      const contactList = await ContactList.findOne({ _id: contactListId, userId: user.id }).lean();
      if (!contactList) {
        return res.status(404).json({ success: false, msg: 'Contact list not found' });
      }

      const formattedNumbers = (contactList.contacts || [])
        .map((number) => ({ original: number, formatted: formatIndianNumber(number) }))
        .filter((pair) => pair.formatted.length >= 10);

      if (!formattedNumbers.length) {
        return res.status(400).json({ success: false, msg: 'No valid phone numbers in contact list' });
      }

      const readyClients = getReadyCampaignClientIds(selectedClients);
      if (!readyClients.length) {
        return res.status(400).json({ success: false, msg: 'No selected clients are ready for messaging' });
      }

      const campaignId = generateCampaignId();
      const scheduledStartTime = startDate ? new Date(`${startDate}T${startTime}:00+05:30`) : new Date();
      const status = startDate && scheduledStartTime > new Date() ? 'scheduled' : 'pending';

      const newCampaign = new Campaign({
        campaignId,
        campaignName,
        userId: user.id,
        contactList: contactListId,
        messages,
        selectedClients: readyClients,
        delaySettings: { minDelay, maxDelay },
        scheduling: {
          startDate: startDate ? new Date(startDate) : null,
          startTime,
          endTime,
          pauseOnEndTime: true,
          resumeNextDay: true,
        },
        status,
        totalNumbers: formattedNumbers.length,
        processedNumbers: 0,
        successCount: 0,
        failedCount: 0,
        currentIndex: 0,
        numberReports: [],
      });

      await newCampaign.save();

      if (status === 'pending') {
        await queueCampaignRun(campaignId, 'created_pending');
      }

      return res.status(201).json({
        success: true,
        msg: 'Campaign created successfully',
        campaignId,
        totalNumbers: formattedNumbers.length,
        messagesCount: messages.length,
        activeClients: readyClients.length,
        status,
      });
    }

    if (req.method === 'PATCH') {
      const { campaignId } = req.query;
      const parsedBody = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            resolve(JSON.parse(body || '{}'));
          } catch (err) {
            reject(err);
          }
        });
      }).catch(() => null);

      if (!campaignId) {
        return res.status(400).json({ success: false, msg: 'campaignId required' });
      }
      if (!parsedBody) {
        return res.status(400).json({ success: false, msg: 'Invalid JSON in request body' });
      }

      const { action } = parsedBody;
      if (!action) {
        return res.status(400).json({ success: false, msg: 'action field required in request body' });
      }

      const campaign = await Campaign.findOne({ campaignId, userId: user.id });
      if (!campaign) {
        return res.status(404).json({ success: false, msg: 'Campaign not found' });
      }

      if (action === 'edit') {
        const {
          campaignName,
          contactList,
          messages,
          delaySettings,
          scheduling,
          selectedClients,
          status,
        } = parsedBody;

        if (campaignName && String(campaignName).trim()) {
          campaign.campaignName = String(campaignName).trim();
        }

        if (contactList && String(contactList) !== String(campaign.contactList)) {
          const nextContactList = await ContactList.findOne({ _id: contactList, userId: user.id }).lean();
          if (!nextContactList) {
            return res.status(400).json({ success: false, msg: 'Invalid contact list for this user' });
          }

          campaign.contactList = contactList;
          const updatedNumbers = (nextContactList.contacts || [])
            .map((num) => ({ original: num, formatted: formatIndianNumber(num) }))
            .filter((pair) => pair.formatted.length >= 10);
          campaign.totalNumbers = updatedNumbers.length;

          if (campaign.currentIndex > campaign.totalNumbers) {
            campaign.currentIndex = campaign.totalNumbers;
          }
        }

        if (messages && Array.isArray(messages) && messages.length) {
          const updatedMessages = messages
            .filter((item) => (typeof item === 'string' ? item.trim() : item?.text?.trim()))
            .slice(0, 4)
            .map((item, idx) => {
              const newText = typeof item === 'string' ? item.trim() : String(item.text).trim();
              const existingMsg = campaign.messages && campaign.messages[idx];

              // If new media was explicitly passed or media was explicitly removed:
              if (typeof item === 'object' && item.mediaData !== undefined) {
                return {
                  text: newText,
                  hasMedia: !!item.hasMedia,
                  mediaType: item.mediaType || null,
                  mediaName: item.mediaName || null,
                  mediaData: item.mediaData || null,
                };
              }

              // Otherwise preserve existing message's media attachments
              return {
                text: newText,
                hasMedia: existingMsg ? !!existingMsg.hasMedia : false,
                mediaType: existingMsg ? existingMsg.mediaType || null : null,
                mediaName: existingMsg ? existingMsg.mediaName || null : null,
                mediaData: existingMsg ? existingMsg.mediaData || null : null,
              };
            });

          if (!updatedMessages.length) {
            return res.status(400).json({ success: false, msg: 'At least one valid message is required' });
          }

          campaign.messages = updatedMessages;
        }

        if (delaySettings) {
          const minDelay = parseInt(delaySettings.minDelay, 10) || 5;
          const maxDelay = parseInt(delaySettings.maxDelay, 10) || 25;
          campaign.delaySettings = {
            minDelay: Math.max(1, minDelay),
            maxDelay: Math.max(Math.max(1, minDelay), maxDelay),
          };
        }

        if (scheduling) {
          campaign.scheduling = {
            ...campaign.scheduling,
            ...scheduling,
            startDate: scheduling.startDate ? new Date(scheduling.startDate) : scheduling.startDate === null ? null : campaign.scheduling?.startDate,
          };
        }

        if (selectedClients && Array.isArray(selectedClients)) {
          const readyClients = getReadyCampaignClientIds(selectedClients);
          if (!readyClients.length) {
            return res.status(400).json({ success: false, msg: 'At least one ready client must remain selected' });
          }
          campaign.selectedClients = readyClients;
        }

        if (status && ['pending', 'paused', 'scheduled', 'running', 'completed', 'stopped'].includes(status)) {
          campaign.status = status;
        }

        await campaign.save();
        if (campaign.status === 'pending' || campaign.status === 'running') {
          await queueCampaignRun(campaignId, 'edited_resume');
        }

        return res.status(200).json({ success: true, msg: 'Campaign updated successfully', campaign });
      }

      if (action === 'pause') {
        if (campaign.status !== 'running') {
          return res.status(400).json({ success: false, msg: `Cannot pause campaign with status: ${campaign.status}` });
        }

        campaign.status = 'paused';
        campaign.lastPausedAt = new Date();
        await campaign.save();
        return res.status(200).json({ success: true, msg: 'Campaign paused successfully' });
      }

      if (action === 'resume') {
        if (!['paused', 'pending', 'scheduled', 'completed', 'stopped'].includes(campaign.status)) {
          return res.status(400).json({ success: false, msg: `Cannot resume campaign with status: ${campaign.status}` });
        }

        if (['completed', 'stopped'].includes(campaign.status)) {
          campaign.status = 'pending';
        } else {
          campaign.status = 'running';
        }

        campaign.nextResumeAt = null;
        await campaign.save();
        await queueCampaignRun(campaignId, 'resume_action');

        return res.status(200).json({ success: true, msg: 'Campaign resumed successfully' });
      }

      if (action === 'stop') {
        if (!['running', 'paused', 'scheduled', 'pending'].includes(campaign.status)) {
          return res.status(400).json({ success: false, msg: `Cannot stop campaign with status: ${campaign.status}` });
        }

        campaign.status = 'stopped';
        campaign.endTime = new Date();
        await campaign.save();
        return res.status(200).json({ success: true, msg: 'Campaign stopped successfully' });
      }

      if (action === 'rerun') {
        campaign.status = 'pending';
        campaign.startTime = null;
        campaign.endTime = null;
        campaign.lastPausedAt = null;
        campaign.nextResumeAt = null;
        campaign.currentIndex = 0;
        campaign.processedNumbers = 0;
        campaign.successCount = 0;
        campaign.failedCount = 0;
        campaign.numberReports = [];
        campaign.summary = {
          totalProcessed: 0,
          successRate: 0,
          averageDeliveryTime: 0,
          messagesDistribution: [],
        };

        await MessageHistory.deleteMany({ campaignId: campaign.campaignId, source: 'campaign' });
        await campaign.save();
        await queueCampaignRun(campaignId, 'rerun_action');

        return res.status(200).json({ success: true, msg: 'Campaign reset and rerun started' });
      }

      if (action === 'reschedule') {
        const { startDate, startTime, endTime } = parsedBody;
        if (!startDate || !startTime) {
          return res.status(400).json({ success: false, msg: 'startDate and startTime are required for reschedule' });
        }

        const scheduledStartTime = new Date(`${startDate}T${startTime}:00+05:30`);
        campaign.scheduling = {
          ...campaign.scheduling,
          startDate: new Date(startDate),
          startTime,
          endTime: endTime || campaign.scheduling?.endTime || '21:00',
        };

        campaign.status = scheduledStartTime > new Date() ? 'scheduled' : 'pending';
        campaign.nextResumeAt = null;
        await campaign.save();

        if (campaign.status === 'pending') {
          await queueCampaignRun(campaignId, 'reschedule_immediate');
        }

        return res.status(200).json({
          success: true,
          msg: campaign.status === 'scheduled' ? 'Campaign rescheduled' : 'Campaign scheduled time already passed, started now',
        });
      }

      return res.status(400).json({
        success: false,
        msg: `Invalid action: ${action}. Valid actions: edit, pause, resume, stop, rerun, reschedule`,
      });
    }

    if (req.method === 'DELETE') {
      const { campaignId } = req.query;
      if (!campaignId) {
        return res.status(400).json({ success: false, msg: 'campaignId required' });
      }

      const deleted = await Campaign.findOneAndDelete({ campaignId, userId: user.id });
      if (!deleted) {
        return res.status(404).json({ success: false, msg: 'Campaign not found' });
      }

      await MessageHistory.deleteMany({ campaignId, source: 'campaign' });
      return res.status(200).json({ success: true, msg: 'Campaign deleted successfully' });
    }

    return res.status(405).json({ success: false, msg: `Method ${req.method} not allowed` });
  } catch (error) {
    logger.error('Campaign API error', { err: error });
    return res.status(500).json({
      success: false,
      msg: 'Internal server error',
      details: error.message,
    });
  }
}
