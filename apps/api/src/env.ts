import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface AppEnv {
  DB: D1Database;
  MEDIA: R2Bucket;

  S3_ENDPOINT: string;
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_PUBLIC_BASE_URL: string;
  S3_FORCE_PATH_STYLE?: string;

  COUPLE_NAMES: string;
  EVENT_DATE?: string;
  PUBLIC_BASE_URL: string;

  TURNSTILE_SECRET: string;
  CF_ACCESS_TEAM: string;
  CF_ACCESS_AUD: string;
  ALLOWED_ADMIN_EMAILS: string;
}

export interface AppVariables {
  adminEmail: string;
}

export type Bindings = {
  Bindings: AppEnv;
  Variables: AppVariables;
};
