// /api/dashboard.js
import Campaign from '@/models/Campaigns';
import ContactList from '@/models/ContactList';
import MessageHistory, { SENT_STATUSES } from '@/models/MessageHistory';
import OptOut from '@/models/OptOut';
import { withApi } from '@/lib/api';
import { DEFAULT_TIMEZONE, dateKey, startOfDay } from '@/lib/campaignTime';
import { getClientsSnapshot } from '@/lib/whatsappClients';

export default withApi(async (req, res, { user }) => {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const todayStart = startOfDay(now, tz);
  const weekStart = startOfDay(now, tz, -13);

  const [contactLists, campaignStatus, todayRows, totals, trendRows, recentCampaigns, recentMessages, optOuts] = await Promise.all([
    ContactList.countDocuments({ userId: user.id }),
    Campaign.aggregate([{ $match: { userId: user.id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    MessageHistory.aggregate([{ $match: { sentTime: { $gte: todayStart } } }, { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } }]),
    MessageHistory.aggregate([
      { $match: { sentTime: { $gte: startOfDay(now, tz, -29) } } },
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $in: ['$deliveryStatus', SENT_STATUSES] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$deliveryStatus', ['delivered', 'read']] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$deliveryStatus', ['failed', 'unknown']] }, 1, 0] } },
          replied: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$repliedAt', null] }, null] }, 1, 0] } },
        },
      },
    ]),
    MessageHistory.aggregate([
      { $match: { sentTime: { $gte: weekStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$sentTime', timezone: tz } },
          sent: { $sum: { $cond: [{ $in: ['$deliveryStatus', SENT_STATUSES] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$deliveryStatus', ['failed', 'unknown']] }, 1, 0] } },
        },
      },
    ]),
    Campaign.find({ userId: user.id })
      .select('campaignId campaignName status totalNumbers successCount failedCount skippedCount processedNumbers createdAt nextResumeAt lastError')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    MessageHistory.find({})
      .select('number deliveryStatus source clientUsed sentTime campaignId error')
      .sort({ sentTime: -1 })
      .limit(8)
      .lean(),
    OptOut.estimatedDocumentCount(),
  ]);

  const statusCounts = Object.fromEntries(campaignStatus.map((r) => [r._id, r.count]));
  const today = Object.fromEntries(todayRows.map((r) => [r._id, r.count]));
  const t = totals[0] || { sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 };
  const trendMap = new Map(trendRows.map((r) => [r._id, r]));
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(weekStart.getTime() + (i * 24 + 12) * 3600 * 1000);
    const key = dateKey(day, tz);
    return { date: key, sent: trendMap.get(key)?.sent || 0, failed: trendMap.get(key)?.failed || 0 };
  });

  const attempted = t.sent + t.failed;
  return res.status(200).json({
    success: true,
    data: {
      sentToday: SENT_STATUSES.reduce((sum, s) => sum + (today[s] || 0), 0),
      failedToday: (today.failed || 0) + (today.unknown || 0),
      last30: {
        ...t,
        successRate: attempted ? Math.round((t.sent / attempted) * 1000) / 10 : 0,
        deliveryRate: t.sent ? Math.round((t.delivered / t.sent) * 1000) / 10 : 0,
        readRate: t.sent ? Math.round((t.read / t.sent) * 1000) / 10 : 0,
        replyRate: t.sent ? Math.round((t.replied / t.sent) * 1000) / 10 : 0,
      },
      campaigns: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        running: statusCounts.running || 0,
        scheduled: statusCounts.scheduled || 0,
        paused: statusCounts.paused || 0,
        needsReview: statusCounts.needs_review || 0,
        completed: statusCounts.completed || 0,
      },
      contactLists,
      optOuts,
      trend,
      recentCampaigns,
      recentMessages,
      profiles: getClientsSnapshot(),
      timezone: tz,
    },
  });
}, { methods: ['GET'], name: 'dashboard' });
