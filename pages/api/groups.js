// /api/groups.js
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { HttpError, withApi } from '@/lib/api';
import { clients, getReadyClientIds, serializeClient } from '@/lib/whatsappClients';

function requireReadyClient(clientId) {
  if (typeof clientId !== 'string' || !clients[clientId]) throw new HttpError(400, 'Unknown WhatsApp profile');
  if (!getReadyClientIds([clientId]).length) throw new HttpError(409, 'This profile is not connected. Connect it on the WhatsApp Profiles page.');
  return clients[clientId].client;
}

// Baileys v7 groups may address members by LID ("123@lid"), which is not a
// phone number. Prefer the phone-number JID whenever WhatsApp provides it.
function participantPhone(participant) {
  const candidates = [participant.phoneNumber, participant.jid, participant.id];
  const pn = candidates.find((j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  return pn ? pn.split('@')[0].split(':')[0] : null;
}

function selfIds(sock) {
  return new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map((id) => jidNormalizedUser(id)));
}

export default withApi(async (req, res) => {
  const { action, clientId, groupId } = req.query;

  if (action === 'profiles') {
    return res.status(200).json({ success: true, profiles: Object.values(clients).filter((c) => c.ready && c.client).map(serializeClient) });
  }

  if (action === 'list') {
    const sock = requireReadyClient(clientId);
    const me = selfIds(sock);
    const groups = Object.values(await sock.groupFetchAllParticipating());
    return res.status(200).json({
      success: true,
      groups: groups
        .map((g) => ({
          groupId: g.id,
          name: g.subject || 'Unnamed group',
          description: g.desc || '',
          participantCount: g.participants?.length || g.size || 0,
          isAdmin: (g.participants || []).some((p) => me.has(jidNormalizedUser(p.id)) && !!p.admin),
          createdAt: g.creation ? new Date(g.creation * 1000) : null,
          announce: !!g.announce,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  if (action === 'participants') {
    const sock = requireReadyClient(clientId);
    if (typeof groupId !== 'string' || !groupId.endsWith('@g.us')) throw new HttpError(400, 'Invalid group');
    const meta = await sock.groupMetadata(groupId);
    const me = selfIds(sock);
    const participants = (meta.participants || []).map((p) => {
      const phone = participantPhone(p);
      return {
        id: p.id,
        phoneNumber: phone,
        hidden: !phone,
        isAdmin: !!p.admin,
        isSuperAdmin: p.admin === 'superadmin',
        isMe: me.has(jidNormalizedUser(p.id)),
      };
    });
    const phoneNumbers = participants.filter((p) => p.phoneNumber && !p.isMe).map((p) => p.phoneNumber);
    return res.status(200).json({
      success: true,
      group: { groupId: meta.id, name: meta.subject || '', description: meta.desc || '', createdAt: meta.creation ? new Date(meta.creation * 1000) : null },
      participants,
      phoneNumbers,
      summary: {
        total: participants.length,
        withNumber: phoneNumbers.length,
        hidden: participants.filter((p) => p.hidden).length,
        admins: participants.filter((p) => p.isAdmin).length,
      },
    });
  }

  throw new HttpError(400, 'Unknown action');
}, { methods: ['GET'], db: false, name: 'groups' });
