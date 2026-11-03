// Serves a stored campaign attachment to the dashboard (for previews).
import Media from '@/models/Media';
import { HttpError, requireObjectId, withApi } from '@/lib/api';

export default withApi(async (req, res, { user }) => {
  requireObjectId(req.query.id, 'media id');
  const media = await Media.findOne({ _id: req.query.id, userId: user.id }).lean();
  if (!media) throw new HttpError(404, 'Attachment not found');
  const data = Buffer.from(media.data.buffer || media.data);
  const inline = media.mimeType.startsWith('image/') || media.mimeType.startsWith('video/') || media.mimeType.startsWith('audio/');
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Content-Length', String(data.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${media.name.replace(/[^\w.\- ]/g, '_')}"`);
  return res.status(200).send(data);
}, { methods: ['GET'], name: 'media' });
