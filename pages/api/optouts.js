import OptOut from '@/models/OptOut';
import { badRequest, escapeRegex, intInRange, str, withApi } from '@/lib/api';
import { csvRow, startCsvDownload } from '@/lib/csv';
import { extractPhones, normalizePhone } from '@/lib/phone';

export default withApi(async (req, res, { logger }) => {
  if (req.method === 'GET') {
    const search = str(req.query.search, { max: 30 }).replace(/[^0-9]/g, '');
    const filter = search ? { number: { $regex: escapeRegex(search) } } : {};

    if (req.query.format === 'csv') {
      startCsvDownload(res, 'opt-outs.csv');
      res.write(csvRow(['number', 'source', 'reason', 'added_at']));
      for await (const row of OptOut.find(filter).sort({ createdAt: -1 }).lean().cursor()) {
        res.write(csvRow([row.number, row.source, row.reason, row.createdAt]));
      }
      return res.end();
    }

    const page = intInRange(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = intInRange(req.query.limit, { min: 5, max: 100, fallback: 25 });
    const [total, items] = await Promise.all([
      OptOut.countDocuments(filter),
      OptOut.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return res.status(200).json({ success: true, items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }

  if (req.method === 'POST') {
    const { numbers } = extractPhones(typeof req.body?.numbers === 'string' ? req.body.numbers : '');
    if (!numbers.length) throw badRequest('No valid phone numbers found');
    if (numbers.length > 50000) throw badRequest('Add at most 50,000 numbers at a time');
    const reason = str(req.body?.reason, { max: 300 }) || 'Added manually';
    const result = await OptOut.bulkWrite(
      numbers.map((number) => ({ updateOne: { filter: { number }, update: { $setOnInsert: { number, reason, source: 'manual' } }, upsert: true } })),
      { ordered: false }
    );
    logger.info('Opt-outs added', { count: result.upsertedCount });
    return res.status(200).json({ success: true, added: result.upsertedCount, existing: numbers.length - result.upsertedCount });
  }

  // DELETE
  const number = normalizePhone(req.query.number);
  if (!number) throw badRequest('Invalid number');
  await OptOut.deleteOne({ number });
  return res.status(200).json({ success: true });
}, { methods: ['GET', 'POST', 'DELETE'], name: 'optouts' });
