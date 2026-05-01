import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const eventConfig = sqliteTable('event_config', {
  id: integer('id').primaryKey().default(1),
  coupleNames: text('couple_names').notNull(),
  eventDate: text('event_date'),
  coverKey: text('cover_key'),
  galleryVisibility: text('gallery_visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('public'),
  moderation: text('moderation', { enum: ['pre', 'post'] }).notNull().default('post'),
  maxFileMb: integer('max_file_mb').notNull().default(500),
  allowVideo: integer('allow_video', { mode: 'boolean' }).notNull().default(true),
  maxVideoSeconds: integer('max_video_seconds').notNull().default(300),
  welcomeMessage: text('welcome_message'),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const uploads = sqliteTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    storageKey: text('storage_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    durationSeconds: integer('duration_seconds'),
    authorName: text('author_name'),
    message: text('message'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('approved'),
    source: text('source', { enum: ['guest', 'import'] }).notNull().default('guest'),
    ipHash: text('ip_hash'),
    providerUploadId: text('provider_upload_id'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    approvedAt: integer('approved_at'),
  },
  (t) => ({
    statusCreatedIdx: index('idx_uploads_status_created').on(t.status, t.createdAt),
    sourceIdx: index('idx_uploads_source').on(t.source),
  }),
);

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  actor: text('actor'),
  payload: text('payload'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type EventConfigRow = typeof eventConfig.$inferSelect;
export type UploadRow = typeof uploads.$inferSelect;
export type NewUploadRow = typeof uploads.$inferInsert;
