-- Phase 6 scene visual settings for reusable comic locations.
-- Full entity payload stays in data JSON; columns support project/slug lookup.

CREATE TABLE scene_visuals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_scene_visuals_project_slug ON scene_visuals(project_id, slug);
CREATE INDEX idx_scene_visuals_project_title ON scene_visuals(project_id, title);
