-- Phase 6 comic image MVP metadata.
-- Binary image/audio/video files stay outside SQLite; data stores metadata JSON.

CREATE TABLE chapter_comics (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_chapter_comics_chapter ON chapter_comics(chapter_id, updated_at);
CREATE INDEX idx_chapter_comics_project ON chapter_comics(project_id);

CREATE TABLE comic_panels (
  id TEXT PRIMARY KEY,
  comic_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_comic_panels_comic ON comic_panels(comic_id, ord);

CREATE INDEX idx_media_assets_kind ON media_assets(kind);
