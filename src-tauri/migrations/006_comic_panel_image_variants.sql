-- Per-panel comic image generation history.

CREATE TABLE comic_panel_image_variants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  comic_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  asset_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX idx_comic_panel_image_variants_comic ON comic_panel_image_variants(comic_id, created_at);
CREATE INDEX idx_comic_panel_image_variants_panel ON comic_panel_image_variants(panel_id, created_at);
CREATE INDEX idx_comic_panel_image_variants_project ON comic_panel_image_variants(project_id);
