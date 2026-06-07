import { and, desc, eq, ilike, inArray, like, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  adminBulkSchema,
  adminUploadUpdateSchema,
  eventConfigUpdateSchema,
  type AdminStats,
  type AdminUploadsResponse,
} from '@leetete/shared';
import { getDb } from '../db/client.js';
import { eventConfig, uploads } from '../db/schema.js';
import type { Bindings } from '../env.js';
import {
  createSession,
  destroySession,
  requireAdmin,
  timingSafeEqual,
} from '../lib/auth.js';
import { getStorage } from '../lib/storage-factory.js';

export const adminRoutes = new Hono<Bindings>();

const ADMIN_PAGE_SIZE = 30;

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

adminRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const allowed = c.env.ALLOWED_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase());
  const emailOk = allowed.includes(parsed.data.email);
  const passwordOk = await timingSafeEqual(parsed.data.password, c.env.ADMIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await createSession(c, parsed.data.email);
  return c.json({ ok: true, email: parsed.data.email });
});

adminRoutes.post('/logout', async (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/me', (c) => c.json({ email: c.get('adminEmail') }));

adminRoutes.get('/event', async (c) => {
  const db = getDb();
  const rows = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  const row = rows[0];
  if (!row) return c.json({ error: 'not_configured' }, 404);
  const storage = getStorage();
  return c.json({
    coupleNames: row.coupleNames,
    eventDate: row.eventDate,
    coverKey: row.coverKey,
    coverUrl: row.coverKey ? storage.publicUrl(row.coverKey) : null,
    galleryVisibility: row.galleryVisibility,
    moderation: row.moderation,
    maxFileMb: row.maxFileMb,
    allowVideo: row.allowVideo,
    maxVideoSeconds: row.maxVideoSeconds,
    welcomeMessage: row.welcomeMessage,
    updatedAt: row.updatedAt,
  });
});

adminRoutes.patch('/event', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = eventConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const db = getDb();
  await db
    .update(eventConfig)
    .set({ ...parsed.data, updatedAt: Date.now() })
    .where(eq(eventConfig.id, 1));
  return c.json({ ok: true });
});

adminRoutes.get('/uploads', async (c) => {
  const db = getDb();
  const status = c.req.query('status') as 'pending' | 'approved' | 'rejected' | undefined;
  const kind = c.req.query('kind') as 'photo' | 'video' | undefined;
  const q = c.req.query('q')?.trim();
  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? Number(cursorParam) : null;
  const limit = Math.min(Number(c.req.query('limit') ?? ADMIN_PAGE_SIZE), 100);

  const filters = [];
  if (status) filters.push(eq(uploads.status, status));
  if (cursor !== null && Number.isFinite(cursor)) {
    filters.push(lt(uploads.createdAt, cursor));
  }
  if (kind === 'photo') filters.push(like(uploads.mimeType, 'image/%'));
  if (kind === 'video') filters.push(like(uploads.mimeType, 'video/%'));
  if (q && q.length > 0) {
    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const cond = or(
      ilike(uploads.authorName, pattern),
      ilike(uploads.message, pattern),
    );
    if (cond) filters.push(cond);
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(uploads)
    .where(where)
    .orderBy(desc(uploads.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const storage = getStorage();

  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  const coverKey = cfg[0]?.coverKey ?? null;

  const items = slice.map((r) => ({
    id: r.id,
    url: storage.publicUrl(r.storageKey),
    thumbnailUrl: r.thumbnailKey ? storage.publicUrl(r.thumbnailKey) : null,
    storageKey: r.storageKey,
    mimeType: r.mimeType,
    isVideo: r.mimeType.startsWith('video/'),
    sizeBytes: r.sizeBytes,
    durationSeconds: r.durationSeconds,
    authorName: r.authorName,
    message: r.message,
    status: r.status,
    source: r.source,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
    isCover: coverKey === r.storageKey,
  }));

  const nextCursor = hasMore ? String(slice[slice.length - 1]!.createdAt) : null;
  return c.json({ items, nextCursor } satisfies AdminUploadsResponse);
});

adminRoutes.patch('/uploads/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = adminUploadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const updates: Record<string, string | null> = {};
  if (parsed.data.authorName !== undefined) {
    updates['authorName'] = parsed.data.authorName?.trim() || null;
  }
  if (parsed.data.message !== undefined) {
    updates['message'] = parsed.data.message?.trim() || null;
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ ok: true, noop: true });
  }

  const db = getDb();
  const result = await db
    .update(uploads)
    .set(updates)
    .where(eq(uploads.id, id))
    .returning({ id: uploads.id });
  if (!result.length) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.post('/uploads/:id/approve', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
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
  const db = getDb();
  const result = await db
    .update(uploads)
    .set({ status: 'rejected', approvedAt: null })
    .where(eq(uploads.id, id))
    .returning({ id: uploads.id });
  if (!result.length) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.post('/uploads/:id/cover', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const rows = await db.select().from(uploads).where(eq(uploads.id, id));
  const row = rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  await db
    .update(eventConfig)
    .set({ coverKey: row.storageKey, updatedAt: Date.now() })
    .where(eq(eventConfig.id, 1));
  return c.json({ ok: true });
});

adminRoutes.delete('/event/cover', async (c) => {
  const db = getDb();
  await db
    .update(eventConfig)
    .set({ coverKey: null, updatedAt: Date.now() })
    .where(eq(eventConfig.id, 1));
  return c.json({ ok: true });
});

adminRoutes.delete('/uploads/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const rows = await db.select().from(uploads).where(eq(uploads.id, id));
  const row = rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);

  const storage = getStorage();
  await storage.delete(row.storageKey).catch((err) => {
    console.warn('failed to delete from storage', row.storageKey, err);
  });
  if (row.thumbnailKey) {
    await storage.delete(row.thumbnailKey).catch(() => {});
  }
  await db.delete(uploads).where(eq(uploads.id, id));

  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  if (cfg[0]?.coverKey === row.storageKey) {
    await db.update(eventConfig).set({ coverKey: null }).where(eq(eventConfig.id, 1));
  }
  return c.json({ ok: true });
});

adminRoutes.post('/uploads/bulk', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = adminBulkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const storage = getStorage();

  if (parsed.data.action === 'delete') {
    const rows = await db
      .select()
      .from(uploads)
      .where(inArray(uploads.id, parsed.data.ids));
    await Promise.all(
      rows.map((r) => storage.delete(r.storageKey).catch(() => {})),
    );
    await db.delete(uploads).where(inArray(uploads.id, parsed.data.ids));

    const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
    if (cfg[0]?.coverKey && rows.some((r) => r.storageKey === cfg[0]!.coverKey)) {
      await db.update(eventConfig).set({ coverKey: null }).where(eq(eventConfig.id, 1));
    }
  } else {
    const status = parsed.data.action === 'approve' ? 'approved' : 'rejected';
    const approvedAt = status === 'approved' ? Date.now() : null;
    await db
      .update(uploads)
      .set({ status, approvedAt })
      .where(inArray(uploads.id, parsed.data.ids));
  }

  return c.json({ ok: true, count: parsed.data.ids.length });
});

adminRoutes.get('/stats', async (c) => {
  const db = getDb();
  const all = await db
    .select({
      status: uploads.status,
      mimeType: uploads.mimeType,
      sizeBytes: uploads.sizeBytes,
    })
    .from(uploads);

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
