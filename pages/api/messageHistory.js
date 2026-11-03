// /api/messageHistory.js
import MessageHistory, { DELIVERY_STATUSES, SENT_STATUSES } from '@/models/MessageHistory';
import { badRequest, escapeRegex, intInRange, str, withApi } from '@/lib/api';
import { csvRow, startCsvDownload } from '@/lib/csv';
import { DEFAULT_TIMEZONE, isValidDate, parseZonedDateTime } from '@/lib/campaignTime';
import { clients } from '@/lib/whatsappClients';

const SORT_FIELDS = ['sentTime', 'deliveryTime', 'number', 'deliveryStatus', 'source'];

function buildFilter(query) {
  const filter = {};
  if (DELIVERY_STATUSES.includes(query.deliveryStatus)) filter.deliveryStatus = query.deliveryStatus;
  if (query.deliveryStatus === 'replied') filter.repliedAt = { $ne: null };
  if (['campaign', 'api', 'manual'].includes(query.source)) filter.source = query.source;
  if (typeof query.clientUsed === 'string' && clients[query.clientUsed]) filter.clientUsed = query.clientUsed;
  const campaignId = str(query.campaignId, { max: 80 });
  if (campaignId) filter.campaignId = campaignId;

  const from = str(query.from, { max: 10 });
  const to = str(query.to, { max: 10 });
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) throw badRequest('Invalid date range');
  if (from || to) {
    filter.sentTime = {};
    if (from) filter.sentTime.$gte = parseZonedDateTime(from, '00:00', DEFAULT_TIMEZONE);
    if (to) filter.sentTime.$lt = new Date(parseZonedDateTime(to, '00:00', DEFAULT_TIMEZONE).getTime() + 24 * 3600 * 1000);
  }

  const search = str(query.search, { max: 100 });
  if (search) {
    const re = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ number: re }, { originalNumber: re }, { message: re }];
  }
  return filter;
}

export default withApi(async (req, res) => {
  const filter = buildFilter(req.query);

  if (req.query.format === 'csv') {
    startCsvDownload(res, `message-history-${new Date().toISOString().slice(0, 10)}.csv`);
    res.write(csvRow(['sent_at', 'number', 'status', 'source', 'profile', 'campaign_id', 'message', 'delivered_at', 'read_at', 'replied_at', 'delivery_ms', 'error']));
    const cursor = MessageHistory.find(filter).sort({ sentTime: -1 }).limit(100000).lean().cursor();
    for await (const m of cursor) {
      res.write(csvRow([m.sentTime, m.number, m.deliveryStatus, m.source, clients[m.clientUsed]?.name || m.clientUsed, m.campaignId, m.message, m.deliveredAt, m.readAt, m.repliedAt, m.deliveryTime, m.error]));
    }
    return res.end();
  }

  const page = intInRange(req.query.page, { min: 1, max: 100000, fallback: 1 });
  const limit = intInRange(req.query.limit, { min: 5, max: 100, fallback: 25 });
  const sortField = SORT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'sentTime';
  const sortDirection = req.query.sortOrder === 'asc' ? 1 : -1;

  const [totalItems, messages, statsRows] = await Promise.all([
    MessageHistory.countDocuments(filter),
    MessageHistory.find(filter).sort({ [sortField]: sortDirection, _id: sortDirection }).skip((page - 1) * limit).limit(limit).lean(),
    MessageHistory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $in: ['$deliveryStatus', SENT_STATUSES] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$deliveryStatus', ['failed', 'unknown']] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'pending'] }, 1, 0] } },
          avgDeliveryTime: { $avg: { $cond: [{ $gt: ['$deliveryTime', 0] }, '$deliveryTime', null] } },
        },
      },
    ]),
  ]);

  const stats = statsRows[0] || { total: 0, sent: 0, read: 0, failed: 0, pending: 0, avgDeliveryTime: 0 };
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return res.status(200).json({
    success: true,
    data: {
      messages,
      pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      stats: { ...stats, successRate: stats.total ? Math.round((stats.sent / stats.total) * 1000) / 10 : 0 },
      profiles: Object.fromEntries(Object.values(clients).map((c) => [c.id, c.name])),
    },
  });
}, { methods: ['GET'], name: 'messageHistory' });
