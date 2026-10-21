// /api/messageHistory.js

import MessageHistory from '@/models/MessageHistory';
import { verifyAuth } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      msg: 'Method not allowed' 
    });
  }

  try {
    await connectToMongoDB();

    // Authenticate user
    let user;
    try {
      const auth = await verifyAuth(req);
      user = auth.user;
    } catch (err) {
      return res.status(err.status || 401).json({ 
        success: false, 
        msg: err.msg || 'Unauthorized' 
      });
    }

    // Extract query parameters
    const { 
      deliveryStatus, 
      source, 
      clientUsed, 
      page = 1, 
      limit = 20,
      search,
      sortBy = 'sentTime',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    let filter = {};
    
    // Filter by delivery status
    if (deliveryStatus && deliveryStatus !== 'all') {
      filter.deliveryStatus = deliveryStatus;
    }
    
    // Filter by source
    if (source && source !== 'all') {
      filter.source = source;
    }
    
    // Filter by client used
    if (clientUsed && clientUsed !== 'all') {
      filter.clientUsed = clientUsed;
    }

    // Search functionality (searches in number, originalNumber, message)
    if (search && search.trim() !== '') {
      filter.$or = [
        { number: { $regex: search, $options: 'i' } },
        { originalNumber: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
        { clientUsed: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination setup
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10))); // Max 100 items per page
    const skip = (pageNum - 1) * limitNum;

    // Sort setup
    const validSortFields = ['sentTime', 'deliveryTime', 'number', 'deliveryStatus', 'source'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'sentTime';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortDirection };

    // Get total count for pagination (with filters applied)
    const totalItems = await MessageHistory.countDocuments(filter);

    // Get paginated and filtered results
    const rawMessages = await MessageHistory.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const messages = rawMessages.map((m) => ({
      ...m,
      phoneNumber: m.number || m.originalNumber || '',
      number: m.number || m.originalNumber || '',
      messageText: m.message || '',
      message: m.message || '',
      errorMessage: m.error || m.errorMessage || null,
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(totalItems / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Get stats for the current filtered dataset
    const stats = await MessageHistory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: {
            $sum: {
              $cond: [{ $in: ['$deliveryStatus', ['sent', 'delivered', 'success']] }, 1, 0]
            }
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0]
            }
          },
          pending: {
            $sum: {
              $cond: [{ $in: ['$deliveryStatus', ['pending', 'queued']] }, 1, 0]
            }
          },
          avgDeliveryTime: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$deliveryTime', null] }, { $gt: ['$deliveryTime', 0] }] },
                '$deliveryTime',
                null
              ]
            }
          }
        }
      }
    ]);

    const currentStats = stats[0] || {
      total: 0,
      sent: 0,
      failed: 0,
      pending: 0,
      avgDeliveryTime: 0
    };

    return res.status(200).json({
      success: true,
      data: {
        messages,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems,
          itemsPerPage: limitNum,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? pageNum + 1 : null,
          prevPage: hasPrevPage ? pageNum - 1 : null
        },
        filters: {
          deliveryStatus: deliveryStatus || 'all',
          source: source || 'all',
          clientUsed: clientUsed || 'all',
          search: search || '',
          sortBy: sortField,
          sortOrder
        },
        stats: {
          ...currentStats,
          successRate: currentStats.total > 0 ? 
            ((currentStats.sent / currentStats.total) * 100).toFixed(1) : 0
        }
      }
    });

  } catch (error) {
    console.error('MessageHistory API error:', error);
    return res.status(500).json({
      success: false,
      msg: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}
