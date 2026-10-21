// /api/groups.js

import { clients } from '@/lib/whatsappClients';
import { verifyAuth } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getUsableWhatsAppClient(clientId) {
  const clientEntry = clients[clientId];
  if (!clientEntry || !clientEntry.ready || !clientEntry.client) {
    return { ok: false, status: 409, msg: `Client ${clientId} is not ready or connected` };
  }

  try {
    if (!clientEntry.ready) return { ok: false, status: 409, msg: `Client ${clientId} is not ready yet` };
    return { ok: true, client: clientEntry.client, entry: clientEntry, state: 'CONNECTED' };
  } catch (error) {
    return {
      ok: false,
      status: 409,
      msg: `Client ${clientId} session is not usable. Reconnect the WhatsApp profile and try again.`,
      error,
    };
  }
}

async function waitForUsableWhatsAppClient(clientId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const entry = clients[clientId];
    if (!entry) return { ok: false, status: 400, msg: 'Invalid client ID' };
    lastStatus = entry.status;
    const usable = await getUsableWhatsAppClient(clientId);
    if (usable.ok) return usable;
    if (['error', 'disconnected'].includes(entry.status) || !entry.enabled) {
      return usable;
    }
    await wait(300);
  }
  return {
    ok: false,
    status: 409,
    msg: `Client ${clientId} is still ${lastStatus || 'initializing'}; please retry when it reaches Connected status`,
  };
}

async function getGroupsFromWeb(client) {
  const groups = await client.groupFetchAllParticipating();
  return Object.values(groups).map((group) => ({
    id: { _serialized: group.id }, name: group.subject || '', description: group.desc || '',
    participants: (group.participants || []).map((p) => ({ id: { _serialized: p.id }, isAdmin: ['admin', 'superadmin'].includes(p.admin), isSuperAdmin: p.admin === 'superadmin' })),
    createdAt: group.creation ? new Date(group.creation * 1000) : null, lastMessage: null,
  }));
}

