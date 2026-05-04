import { and, count, desc, eq, lt, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  type AdminStats,
  type AdminUploadsResponse,
  eventConfigUpdateSchema,
} from '@leetete/shared';
import { getDb } from '../db/client.js';
import { eventConfig, uploads } from '../db/schema.js';
import type { Bindings } from '../env.js';
import { requireAdmin } from '../lib/auth.js';
import { createStorage } from '../lib/storage-factory.js';

export const adminRoutes = new Hono<Bindings>();

adminRoutes.use('*', requireAdmin);

const ADMIN_PAGE_SIZE = 30;

adminRoutes.get('/me', (c) => c.json({ email: c.get('adminEmail') }));

adminRoutes.get('/event', async (c) => {
  const db = getDb(c.env.DB);
  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1)).get();
  if (!cfg) return c.json({ error: 'not_configured' }, 404);
  return c.json({
    coupleNames: cfg.coupleNames,
    eventDate: cfg.eventDate,
    coverKey: cfg.coverKey,
    galleryVisibility: cfg.galleryVisibility,
    moderation: cfg.moderation,
    maxFileMb: cfg.maxFileMb,
    allowVideo: cfg.allowVideo,
    maxVideoSeconds: cfg.maxVideoSeconds,
    welcomeMessage: cfg.welcomeMessage,
    updatedAt: cfg.updatedAt,
  });
});

adminRoutes.patch('/event', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = eventConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const db = getDb(c.env.DB);
  await db
    .update(eventConfig)
    .set({
      ...parsed.data,
      updatedAt: Date.now(),
    })
    .where(eq(eventConfig.id, 1));
  return c.json({ ok: true });
});

adminRoutes.get('/uploads', async (c) => {
  const db = getDb(c.env.DB);
  const status = c.req.query('status') as 'pending' | 'approved' | 'rejected' | undefined;
  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? Number(cursorParam) : null;
  const limit = Math.min(Number(c.req.query('limit') ?? ADMIN_PAGE_SIZE), 100);

  const filters = [];
  if (status) filters.push(eq(uploads.status, status));
  if (cursor !== null && Number.isFinite(cursor)) {
    filters.push(lt(uploads.createdAt, cursor));
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(uploads)
    .where(where)
    .orderBy(desc(uploads.createdAt))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const storage = createStorage(c.env);

  const items = slice.map((row) => ({
    id: row.id,
    url: storage.publicUrl(row.storageKey),
    thumbnailUrl: row.thumbnailKey ? storage.publicUrl(row.thumbnailKey) : null,
    mimeType: row.mimeType,
    isVideo: row.mimeType.startsWith('video/'),
    sizeBytes: row.sizeBytes,
    durationSeconds: row.durationSeconds,
    authorName: row.authorName,
    message: row.message,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  }));

  const nextCursor = hasMore ? String(slice[slice.length - 1]!.createdAt) : null;
  return c.json({ items, nextCursor } satisfies AdminUploadsResponse);
});

adminRoutes.post('/uploads/:id/approve', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const result = await db
    .update(uploads)
    .set({ status: 'approved', approvedAt: Date.now() })
    .where(eq(uploads.id, id))
    .returning({ id: uploads.id });
  if (!result.length) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.post('/uploads/:id/reject', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const result = await db
    .update(uploads)
    .set({ status: 'rejected', approvedAt: null })
    .where(eq(uploads.id, id))
    .returning({ id: uploads.id });
  if (!result.length) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.delete('/uploads/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb(c.env.DB);
  const row = await db.select().from(uploads).where(eq(uploads.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const storage = createStorage(c.env);
  await storage.delete(row.storageKey).catch((err) => {
    console.warn('failed to delete from storage', row.storageKey, err);
  });
  if (row.thumbnailKey) {
    await storage.delete(row.thumbnailKey).catch(() => {});
  }
  await db.delete(uploads).where(eq(uploads.id, id));
  return c.json({ ok: true });
});

adminRoutes.get('/stats', async (c) => {
  const db = getDb(c.env.DB);
  const all = await db
    .select({
      status: uploads.status,
      mimeType: uploads.mimeType,
      sizeBytes: uploads.sizeBytes,
    })
    .from(uploads)
    .all();

  const stats: AdminStats = {
    total: all.length,
    approved: 0,
    pending: 0,
    rejected: 0,
    photos: 0,
    videos: 0,
    totalBytes: 0,
  };
  for (const r of all) {
    stats[r.status]++;
    if (r.mimeType.startsWith('image/')) stats.photos++;
    else if (r.mimeType.startsWith('video/')) stats.videos++;
    stats.totalBytes += r.sizeBytes;
  }
  return c.json(stats);
});

adminRoutes.get('/export.zip', async (c) => {
  return c.json({ error: 'not_implemented_yet' }, 501);
});

adminRoutes.post('/imports', async (c) => {
  return c.json({ error: 'not_implemented_yet' }, 501);
});
