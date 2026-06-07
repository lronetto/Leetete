import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import {
  uploadConfirmSchema,
  uploadInitSchema,
  type UploadInitResponse,
} from '@leetete/shared';
import { getDb } from '../db/client.js';
import { eventConfig, uploads } from '../db/schema.js';
import type { Bindings } from '../env.js';
import { hashIp, uploadId } from '../lib/ids.js';
import { getStorage } from '../lib/storage-factory.js';

export const uploadsRoutes = new Hono<Bindings>();

const SINGLE_PUT_MAX = 50 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;
const KEY_PREFIX = 'uploads';
const IP_HASH_SALT = 'wedding-uploads-v1';

function extFromFilename(filename: string, mimeType: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot >= 0 && dot < filename.length - 1) {
    const ext = filename.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,6}$/.test(ext)) return ext;
  }
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mimeType.toLowerCase()] ?? 'bin';
}

function buildKey(id: string, filename: string, mimeType: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = extFromFilename(filename, mimeType);
  return `${KEY_PREFIX}/${yyyy}/${mm}/${id}.${ext}`;
}

function getClientIp(c: Context<Bindings>): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  );
}

uploadsRoutes.post('/init', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = uploadInitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const db = getDb();
  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  const event = cfg[0];
  if (!event) return c.json({ error: 'not_configured' }, 500);

  const isVideo = input.mimeType.startsWith('video/');
  if (isVideo && !event.allowVideo) {
    return c.json({ error: 'video_not_allowed' }, 400);
  }
  if (input.sizeBytes > event.maxFileMb * 1024 * 1024) {
    return c.json({ error: 'file_too_large', maxFileMb: event.maxFileMb }, 400);
  }
  if (
    isVideo &&
    input.durationSeconds !== undefined &&
    input.durationSeconds > event.maxVideoSeconds
  ) {
    return c.json({ error: 'video_too_long', maxVideoSeconds: event.maxVideoSeconds }, 400);
  }

  const id = uploadId();
  const storageKey = buildKey(id, input.filename, input.mimeType);
  const storage = getStorage();
  const ipHashValue = await hashIp(getClientIp(c), IP_HASH_SALT);

  if (input.sizeBytes <= SINGLE_PUT_MAX) {
    const presigned = await storage.presignPut({
      key: storageKey,
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
      expiresInSec: 900,
    });

    await db.insert(uploads).values({
      id,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationSeconds: input.durationSeconds ?? null,
      authorName: input.authorName?.trim() || null,
      message: input.message?.trim() || null,
      status: 'pending',
      source: 'guest',
      ipHash: ipHashValue,
    });

    const response: UploadInitResponse = {
      uploadId: id,
      storageKey,
      mode: 'single',
      putUrl: presigned.url,
      putHeaders: presigned.headers,
    };
    return c.json(response);
  }

  const partCount = Math.ceil(input.sizeBytes / PART_SIZE);
  const multipart = await storage.initMultipart({
    key: storageKey,
    contentType: input.mimeType,
    partCount,
    expiresInSec: 3600 * 6,
  });

  await db.insert(uploads).values({
    id,
    storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationSeconds: input.durationSeconds ?? null,
    authorName: input.authorName?.trim() || null,
    message: input.message?.trim() || null,
    status: 'pending',
    source: 'guest',
    ipHash: ipHashValue,
    providerUploadId: multipart.uploadId,
  });

  const response: UploadInitResponse = {
    uploadId: id,
    storageKey,
    mode: 'multipart',
    multipart: {
      providerUploadId: multipart.uploadId,
      partSize: multipart.partSize,
      partUrls: multipart.partUrls,
    },
  };
  return c.json(response);
});

uploadsRoutes.post('/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = uploadConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const rows = await db.select().from(uploads).where(eq(uploads.id, id));
  const upload = rows[0];
  if (!upload) return c.json({ error: 'not_found' }, 404);
  if (upload.status === 'approved') return c.json({ ok: true, alreadyApproved: true });

  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  const event = cfg[0];
  if (!event) return c.json({ error: 'not_configured' }, 500);

  const storage = getStorage();

  if (parsed.data.multipart) {
    if (parsed.data.multipart.providerUploadId !== upload.providerUploadId) {
      return c.json({ error: 'multipart_mismatch' }, 400);
    }
    await storage.completeMultipart({
      key: upload.storageKey,
      uploadId: parsed.data.multipart.providerUploadId,
      parts: parsed.data.multipart.parts,
    });
  }

  const head = await storage.head(upload.storageKey);
  if (!head) {
    return c.json({ error: 'not_uploaded' }, 400);
  }

  const finalStatus = event.moderation === 'pre' ? 'pending' : 'approved';
  await db
    .update(uploads)
    .set({
      status: finalStatus,
      approvedAt: finalStatus === 'approved' ? Date.now() : null,
    })
    .where(eq(uploads.id, id));

  return c.json({ ok: true, status: finalStatus });
});

uploadsRoutes.post('/:id/abort', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const rows = await db.select().from(uploads).where(eq(uploads.id, id));
  const upload = rows[0];
  if (!upload) return c.json({ error: 'not_found' }, 404);

  if (upload.providerUploadId) {
    const storage = getStorage();
    await storage
      .abortMultipart({ key: upload.storageKey, uploadId: upload.providerUploadId })
      .catch(() => {});
  }
  await db.delete(uploads).where(eq(uploads.id, id));
  return c.json({ ok: true });
});
