// Dashboard "quick send" and campaign "send test". Session authenticated.
import MessageHistory from '@/models/MessageHistory';
import { HttpError, badRequest, firstFile, parseMultipart, str, withApi } from '@/lib/api';
import { cleanupTempFiles, MAX_MEDIA_BYTES, readUpload } from '@/lib/media';
import { renderTemplate } from '@/lib/messageTemplate';
import { normalizePhone } from '@/lib/phone';
import { checkRateLimit } from '@/lib/rateLimit';
import { clients, getReadyClientIds, sendWhatsAppMessage } from '@/lib/whatsappClients';

export const config = { api: { bodyParser: false } };

export default withApi(async (req, res, { logger }) => {
  const rate = checkRateLimit('dashboard-send', { limit: 30, windowMs: 60 * 1000 });
  if (!rate.allowed) throw new HttpError(429, 'Slow down: too many messages in the last minute');

  const { fields, files } = await parseMultipart(req, { maxFileSize: MAX_MEDIA_BYTES, maxFiles: 1 });
  try {
    const number = normalizePhone(str(fields.to, { max: 40 }));
    if (!number) throw badRequest('Enter a valid phone number');
    const text = renderTemplate(str(fields.text, { max: 4096 }), { number });

    const file = firstFile(files, 'media');
    const upload = file ? await readUpload(file) : null;
    if (!text && !upload) throw badRequest('Add a message or an attachment');

    const requested = str(fields.clientId, { max: 20 });
    let clientId;
    if (requested) {
      if (!clients[requested]) throw badRequest('Unknown WhatsApp profile');
      if (!getReadyClientIds([requested]).length) throw new HttpError(409, `${clients[requested].name} is not connected`);
      clientId = requested;
    } else {
      [clientId] = getReadyClientIds();
      if (!clientId) throw new HttpError(409, 'No WhatsApp profile is connected');
    }

    const history = await MessageHistory.create({
      number, originalNumber: number, message: text, deliveryStatus: 'pending', source: 'manual', clientUsed: clientId,
      hasMedia: !!upload, mediaType: upload?.mimeType, mediaName: upload?.name, sentTime: new Date(),
    });
    try {
      const result = await sendWhatsAppMessage({
        clientId,
        to: number,
        text,
        media: upload ? { buffer: upload.buffer, mimetype: upload.mimeType, fileName: upload.name } : null,
      });
      await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: 'sent', deliveryTime: result.deliveryTime, waMessageId: result.messageId } });
      return res.status(200).json({ success: true, msg: `Sent to +${number} via ${clients[clientId].name}` });
    } catch (err) {
      await MessageHistory.updateOne({ _id: history._id }, { $set: { deliveryStatus: err.stage === 'send' && err.code !== 'NUMBER_NOT_REGISTERED' ? 'unknown' : 'failed', error: err.message } });
      logger.warn('Quick send failed', { clientId, number, code: err.code });
      throw new HttpError(err.code === 'NUMBER_NOT_REGISTERED' ? 422 : 502, err.message);
    }
  } finally {
    await cleanupTempFiles(files);
  }
}, { methods: ['POST'], name: 'messages.send' });
