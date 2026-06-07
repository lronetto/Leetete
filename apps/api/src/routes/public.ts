import { and, desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { GalleryResponse } from '@leetete/shared';
import { getDb } from '../db/client.js';
import { eventConfig, uploads } from '../db/schema.js';
import type { Bindings } from '../env.js';
import { generateQrPdf } from '../lib/qr-pdf.js';
import { generateQrPng, generateQrSvg } from '../lib/qrcode.js';
import { getStorage } from '../lib/storage-factory.js';

export const publicRoutes = new Hono<Bindings>();

const GALLERY_PAGE_SIZE = 24;

publicRoutes.get('/event', async (c) => {
  const db = getDb();
  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  const row = cfg[0];
  if (!row) return c.json({ error: 'not_configured' }, 404);
  const storage = getStorage();
  return c.json({
    coupleNames: row.coupleNames,
    eventDate: row.eventDate,
    welcomeMessage: row.welcomeMessage,
    galleryVisibility: row.galleryVisibility,
    allowVideo: row.allowVideo,
    maxFileMb: row.maxFileMb,
    maxVideoSeconds: row.maxVideoSeconds,
    coverUrl: row.coverKey ? storage.publicUrl(row.coverKey) : null,
  });
});

publicRoutes.get('/gallery', async (c) => {
  const db = getDb();
  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
  const row = cfg[0];
  if (!row || row.galleryVisibility !== 'public') {
    return c.json({ items: [], nextCursor: null } satisfies GalleryResponse);
  }

  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? Number(cursorParam) : null;
  const limit = Math.min(Number(c.req.query('limit') ?? GALLERY_PAGE_SIZE), 60);

  const baseCondition = eq(uploads.status, 'approved');
  const where =
    cursor !== null && Number.isFinite(cursor)
      ? and(baseCondition, lt(uploads.createdAt, cursor))
      : baseCondition;

  const rows = await db
    .select()
    .from(uploads)
    .where(where)
    .orderBy(desc(uploads.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const storage = getStorage();

  const items = slice.map((r) => ({
    id: r.id,
    url: storage.publicUrl(r.storageKey),
    thumbnailUrl: r.thumbnailKey ? storage.publicUrl(r.thumbnailKey) : null,
    mimeType: r.mimeType,
    isVideo: r.mimeType.startsWith('video/'),
    authorName: r.authorName,
    message: r.message,
    createdAt: r.createdAt,
  }));

  const nextCursor = hasMore ? String(slice[slice.length - 1]!.createdAt) : null;
  return c.json({ items, nextCursor } satisfies GalleryResponse);
});

publicRoutes.get('/qrcode', async (c) => {
  const format = (c.req.query('format') ?? 'png').toLowerCase();
  const overrideUrl = c.req.query('url');

  const reqUrl = new URL(c.req.url);
  const base = overrideUrl ?? c.env.PUBLIC_BASE_URL ?? `${reqUrl.protocol}//${reqUrl.host}`;
  const target = base.replace(/\/$/, '') + '/enviar';

  if (format === 'svg') {
    const svg = await generateQrSvg(target);
    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  }

  if (format === 'pdf') {
    const db = getDb();
    const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1));
    const row = cfg[0];
    const pdf = await generateQrPdf({
      url: target,
      coupleNames: row?.coupleNames ?? c.env.COUPLE_NAMES,
      eventDate: row?.eventDate ?? c.env.EVENT_DATE,
    });
    return new Response(pdf, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="qr-mesa.pdf"',
        'cache-control': 'no-store',
      },
    });
  }

  const png = await generateQrPng(target, 800);
  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300',
    },
  });
});

publicRoutes.get('/stats', async (c) => {
  const db = getDb();
  const all = await db
    .select({ id: uploads.id, mimeType: uploads.mimeType })
    .from(uploads)
    .where(eq(uploads.status, 'approved'));
  const photos = all.filter((u) => u.mimeType.startsWith('image/')).length;
  const videos = all.filter((u) => u.mimeType.startsWith('video/')).length;
  return c.json({ photos, videos, total: all.length });
});
