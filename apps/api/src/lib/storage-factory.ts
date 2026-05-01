import type { AppEnv } from '../env.js';
import { S3Storage } from './storage-s3.js';
import type { StorageProvider } from './storage.js';

export function createStorage(env: AppEnv): StorageProvider {
  return new S3Storage({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  });
}
