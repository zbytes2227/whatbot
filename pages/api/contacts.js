import ContactList from '@/models/ContactList';
import { verifyAuth } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import formidable from 'formidable';

export const config = { api: { bodyParser: false } };

// Parse multipart form data
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// Tolerant and debug-friendly parser
 function parsePhoneNumbersWithDebug(inputRaw) {
  const debugInfo = {
    originalType: typeof inputRaw,
    originalValue: inputRaw,
    steps: []
  };

  let input = inputRaw;

  if (Array.isArray(input)) {
    debugInfo.steps.push(`Input was array, taking first element`);
    input = input[0] || '';
  }
  if (Buffer.isBuffer(input)) {
    debugInfo.steps.push(`Input was Buffer, converting to string`);
    input = input.toString('utf-8');
  }
  if (typeof input !== 'string') {
    debugInfo.steps.push(`Input was ${typeof input}, converting to string`);
    input = String(input || '');
  }

  debugInfo.cleanedInitial = input;

  if (!input.trim()) {
    debugInfo.error = 'Input text is empty after trimming.';
    return { numbers: [], debug: debugInfo };
  }

  // Step 1: Remove non-ASCII (emoji, Hindi text, fancy spaces)
  input = input.replace(/[^\x00-\x7F]/g, ' ');
  debugInfo.steps.push('Removed non-ASCII characters');

  // Step 2: Remove all punctuation except "+"
  input = input.replace(/[^0-9\+\s]/g, ' ');
  debugInfo.steps.push('Removed all punctuation except + for country code');

  // Step 3: Collapse extra spaces
  input = input.replace(/\s+/g, ' ');
  debugInfo.steps.push('Collapsed multiple spaces');

  // ✅ Step 4: Join split digit groups (so `95983 83398` → `9598383398`)
  input = input.replace(/(\d{5})\s+(\d{5})/g, '$1$2');
  debugInfo.steps.push('Joined split 5-5 digit groups into continuous 10 digits');

  // Step 5: Extract numbers tolerant of +91/91/0
  const regex = /(?:\+91|91|0)?\s*([6-9]\d{9})/g;
  const seen = new Set();
  let match;
  while ((match = regex.exec(input)) !== null) {
    seen.add(match[1]); // store only 10-digit form
  }

  const result = Array.from(seen);
  debugInfo.extracted = result;

  if (result.length === 0) {
    debugInfo.error = 'No valid Indian mobile numbers found after parsing.';
  } else {
    debugInfo.success = `Found ${result.length} valid phone number(s).`;
  }

  return { numbers: result, debug: debugInfo };
}



// Mongo fetch
async function getContactLists(userId) {
  return await ContactList.find({ userId }).lean();
}

// Import contacts
async function importContacts(userId, { listId, listName, phoneNumbers }) {
  if (!phoneNumbers?.length) throw new Error('Phone numbers array is empty');

  if (listId) {
    const list = await ContactList.findOne({ _id: listId, userId });
    if (!list) throw new Error('Contact list not found');

    const existingNumbers = new Set(list.contacts);
    const newNumbers = phoneNumbers.filter(num => !existingNumbers.has(num));
    list.contacts.push(...newNumbers);
    await list.save();
    return list;
  } else {
    if (!listName) throw new Error('List name is required for new contact list');
    const newList = new ContactList({
      userId,
      name: listName,
      description: `Contact list with ${phoneNumbers.length} numbers`,
      contacts: phoneNumbers,
    });
    await newList.save();
    return newList;
  }
}

// Update contact list
async function updateContactList(userId, listId, { name, phoneNumbers }) {
  if (!listId) throw new Error('List ID is required');
  const list = await ContactList.findOne({ _id: listId, userId });
  if (!list) throw new Error('Contact list not found');
  if (name) list.name = name;
  if (phoneNumbers?.length) list.contacts = phoneNumbers;
  await list.save();
  return list;
}

// Delete contact list
async function deleteContactList(userId, listId) {
  const deleted = await ContactList.findOneAndDelete({ _id: listId, userId });
  if (!deleted) throw new Error('Contact list not found or already deleted');
  return deleted;
}

// Main handler
export default async function handler(req, res) {
  try {
    await connectToMongoDB();
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    return res.status(500).json({ success: false, msg: 'Database connection failed' });
  }

  let user;
  try {
    const auth = await verifyAuth(req);
    user = auth.user;
  } catch (err) {
    return res.status(err.status || 401).json({ success: false, msg: err.msg || 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const lists = await getContactLists(user.id);
      return res.status(200).json({ success: true, lists });
    }

    if (req.method === 'POST') {
      const { fields } = await parseForm(req);

      const action = Array.isArray(fields.action) ? fields.action[0] : fields.action;
      let numbersText = Array.isArray(fields.numbers) ? fields.numbers[0] : (fields.numbers || '');
      numbersText = numbersText.toString();

      const listId = Array.isArray(fields.listId) ? fields.listId[0] : (fields.listId || null);
      const listName = Array.isArray(fields.listName) ? fields.listName[0] : (fields.listName || null);
      const name = Array.isArray(fields.name) ? fields.name[0] : (fields.name || null);

      const { numbers: phoneNumbers, debug } = parsePhoneNumbersWithDebug(numbersText);

      if (action === 'import') {
        if (phoneNumbers.length === 0) {
          return res.status(400).json({ success: false, msg: 'No valid phone numbers provided', debug });
        }
        const updatedList = await importContacts(user.id, { listId, listName, phoneNumbers });
        return res.status(200).json({
          success: true,
          list: updatedList,
          msg: `${phoneNumbers.length} phone numbers processed`
        });
      }

      if (action === 'update') {
        if (!listId) return res.status(400).json({ success: false, msg: 'listId is required' });
        const updatedList = await updateContactList(user.id, listId, {
          name,
          phoneNumbers
        });
        return res.status(200).json({ success: true, list: updatedList });
      }

      return res.status(400).json({
        success: false,
        msg: `Invalid action for POST: "${action}". Expected "import" or "update"`,
        receivedFields: Object.keys(fields)
      });
    }

    if (req.method === 'DELETE') {
      const { listId } = req.query;
      if (!listId) return res.status(400).json({ success: false, msg: 'listId query parameter is required' });
      await deleteContactList(user.id, listId);
      return res.status(200).json({ success: true, msg: 'Contact list deleted' });
    }

    res.status(405).json({ success: false, msg: 'Method not allowed' });

  } catch (error) {
    console.error('API /contacts error:', error);
    res.status(500).json({ success: false, msg: error.message || 'Internal server error' });
  }
}
