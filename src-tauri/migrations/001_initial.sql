-- Phase 5b initial schema
-- Aligned 1:1 with Dexie v4 tables; data column stores full entity as JSON.
-- Top-level columns mirror indexed fields for query efficiency.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_updated ON projects(updated_at);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_chapters_project ON chapters(project_id, ord);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_versions_chapter ON versions(chapter_id, created_at);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_characters_project ON characters(project_id);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Phase 6 placeholder (empty table - no app code touches it yet)
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_media_chapter ON media_assets(chapter_id);
CREATE INDEX idx_media_project ON media_assets(project_id);
