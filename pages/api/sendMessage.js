import { clients } from '@/lib/whatsappClients';
import MessageHistory from '@/models/MessageHistory';
import connectToMongoDB from '@/lib/mongodb';
import { createLogger, getRequestContext } from '@/lib/logger';

const baseLogger = createLogger({ module: 'api.sendMessage' });

export default async function handler(req, res) {
  const logger = baseLogger.child(getRequestContext(req, '/api/sendMessage'));

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      msg: 'Only POST method allowed',
    });
  }


  // s
  try {
    await connectToMongoDB();
  } catch (err) {
    logger.error('Database connection failed', { err });
    return res.status(500).json({
      success: false,
      msg: 'Database connection failed',
    });
  }

  let messageHistoryId = null;

  try {
    const { contact, msg, client: preferredClient, accesstoken } = req.body;

    if (!accesstoken) {
      return res.status(400).json({ success: false, msg: 'API token is required' });
    }

    if (accesstoken !== process.env.TOKEN_API_PUBLIC) {
      logger.warn('Rejected sendMessage request with invalid token');
      return res.status(401).json({ success: false, msg: 'Invalid API token' });
    }

    if (!contact) {
      return res.status(400).json({ success: false, msg: 'Contact number is required' });
    }

    if (!msg || msg.trim() === '') {
      return res.status(400).json({ success: false, msg: 'Message is required and cannot be empty' });
    }

    const formattedNumber = formatIndianNumber(contact);
    if (formattedNumber.length < 10) {
      return res.status(400).json({ success: false, msg: 'Invalid phone number format' });
    }

    let selectedClient = null;
    let selectedClientId = null;

    if (preferredClient) {
      if (clients[preferredClient]?.ready && clients[preferredClient]?.client) {
        selectedClient = clients[preferredClient].client;
        selectedClientId = preferredClient;
      } else {
        return res.status(400).json({
          success: false,
          msg: `Specified client ${preferredClient} is not ready or doesn't exist`,
        });
      }
    } else {
      const activeClients = Object.entries(clients).filter(([, client]) => client.ready && client.client);
      if (activeClients.length === 0) {
        return res.status(503).json({
          success: false,
          msg: 'No WhatsApp clients are currently active',
        });
      }
      [selectedClientId, { client: selectedClient }] = activeClients[0];
    }

    const messageHistory = new MessageHistory({
      number: formattedNumber,
      originalNumber: contact,
      message: msg.trim(),
      deliveryStatus: 'pending',
      source: 'api',
      clientUsed: selectedClientId,
      hasMedia: false,
      sentTime: new Date(),
    });

    const savedHistory = await messageHistory.save();
    messageHistoryId = savedHistory._id;

    const chatId = `${formattedNumber}@c.us`;
    const isRegistered = await selectedClient.isRegisteredUser(chatId);

    if (!isRegistered) {
      await MessageHistory.findByIdAndUpdate(messageHistoryId, { deliveryStatus: 'failed' });
      logger.warn('Send aborted: number not registered on WhatsApp', { formattedNumber, clientId: selectedClientId });
      return res.status(400).json({ success: false, msg: 'This number is not registered on WhatsApp' });
    }

    const startTime = Date.now();
    await selectedClient.sendMessage(chatId, msg.trim());
    const deliveryTime = Date.now() - startTime;

    await MessageHistory.findByIdAndUpdate(messageHistoryId, {
      deliveryStatus: 'sent',
      deliveryTime,
    });

    logger.info('Message sent successfully', {
      clientId: selectedClientId,
      formattedNumber,
      deliveryTime,
      messageHistoryId: String(messageHistoryId),
    });

    return res.status(200).json({
      success: true,
      msg: 'Message sent successfully',
      data: {
        contact: formattedNumber,
        originalContact: contact,
        clientUsed: selectedClientId,
        deliveryTime: `${deliveryTime}ms`,
        timestamp: new Date().toISOString(),
        historyId: messageHistoryId,
      },
    });
  } catch (error) {
    logger.error('Send message API error', { err: error, messageHistoryId });

    if (messageHistoryId) {
      try {
        await MessageHistory.findByIdAndUpdate(messageHistoryId, { deliveryStatus: 'failed' });
      } catch (updateError) {
        logger.error('Failed to update message history after send failure', { err: updateError, messageHistoryId });
      }
    }

    return res.status(500).json({
      success: false,
      msg: 'Failed to send message',
      details: error.message,
    });
  }
}

function formatIndianNumber(number) {
  const cleaned = String(number).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith('0') && cleaned.length === 11) return `91${cleaned.substring(1)}`;
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
}
