-- Comic TTS/video metadata stays in JSON data columns.
-- This index speeds chapter-level lookup of tts_audio and video MediaAsset rows.
CREATE INDEX IF NOT EXISTS idx_media_assets_chapter_kind_created
ON media_assets(chapter_id, kind, created_at);
