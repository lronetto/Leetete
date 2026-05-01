import { Hono } from 'hono';
import type { Bindings } from '../env.js';
import { requireAdmin } from '../lib/auth.js';

export const adminRoutes = new Hono<Bindings>();

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/me', (c) => c.json({ email: c.get('adminEmail') }));

// Event configuration
adminRoutes.get('/event', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

adminRoutes.patch('/event', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

// Uploads moderation / management
adminRoutes.get('/uploads', async (c) => {
  return c.json({ items: [], nextCursor: null });
});

adminRoutes.post('/uploads/:id/approve', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

adminRoutes.post('/uploads/:id/reject', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

adminRoutes.delete('/uploads/:id', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

// QR code: ?format=png|svg|pdf (PDF = imprimível em A6 com nome do casal)
adminRoutes.get('/qrcode', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

// Bulk import (post-event): pre-signs URLs in batches so the couple
// can upload files from a folder later (works for R2 today, MinIO later).
adminRoutes.post('/imports', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

// Streamed ZIP export of all uploads.
adminRoutes.get('/export.zip', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});
