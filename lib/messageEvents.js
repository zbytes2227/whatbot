// lib/messageEvents.js
// Delivery/read receipts, reply tracking and automatic opt-outs.

import MessageHistory from '@/models/MessageHistory';
import OptOut from '@/models/OptOut';
import connectToMongoDB from '@/lib/mongodb';
import { createLogger } from '@/lib/logger';
import { setMessageHooks } from '@/lib/whatsappClients';

const logger = createLogger({ module: 'messageEvents' });

// proto.WebMessageInfo.Status: 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED
const RECEIPTS = {
  3: { status: 'delivered', field: 'deliveredAt', from: ['pending', 'sent', 'unknown'] },
  4: { status: 'read', field: 'readAt', from: ['pending', 'sent', 'delivered', 'unknown'] },
  5: { status: 'read', field: 'readAt', from: ['pending', 'sent', 'delivered', 'unknown'] },
};

const DEFAULT_KEYWORDS = 'stop,unsubscribe,stop all,opt out,optout,cancel';

function optOutKeywords() {
  return new Set(String(process.env.OPT_OUT_KEYWORDS || DEFAULT_KEYWORDS).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean));
}

function messageText(message) {
  const m = message?.message || {};
  return m.conversation || m.extendedTextMessage?.text || m.buttonsResponseMessage?.selectedDisplayText || '';
}

function senderNumber(key = {}) {
  const jid = [key.remoteJid, key.remoteJidAlt, key.senderPn].find((j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  return jid ? jid.split('@')[0].split(':')[0] : null;
}

async function onMessageStatus(clientId, updates) {
  const relevant = (updates || []).filter((u) => u?.key?.fromMe && u.key.id && RECEIPTS[u.update?.status]);
  if (!relevant.length) return;
  await connectToMongoDB();
  const now = new Date();
  await Promise.all(relevant.map((u) => {
    const receipt = RECEIPTS[u.update.status];
    return MessageHistory.updateMany(
      { waMessageId: u.key.id, deliveryStatus: { $in: receipt.from } },
      { $set: { deliveryStatus: receipt.status, [receipt.field]: now } }
    );
  }));
}

async function onIncoming(clientId, messages) {
  const keywords = optOutKeywords();
  const autoOptOut = process.env.AUTO_OPT_OUT !== '0';
  for (const message of messages || []) {
    if (message?.key?.fromMe) continue;
    const remote = message?.key?.remoteJid || '';
    if (remote.endsWith('@g.us') || remote === 'status@broadcast' || remote.endsWith('@newsletter')) continue;
    const number = senderNumber(message.key);
    if (!number) continue;
    await connectToMongoDB();

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await MessageHistory.findOneAndUpdate(
      { number, sentTime: { $gte: since }, repliedAt: null, deliveryStatus: { $in: ['sent', 'delivered', 'read'] } },
      { $set: { repliedAt: new Date(), deliveryStatus: 'read' } },
      { sort: { sentTime: -1 } }
    );

    const text = messageText(message).trim().toLowerCase();
    if (autoOptOut && text && keywords.has(text)) {
      await OptOut.updateOne(
        { number },
        { $setOnInsert: { number, source: 'reply', reason: `Replied "${text.slice(0, 40)}" to ${clientId}` } },
        { upsert: true }
      );
      logger.info('Recipient opted out by reply', { number, clientId });
    }
  }
}

export function registerMessageEvents() {
  setMessageHooks({ onMessageStatus, onIncoming });
}
