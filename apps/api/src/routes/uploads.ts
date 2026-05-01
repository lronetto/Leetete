import { Hono } from 'hono';
import type { Bindings } from '../env.js';

export const uploadsRoutes = new Hono<Bindings>();

// POST /api/uploads/init
// Body: UploadInit (zod schema in @leetete/shared)
// - validates Turnstile
// - reads event_config (rejects if file too big / video disabled / over duration)
// - decides single vs multipart based on sizeBytes (threshold ~50 MB)
// - creates row in `uploads` (status pending)
// - returns presigned PUT or multipart presigned URLs
uploadsRoutes.post('/init', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

// POST /api/uploads/:id/confirm
// Body: UploadConfirm
// - if multipart: completeMultipart on storage
// - verifies object exists via head()
// - sets status based on event_config.moderation
uploadsRoutes.post('/:id/confirm', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});

// POST /api/uploads/:id/abort
// Cancels a pending multipart upload (cleanup).
uploadsRoutes.post('/:id/abort', async (c) => {
  return c.json({ error: 'not_implemented' }, 501);
});
