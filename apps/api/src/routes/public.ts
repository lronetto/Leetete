import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { eventConfig } from '../db/schema.js';
import type { Bindings } from '../env.js';

export const publicRoutes = new Hono<Bindings>();

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
  // TODO: paginated list of approved uploads with public URLs
  return c.json({ items: [], nextCursor: null });
});
