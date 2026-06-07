import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DB | null = null;
let pgInstance: ReturnType<typeof postgres> | null = null;

export function initDb(databaseUrl: string): DB {
  if (dbInstance) return dbInstance;
  pgInstance = postgres(databaseUrl, { max: 10, idle_timeout: 30 });
  dbInstance = drizzle(pgInstance, { schema });
  return dbInstance;
}

export function getDb(): DB {
  if (!dbInstance) {
    throw new Error('DB not initialized. Call initDb() before getDb().');
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pgInstance) {
    await pgInstance.end({ timeout: 5 });
    pgInstance = null;
    dbInstance = null;
  }
}
