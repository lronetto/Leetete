import { and, desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { GalleryResponse } from '@leetete/shared';
import { getDb } from '../db/client.js';
import { eventConfig, uploads } from '../db/schema.js';
import type { Bindings } from '../env.js';
import { generateQrPng, generateQrSvg } from '../lib/qrcode.js';
import { generateQrPdf } from '../lib/qr-pdf.js';
import { createStorage } from '../lib/storage-factory.js';

export const publicRoutes = new Hono<Bindings>();

const GALLERY_PAGE_SIZE = 24;

publicRoutes.get('/event', async (c) => {
  const db = getDb(c.env.DB);
  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1)).get();
  if (!cfg) return c.json({ error: 'not_configured' }, 404);
  return c.json({
    coupleNames: cfg.coupleNames,
    eventDate: cfg.eventDate,
    welcomeMessage: cfg.welcomeMessage,
    galleryVisibility: cfg.galleryVisibility,
    allowVideo: cfg.allowVideo,
    maxFileMb: cfg.maxFileMb,
    maxVideoSeconds: cfg.maxVideoSeconds,
  });
});

publicRoutes.get('/gallery', async (c) => {
  const db = getDb(c.env.DB);
  const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1)).get();
  if (!cfg) return c.json({ items: [], nextCursor: null } satisfies GalleryResponse);
  if (cfg.galleryVisibility !== 'public') {
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
    authorName: row.authorName,
    message: row.message,
    createdAt: row.createdAt,
  }));

  const nextCursor = hasMore ? String(slice[slice.length - 1]!.createdAt) : null;
  return c.json({ items, nextCursor } satisfies GalleryResponse);
});

publicRoutes.get('/qrcode', async (c) => {
  const format = (c.req.query('format') ?? 'png').toLowerCase();
  const overrideUrl = c.req.query('url');

  const reqUrl = new URL(c.req.url);
  const base = overrideUrl ?? `${reqUrl.protocol}//${reqUrl.host}`;
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
    const db = getDb(c.env.DB);
    const cfg = await db.select().from(eventConfig).where(eq(eventConfig.id, 1)).get();
    const pdf = await generateQrPdf({
      url: target,
      coupleNames: cfg?.coupleNames ?? c.env.COUPLE_NAMES,
      eventDate: cfg?.eventDate ?? c.env.EVENT_DATE,
    });
    return new Response(pdf as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="qr-mesa.pdf"',
        'cache-control': 'no-store',
      },
    });
  }

  const png = await generateQrPng(target, 800);
  return new Response(png as BodyInit, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300',
    },
  });
});

publicRoutes.get('/stats', async (c) => {
  const db = getDb(c.env.DB);
  const all = await db
    .select({ id: uploads.id, mimeType: uploads.mimeType })
    .from(uploads)
    .where(eq(uploads.status, 'approved'))
    .all();
  const photos = all.filter((u) => u.mimeType.startsWith('image/')).length;
  const videos = all.filter((u) => u.mimeType.startsWith('video/')).length;
  return c.json({ photos, videos, total: all.length });
});
