CREATE TABLE event_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  couple_names TEXT NOT NULL,
  event_date TEXT,
  cover_key TEXT,
  gallery_visibility TEXT NOT NULL DEFAULT 'public',
  moderation TEXT NOT NULL DEFAULT 'post',
  max_file_mb INTEGER NOT NULL DEFAULT 500,
  allow_video BOOLEAN NOT NULL DEFAULT TRUE,
  max_video_seconds INTEGER NOT NULL DEFAULT 300,
  welcome_message TEXT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

INSERT INTO event_config (id, couple_names)
VALUES (1, 'Stefanie & Leandro')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  thumbnail_key TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  duration_seconds INTEGER,
  author_name TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  source TEXT NOT NULL DEFAULT 'guest',
  ip_hash TEXT,
  provider_upload_id TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  approved_at BIGINT
);

CREATE INDEX idx_uploads_status_created ON uploads (status, created_at DESC);
CREATE INDEX idx_uploads_source ON uploads (source);
CREATE INDEX idx_uploads_author_lower ON uploads (LOWER(author_name));

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT,
  payload TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
