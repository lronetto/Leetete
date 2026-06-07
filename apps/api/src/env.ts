import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  S3_ENDPOINT: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_PUBLIC_BASE_URL: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),

  COUPLE_NAMES: z.string().default('Stefanie & Leandro'),
  EVENT_DATE: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),

  ADMIN_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  ALLOWED_ADMIN_EMAILS: z.string().min(1),

  PORT: z.coerce.number().int().positive().default(3000),
  STATIC_DIR: z.string().default('./public'),
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  AUTO_MIGRATE: z.enum(['true', 'false']).default('true'),
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
});

export type AppEnv = z.infer<typeof envSchema>;

export interface AppVariables {
  adminEmail: string;
}

export type Bindings = {
  Bindings: AppEnv;
  Variables: AppVariables;
};

export function loadEnv(): AppEnv {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
