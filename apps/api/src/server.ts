import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { closeDb, initDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import type { Bindings } from './env.js';
import { loadEnv } from './env.js';
import { initStorage } from './lib/storage-factory.js';

async function main() {
  const env = loadEnv();

  if (env.AUTO_MIGRATE === 'true') {
    console.log('[startup] running migrations');
    await runMigrations(env.DATABASE_URL);
  }

  initDb(env.DATABASE_URL);
  initStorage(env);

  const apiApp = createApp();

  const app = new Hono<Bindings>();
  app.route('/', apiApp);

  app.use(
    '/assets/*',
    serveStatic({
      root: env.STATIC_DIR,
      rewriteRequestPath: (path) => path,
    }),
  );

  for (const f of ['/favicon.ico', '/robots.txt']) {
    app.get(f, serveStatic({ path: `${env.STATIC_DIR}${f}` }));
  }

  app.get('*', serveStatic({ path: `${env.STATIC_DIR}/index.html` }));

  const server = serve(
    {
      fetch: (req) => app.fetch(req, env),
      port: env.PORT,
      hostname: '0.0.0.0',
    },
    (info) => {
      console.log(`[startup] listening on http://0.0.0.0:${info.port}`);
    },
  );

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] received ${signal}`);
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[startup] failed', err);
  process.exit(1);
});
