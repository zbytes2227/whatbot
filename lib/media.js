// lib/media.js
// Validates uploaded attachments by content (magic bytes), never by the
// client-supplied MIME type, and stores them in the Media collection.

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import Media from '@/models/Media';
import { HttpError } from '@/lib/api';

export const MAX_MEDIA_BYTES = Math.min(15, Math.max(1, Number(process.env.MAX_MEDIA_MB || 10))) * 1024 * 1024;

const OFFICE = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function sniffMimeType(buffer, fileName = '') {
  if (!buffer || buffer.length < 12) return null;
  const hex = buffer.subarray(0, 12).toString('hex');
  const ascii = buffer.subarray(0, 12).toString('latin1');
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (ascii.startsWith('%PDF')) return 'application/pdf';
  if (ascii.slice(4, 8) === 'ftyp') return 'video/mp4';
  if (ascii.startsWith('ID3') || hex.startsWith('fffb') || hex.startsWith('fff3')) return 'audio/mpeg';
  if (ascii.startsWith('OggS')) return 'audio/ogg';
  if (hex.startsWith('504b0304')) {
    const ext = String(fileName).toLowerCase().split('.').pop();
    return OFFICE[ext] || null;
  }
  return null;
}

export function mediaKind(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function safeFileName(name) {
  const cleaned = String(name || 'attachment').replace(/[\\/\r\n\0"]/g, '_').trim();
  return cleaned.slice(0, 120) || 'attachment';
}

/** Read a formidable file, validate it, remove the temp file, return media fields. */
export async function readUpload(file) {
  try {
    if (file.size > MAX_MEDIA_BYTES) throw new HttpError(413, `Attachment exceeds ${MAX_MEDIA_BYTES / 1024 / 1024} MB`);
    const buffer = await fs.readFile(file.filepath);
    const mimeType = sniffMimeType(buffer, file.originalFilename);
    if (!mimeType) {
      throw new HttpError(415, 'Unsupported attachment. Use JPG, PNG, WEBP, GIF, MP4, MP3, PDF, DOCX, XLSX or PPTX.');
    }
    return { buffer, mimeType, name: safeFileName(file.originalFilename), size: buffer.length };
  } finally {
    fs.unlink(file.filepath).catch(() => {});
  }
}

export async function storeUpload(file, userId) {
  const upload = await readUpload(file);
  const sha256 = createHash('sha256').update(upload.buffer).digest('hex');
  const existing = await Media.findOne({ userId, sha256 }).select('_id name mimeType size').lean();
  if (existing) return { mediaId: existing._id, mediaType: existing.mimeType, mediaName: upload.name, mediaSize: existing.size };
  const doc = await Media.create({ userId, name: upload.name, mimeType: upload.mimeType, size: upload.size, sha256, data: upload.buffer });
  return { mediaId: doc._id, mediaType: doc.mimeType, mediaName: doc.name, mediaSize: doc.size };
}

export async function cleanupTempFiles(files) {
  for (const value of Object.values(files || {})) {
    for (const file of Array.isArray(value) ? value : [value]) {
      if (file?.filepath) await fs.unlink(file.filepath).catch(() => {});
    }
  }
}
