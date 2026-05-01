CREATE TABLE event_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  couple_names TEXT NOT NULL,
  event_date TEXT,
  cover_key TEXT,
  gallery_visibility TEXT NOT NULL DEFAULT 'public',
  moderation TEXT NOT NULL DEFAULT 'post',
  max_file_mb INTEGER NOT NULL DEFAULT 500,
  allow_video INTEGER NOT NULL DEFAULT 1,
  max_video_seconds INTEGER NOT NULL DEFAULT 300,
  welcome_message TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO event_config (id, couple_names, max_file_mb, max_video_seconds, allow_video, moderation, gallery_visibility)
VALUES (1, 'Stefanie & Leandro', 500, 300, 1, 'post', 'public');

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  thumbnail_key TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_seconds INTEGER,
  author_name TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  source TEXT NOT NULL DEFAULT 'guest',
  ip_hash TEXT,
  provider_upload_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  approved_at INTEGER
);

CREATE INDEX idx_uploads_status_created ON uploads (status, created_at DESC);
CREATE INDEX idx_uploads_source ON uploads (source);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
