import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const dir = join(__dirname, 'migrations');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const hash = sha256(content);

      const existing = await sql<{ sha256: string }[]>`
        SELECT sha256 FROM schema_migrations WHERE name = ${file}
      `;

      if (existing.length) {
        if (existing[0]!.sha256 !== hash) {
          throw new Error(
            `Migration ${file} has been modified after being applied. ` +
              `Add a new migration file instead.`,
          );
        }
        console.log(`[migrate] skip ${file}`);
        continue;
      }

      console.log(`[migrate] apply ${file}`);
      await sql.unsafe(content);
      await sql`
        INSERT INTO schema_migrations (name, sha256) VALUES (${file}, ${hash})
      `;
    }

    console.log('[migrate] done');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
