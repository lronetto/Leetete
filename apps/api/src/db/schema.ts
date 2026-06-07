import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const eventConfig = pgTable('event_config', {
  id: integer('id').primaryKey().default(1),
  coupleNames: text('couple_names').notNull(),
  eventDate: text('event_date'),
  coverKey: text('cover_key'),
  galleryVisibility: text('gallery_visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('public'),
  moderation: text('moderation', { enum: ['pre', 'post'] }).notNull().default('post'),
  maxFileMb: integer('max_file_mb').notNull().default(500),
  allowVideo: boolean('allow_video').notNull().default(true),
  maxVideoSeconds: integer('max_video_seconds').notNull().default(300),
  welcomeMessage: text('welcome_message'),
  updatedAt: bigint('updated_at', { mode: 'number' })
    .notNull()
    .default(sql`(extract(epoch from now()) * 1000)::bigint`),
});

export const uploads = pgTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    storageKey: text('storage_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    durationSeconds: integer('duration_seconds'),
    authorName: text('author_name'),
    message: text('message'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('approved'),
    source: text('source', { enum: ['guest', 'import'] }).notNull().default('guest'),
    ipHash: text('ip_hash'),
    providerUploadId: text('provider_upload_id'),
    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(extract(epoch from now()) * 1000)::bigint`),
    approvedAt: bigint('approved_at', { mode: 'number' }),
  },
  (t) => ({
    statusCreatedIdx: index('idx_uploads_status_created').on(t.status, t.createdAt),
    sourceIdx: index('idx_uploads_source').on(t.source),
  }),
);

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  actor: text('actor'),
  payload: text('payload'),
  createdAt: bigint('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(extract(epoch from now()) * 1000)::bigint`),
});

export type EventConfigRow = typeof eventConfig.$inferSelect;
export type UploadRow = typeof uploads.$inferSelect;
export type NewUploadRow = typeof uploads.$inferInsert;
