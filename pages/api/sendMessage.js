// Public integration endpoint. Authenticated with TOKEN_API_PUBLIC via the
// `accesstoken` body field, an X-API-Key header or a Bearer header.
import MessageHistory from '@/models/MessageHistory';
import { HttpError, withApi } from '@/lib/api';
import { verifyPublicApiToken } from '@/lib/auth';
import { normalizePhone } from '@/lib/phone';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { clients, getReadyClientIds, sendWhatsAppMessage } from '@/lib/whatsappClients';

const RATE = { limit: Number(process.env.API_RATE_LIMIT_PER_MIN || 60), windowMs: 60 * 1000 };

export default withApi(async (req, res, { logger }) => {
  const { contact, msg, client: preferredClient, accesstoken } = req.body || {};
  const ip = getClientIp(req);

  if (!verifyPublicApiToken(req, accesstoken)) {
    const attempts = checkRateLimit(`api-bad-token:${ip}`, { limit: 20, windowMs: 15 * 60 * 1000 });
    logger.warn('Rejected sendMessage request with invalid token', { ip });
    if (!attempts.allowed) throw new HttpError(429, 'Too many invalid API token attempts');
    throw new HttpError(401, 'Invalid API token');
  }

  const rate = checkRateLimit('api-send', RATE);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    throw new HttpError(429, 'Rate limit exceeded');
  }

  if (!contact) throw new HttpError(400, 'Contact number is required');
  if (typeof msg !== 'string' || !msg.trim()) throw new HttpError(400, 'Message is required and cannot be empty');
  if (msg.length > 4096) throw new HttpError(400, 'Message exceeds 4096 characters');

  const number = normalizePhone(contact);
  if (!number) throw new HttpError(400, 'Invalid phone number format');

  let clientId;
  if (preferredClient) {
    if (!clients[preferredClient]) throw new HttpError(400, `Unknown client ${preferredClient}`);
    if (!getReadyClientIds([preferredClient]).length) throw new HttpError(503, `Client ${preferredClient} is not connected`);
    clientId = preferredClient;
  } else {
    const ready = getReadyClientIds();
    if (!ready.length) throw new HttpError(503, 'No WhatsApp clients are currently connected');
    clientId = ready[Math.floor(Math.random() * ready.length)];
  }

  const text = msg.trim();
  const history = await MessageHistory.create({
    number, originalNumber: String(contact).slice(0, 40), message: text, deliveryStatus: 'pending',
    source: 'api', clientUsed: clientId, sentTime: new Date(),
  });

  try {
    const result = await sendWhatsAppMessage({ clientId, to: number, text });
    await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: 'sent', deliveryTime: result.deliveryTime, waMessageId: result.messageId } });
    return res.status(200).json({
      success: true,
      msg: 'Message sent successfully',
      data: {
        contact: number,
        originalContact: contact,
        clientUsed: clientId,
        deliveryTime: `${result.deliveryTime}ms`,
        timestamp: new Date().toISOString(),
        historyId: history._id,
      },
    });
  } catch (err) {
    const status = err.code === 'NUMBER_NOT_REGISTERED' ? 'failed' : err.stage === 'send' ? 'unknown' : 'failed';
    await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: status, error: err.message } }).catch(() => {});
    logger.warn('API send failed', { clientId, number, code: err.code, stage: err.stage });
    const httpStatus = err.code === 'NUMBER_NOT_REGISTERED' ? 422 : err.code === 'CLIENT_UNAVAILABLE' ? 503 : 502;
    throw new HttpError(httpStatus, 'Failed to send message', { details: err.message, historyId: history._id });
  }
}, { methods: ['POST'], auth: false, name: 'sendMessage' });
