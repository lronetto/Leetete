import { createApp } from '@leetete/api';
import type { AppEnv } from '@leetete/api/env';

const app = createApp();

export const onRequest: PagesFunction<AppEnv> = (ctx) =>
  app.fetch(ctx.request, ctx.env, ctx as unknown as ExecutionContext);
