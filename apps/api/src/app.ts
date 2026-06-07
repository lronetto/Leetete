import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './env.js';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes } from './routes/public.js';
import { uploadsRoutes } from './routes/uploads.js';

export function createApp() {
  const app = new Hono<Bindings>().basePath('/api');

  app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }));

  app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

  app.route('/', publicRoutes);
  app.route('/uploads', uploadsRoutes);
  app.route('/admin', adminRoutes);

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((err, c) => {
    console.error('unhandled', err);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
