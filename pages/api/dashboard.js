// /api/dashboard.js

import { clients } from '@/lib/whatsappClients';
import { verifyAuth } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import ContactList from '@/models/ContactList';
import Campaigns from '@/models/Campaigns';
import MessageHistory from '@/models/MessageHistory';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, msg: 'Method not allowed' });
  }

  try {
    await connectToMongoDB();
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    return res.status(500).json({ success: false, msg: 'Database connection failed' });
  }

  try {
    const { user } = await verifyAuth(req);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Fetch counts and stats concurrently with lean projections
    const [
      totalContactLists,
      totalCampaigns,
      runningCampaigns,
      scheduledCampaigns,
      completedCampaigns,
      messagesSentToday,
      totalMessagesDelivered,
      totalMessagesFailed,
      recentCampaignsRaw,
      recentMessagesRaw,
      sevenDayTrendRaw,
    ] = await Promise.all([
      ContactList.countDocuments({ userId: user.id }),
      Campaigns.countDocuments({ userId: user.id }),
      Campaigns.countDocuments({ userId: user.id, status: 'running' }),
      Campaigns.countDocuments({ userId: user.id, status: 'scheduled' }),
      Campaigns.countDocuments({ userId: user.id, status: 'completed' }),
      MessageHistory.countDocuments({
        deliveryStatus: 'delivered',
        sentTime: { $gte: startOfToday },
      }),
      MessageHistory.countDocuments({ deliveryStatus: 'delivered' }),
      MessageHistory.countDocuments({ deliveryStatus: 'failed' }),
      Campaigns.find({ userId: user.id })
        .select('campaignId campaignName status totalNumbers successCount failedCount processedNumbers createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      MessageHistory.find({})
        .select('number message deliveryStatus source clientUsed sentTime')
        .sort({ sentTime: -1 })
        .limit(8)
        .lean(),
      MessageHistory.aggregate([
        {
          $match: {
            sentTime: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$sentTime' },
            },
            count: { $sum: 1 },
            delivered: {
              $sum: { $cond: [{ $eq: ['$deliveryStatus', 'delivered'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const totalProcessed = totalMessagesDelivered + totalMessagesFailed;
    const successRate = totalProcessed > 0
      ? Math.round((totalMessagesDelivered / totalProcessed) * 100)
      : (totalMessagesDelivered > 0 ? 100 : 0);

    // Construct 7-day trend array
    const trendMap = new Map();
    for (const item of sevenDayTrendRaw || []) {
      trendMap.set(item._id, item.count);
    }

    const messageTrend7d = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      messageTrend7d.push(trendMap.get(dateKey) || (i === 0 ? messagesSentToday : 0));
    }

    // Format recent campaigns for UI
    const formattedCampaigns = recentCampaignsRaw.map((c) => ({
      id: c.campaignId,
      name: c.campaignName,
      status: c.status,
      total: c.totalNumbers || 0,
      sent: c.successCount || 0,
      failed: c.failedCount || 0,
      processed: c.processedNumbers || 0,
      createdAt: c.createdAt,
    }));

    // Format activity feed
    const activityFeed = [];
    for (const msg of recentMessagesRaw || []) {
      activityFeed.push({
        id: msg._id,
        type: msg.deliveryStatus === 'delivered' ? 'send' : (msg.deliveryStatus === 'failed' ? 'error' : 'default'),
        message: `Message ${msg.deliveryStatus} to ${msg.number} via ${msg.clientUsed || 'client'}`,
        time: formatRelativeTime(msg.sentTime),
      });
    }

    // If no recent messages yet, add contextual system activities
    if (!activityFeed.length) {
      if (runningCampaigns > 0) {
        activityFeed.push({
          type: 'campaign',
          message: `${runningCampaigns} campaign currently active`,
          time: 'Active now',
        });
      }
      activityFeed.push({
        type: 'session',
        message: 'System running and monitoring WhatsApp sessions',
        time: 'Ready',
      });
    }

    // WhatsApp clients status
    const whatsappClientsStatus = Object.entries(clients).map(([id, client]) => ({
      id,
      name: client.accountInfo?.name || client.name,
      number: client.accountInfo?.number || null,
      status: client.status,
      ready: client.ready,
      enabled: !!client.enabled,
      hasQR: !!client.qrCode,
      lastUpdate: client.lastUpdate,
      error: client.error,
    }));

    return res.status(200).json({
      success: true,
      data: {
        totalContactLists,
        totalCampaigns,
        runningCampaigns,
        scheduledCampaigns,
        completedCampaigns,
        messagesSentToday,
        totalMessagesDelivered,
        totalMessagesFailed,
        successRate,
        deliverySuccess: successRate,
        deliveryFailed: 100 - successRate,
        messageTrend7d,
        campaigns: formattedCampaigns,
        activityFeed: activityFeed.slice(0, 6),
        whatsappClientsStatus,
      },
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    res.status(500).json({ success: false, msg: 'Internal server error' });
  }
}

function formatRelativeTime(date) {
  if (!date) return 'Recently';
  const now = Date.now();
  const diffSec = Math.floor((now - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