export default async function handler(req, res) {
  // Connect to MongoDB first
  try {
    await connectToMongoDB();
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Database connection failed' 
    });
  }

  // Authenticate user
  let currentUser;
  try {
    const authResult = await verifyAuth(req);
    currentUser = authResult.user;
  } catch (authError) {
    return res.status(authError.status || 401).json({
      success: false,
      msg: authError.msg || 'Unauthorized'
    });
  }

  // Only GET requests allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      msg: 'Method not allowed' 
    });
  }

  try {
    const { action, clientId, groupId } = req.query;

    // Action 1: Get available clients (logged in profiles)
    if (action === 'profiles') {
      const availableProfiles = [];
      
      for (const [id, client] of Object.entries(clients)) {
        if (client.ready && client.client) {
          try {
            // Get basic info about the client
            const clientInfo = 'CONNECTED';
            availableProfiles.push({
              clientId: id,
              name: client.name,
              status: client.status,
              ready: client.ready,
              state: clientInfo
            });
          } catch (error) {
            console.error(`Error getting client info for ${id}:`, error);
            // A ready flag alone is not enough: getChats/getChatById require
            // a live connected WhatsApp page. Do not advertise unusable
            // sessions as available profiles.
          }
        }
      }

      return res.status(200).json({
        success: true,
        profiles: availableProfiles,
        msg: `Found ${availableProfiles.length} available profiles`
      });
    }

    // Action 2: Get groups for a specific client
    if (action === 'list' && clientId) {
      // Validate client exists and is ready
      if (!clients[clientId]) {
        return res.status(400).json({ 
          success: false, 
          msg: 'Invalid client ID' 
        });
      }

      // initClient() resolves when Puppeteer initialization completes, which
      // can precede WhatsApp's ready/CONNECTED event. Wait for that event
      // instead of restarting a healthy client during this window.
      const usable = await waitForUsableWhatsAppClient(clientId);
      if (!usable.ok) {
        return res.status(usable.status).json({ success: false, msg: usable.msg });
      }
      const client = usable.client;
      
      try {
        // Get all chats and filter for groups
        const groups = await getGroupsFromWeb(usable.client, clientId);
        
        const groupList = await Promise.all(
          groups.map(async (group) => {
            try {
              // Get basic group info
              return {
                groupId: group.id._serialized,
                name: group.name,
                description: group.description || '',
                participantCount: group.participants?.length || 0,
                isAdmin: group.participants?.some(p => 
                  p.id._serialized === client.info?.wid?._serialized && p.isAdmin
                ) || false,
                createdAt: group.createdAt || null,
                lastMessage: group.lastMessage?.body?.substring(0, 50) || 'No messages',
                lastMessageTime: group.lastMessage?.timestamp || null
              };
            } catch (error) {
              console.error(`Error processing group ${group.name}:`, error);
              return {
                groupId: group.id._serialized,
                name: group.name || 'Unknown Group',
                description: 'Error loading details',
                participantCount: 0,
                isAdmin: false,
                createdAt: null,
                lastMessage: 'Error loading',
                lastMessageTime: null
              };
            }
          })
        );

        return res.status(200).json({
          success: true,
          clientId,
          clientName: clients[clientId].name,
          groups: groupList,
          totalGroups: groupList.length,
          msg: `Found ${groupList.length} groups for ${clients[clientId].name}`
        });

      } catch (error) {
        console.error(`Error fetching groups for client ${clientId}:`, error);
        return res.status(503).json({
          success: false,
          msg: error.message || `WhatsApp session ${clientId} could not provide groups`,
          clientId,
          retryable: true,
        });
      }
    }

    // Action 3: Get participants/contacts from a specific group
    if (action === 'participants' && clientId && groupId) {
      // Validate client
      if (!clients[clientId] || !clients[clientId].ready || !clients[clientId].client) {
        return res.status(400).json({ 
          success: false, 
          msg: `Client ${clientId} is not ready or connected` 
        });
      }

      const client = clients[clientId].client;

      try {
        // Get the specific chat by ID
        const chat = await client.groupMetadata(groupId);
        if (!chat?.id) {
          return res.status(400).json({
            success: false,
            msg: 'Provided ID is not a group'
          });
        }

        // Extract participant details
        const participants = await Promise.all(
          (chat.participants || []).map(async (participant) => {
            try {
              // Get contact info for each participant
              const phoneNumber = participant.id.split('@')[0];
              
              return {
                id: participant.id,
                phoneNumber: phoneNumber,
                formattedNumber: formatPhoneNumber(phoneNumber),
                name: phoneNumber,
                isAdmin: ['admin', 'superadmin'].includes(participant.admin),
                isSuperAdmin: participant.admin === 'superadmin',
                profilePicUrl: null, // We'll skip profile pic for performance
                status: '',
                isMe: participant.id === client.user?.id,
                isContact: false
              };
            } catch (error) {
              console.error(`Error processing participant ${participant.id}:`, error);
              const phoneNumber = participant.id.split('@')[0];
              return {
                id: participant.id,
                phoneNumber: phoneNumber,
                formattedNumber: formatPhoneNumber(phoneNumber),
                name: phoneNumber,
                isAdmin: ['admin', 'superadmin'].includes(participant.admin),
                isSuperAdmin: participant.admin === 'superadmin',
                profilePicUrl: null,
                status: '',
                isMe: false,
                isContact: false
              };
            }
          })
        );

        // Extract just phone numbers for easy export
        const phoneNumbers = participants.map(p => p.formattedNumber);
        const validPhoneNumbers = phoneNumbers.filter(num => num && num.length >= 10);

        return res.status(200).json({
          success: true,
          clientId,
          clientName: clients[clientId].name,
          groupInfo: {
            groupId: chat.id,
            name: chat.subject || '',
            description: chat.desc || '',
            participantCount: participants.length,
            createdAt: chat.creation ? new Date(chat.creation * 1000) : null
          },
          participants,
          phoneNumbers: validPhoneNumbers,
          summary: {
            totalParticipants: participants.length,
            validPhoneNumbers: validPhoneNumbers.length,
            admins: participants.filter(p => p.isAdmin).length,
            contacts: participants.filter(p => p.isContact).length
          },
          msg: `Extracted ${validPhoneNumbers.length} valid phone numbers from group "${chat.subject || ''}"`
        });

      } catch (error) {
        console.error(`Error fetching group participants:`, error);
        return res.status(500).json({
          success: false,
          msg: `Failed to fetch group participants: ${error.message}`
        });
      }
    }

    // Invalid action or missing parameters
    return res.status(400).json({
      success: false,
      msg: 'Invalid action or missing required parameters. Use: profiles, list?clientId=X, or participants?clientId=X&groupId=Y'
    });

  } catch (error) {
    console.error('Groups API error:', error);
    return res.status(500).json({
      success: false,
      msg: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Helper function to format phone numbers consistently
 * Handles Indian numbers and international formats
 */
function formatPhoneNumber(number) {
  if (!number) return '';
  
  // Remove any non-numeric characters
  let cleaned = number.replace(/[^0-9]/g, '');
  
  // Handle different formats
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    // Already has country code
    return cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    // Remove leading 0 and add country code
    return '91' + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    // Add Indian country code
    return '91' + cleaned;
  } else if (cleaned.length > 10) {
    // Assume it already has country code
    return cleaned;
  }
  
  return cleaned;
}

/**
 * Helper function to get detailed client status
 */
function getClientStatus(client) {
  if (!client) return 'Not Found';
  if (client.ready && client.client) return 'Connected & Ready';
  if (client.status === 'qr_ready') return 'QR Code Ready';
  if (client.status === 'initializing') return 'Connecting...';
  if (client.status === 'authenticating') return 'Authenticating...';
  if (client.status === 'disconnected') return 'Disconnected';
  if (client.status === 'error') return `Error: ${client.error}`;
  return client.status || 'Unknown';
}
