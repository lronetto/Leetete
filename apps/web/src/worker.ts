import { createApp } from '@leetete/api';
import type { AppEnv } from '@leetete/api/env';

const app = createApp();

export interface Env extends AppEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(req, env, ctx);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
