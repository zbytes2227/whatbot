import mongoose from 'mongoose';
import Campaign from '@/models/Campaigns';
import ContactList from '@/models/ContactList';
import { HttpError, badRequest, requireObjectId, str, withApi } from '@/lib/api';
import { csvRow, startCsvDownload } from '@/lib/csv';
import { extractPhones, MAX_NUMBERS_PER_LIST, normalizePhone } from '@/lib/phone';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

const ACTIVE_STATUSES = ['pending', 'running', 'paused', 'scheduled', 'needs_review'];

function parseNumbers(input) {
  if (Array.isArray(input)) {
    const seen = new Set();
    const numbers = [];
    let invalid = 0;
    for (const raw of input.slice(0, MAX_NUMBERS_PER_LIST * 2)) {
      const n = normalizePhone(raw);
      if (!n) invalid += 1;
      else if (!seen.has(n)) {
        seen.add(n);
        numbers.push(n);
      }
    }
    return { numbers, invalid };
  }
  return extractPhones(typeof input === 'string' ? input : '');
}

async function findOwned(listId, user, projection) {
  requireObjectId(listId, 'list id');
  const list = await ContactList.findOne({ _id: listId, userId: user.id }).select(projection || '');
  if (!list) throw new HttpError(404, 'Contact list not found');
  return list;
}

function mergeNumbers(existing, incoming) {
  const seen = new Set();
  const merged = [];
  for (const raw of existing) {
    const n = normalizePhone(raw) || String(raw);
    if (!seen.has(n)) {
      seen.add(n);
      merged.push(n);
    }
  }
  let added = 0;
  for (const n of incoming) {
    if (!seen.has(n)) {
      seen.add(n);
      merged.push(n);
      added += 1;
    }
  }
  return { merged, added };
}

function assertSize(count) {
  if (count > MAX_NUMBERS_PER_LIST) throw badRequest(`A list can hold at most ${MAX_NUMBERS_PER_LIST.toLocaleString()} numbers`);
}

export default withApi(async (req, res, { user, logger }) => {
  if (req.method === 'GET') {
    const { listId, format } = req.query;

    if (listId) {
      const list = await findOwned(listId, user);
      if (format === 'csv') {
        startCsvDownload(res, `${list.name}.csv`);
        res.write(csvRow(['number']));
        for (const n of list.contacts) res.write(csvRow([n]));
        return res.end();
      }
      return res.status(200).json({ success: true, list });
    }

    const [lists, usage] = await Promise.all([
      ContactList.aggregate([
        { $match: { userId: user.id } },
        { $project: { name: 1, description: 1, createdAt: 1, updatedAt: 1, count: { $size: { $ifNull: ['$contacts', []] } }, preview: { $slice: [{ $ifNull: ['$contacts', []] }, 3] } } },
        { $sort: { createdAt: -1 } },
      ]),
      Campaign.aggregate([
        { $match: { userId: user.id } },
        { $group: { _id: '$contactList', total: { $sum: 1 }, active: { $sum: { $cond: [{ $in: ['$status', ACTIVE_STATUSES] }, 1, 0] } } } },
      ]),
    ]);
    const usageMap = new Map(usage.map((u) => [String(u._id), u]));
    return res.status(200).json({
      success: true,
      lists: lists.map((l) => ({ ...l, campaigns: usageMap.get(String(l._id))?.total || 0, activeCampaigns: usageMap.get(String(l._id))?.active || 0 })),
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action;

    if (action === 'preview') {
      const { numbers, invalid } = parseNumbers(body.numbers);
      return res.status(200).json({ success: true, valid: numbers.length, invalid, sample: numbers.slice(0, 10) });
    }

    if (action === 'create') {
      const name = str(body.name, { max: 120 });
      if (!name) throw badRequest('List name is required');
      const { numbers, invalid } = parseNumbers(body.numbers);
      if (!numbers.length) throw badRequest('No valid phone numbers found');
      assertSize(numbers.length);
      const list = await ContactList.create({ userId: user.id, name, description: str(body.description, { max: 500 }), contacts: numbers });
      logger.info('Contact list created', { listId: String(list._id), count: numbers.length });
      return res.status(201).json({ success: true, listId: list._id, added: numbers.length, invalid, msg: `Created "${name}" with ${numbers.length} numbers` });
    }

    if (action === 'append') {
      const list = await findOwned(body.listId, user);
      const { numbers, invalid } = parseNumbers(body.numbers);
      if (!numbers.length) throw badRequest('No valid phone numbers found');
      const { merged, added } = mergeNumbers(list.contacts, numbers);
      assertSize(merged.length);
      list.contacts = merged;
      await list.save();
      return res.status(200).json({ success: true, added, duplicates: numbers.length - added, invalid, total: merged.length, msg: `Added ${added} new numbers` });
    }

    if (action === 'update') {
      const list = await findOwned(body.listId, user);
      const name = str(body.name, { max: 120 });
      if (name) list.name = name;
      if (body.description !== undefined) list.description = str(body.description, { max: 500 });
      let invalid = 0;
      if (body.numbers !== undefined) {
        const parsed = parseNumbers(body.numbers);
        if (!parsed.numbers.length) throw badRequest('A list must contain at least one valid number');
        assertSize(parsed.numbers.length);
        const active = await Campaign.exists({ contactList: list._id, status: { $in: ['running', 'paused', 'needs_review'] }, processedNumbers: { $gt: 0 } });
        if (active) throw new HttpError(409, 'This list is used by a campaign in progress. Add numbers instead of replacing them, or stop the campaign first.');
        list.contacts = parsed.numbers;
        invalid = parsed.invalid;
      }
      await list.save();
      return res.status(200).json({ success: true, total: list.contacts.length, invalid, msg: 'Contact list updated' });
    }

    if (action === 'removeNumbers') {
      const list = await findOwned(body.listId, user);
      const remove = new Set(parseNumbers(body.numbers).numbers);
      const before = list.contacts.length;
      list.contacts = list.contacts.filter((raw) => !remove.has(normalizePhone(raw) || raw));
      if (!list.contacts.length) throw badRequest('A list must keep at least one number. Delete the list instead.');
      await list.save();
      return res.status(200).json({ success: true, removed: before - list.contacts.length, total: list.contacts.length });
    }

    throw badRequest('Unknown action');
  }

  // DELETE
  const list = await findOwned(req.query.listId, user, '_id name');
  const inUse = await Campaign.countDocuments({ contactList: new mongoose.Types.ObjectId(String(list._id)), status: { $in: ACTIVE_STATUSES } });
  if (inUse) throw new HttpError(409, `This list is used by ${inUse} active campaign(s). Stop or delete them first.`);
  await ContactList.deleteOne({ _id: list._id });
  logger.info('Contact list deleted', { listId: String(list._id) });
  return res.status(200).json({ success: true, msg: 'Contact list deleted' });
}, { methods: ['GET', 'POST', 'DELETE'], name: 'contacts' });
