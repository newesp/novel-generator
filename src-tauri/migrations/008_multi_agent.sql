-- Migration 008: Multi-Agent Generation Runs, Steps, Checkpoints

CREATE TABLE IF NOT EXISTS generation_runs (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_runs_book_id ON generation_runs(book_id);
CREATE INDEX IF NOT EXISTS idx_generation_runs_chapter_id ON generation_runs(chapter_id);

CREATE TABLE IF NOT EXISTS generation_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_steps_run_id ON generation_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_generation_steps_chapter_id ON generation_steps(chapter_id);

CREATE TABLE IF NOT EXISTS generation_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_checkpoints_run_id ON generation_checkpoints(run_id);
CREATE INDEX IF NOT EXISTS idx_generation_checkpoints_chapter_id ON generation_checkpoints(chapter_id);
