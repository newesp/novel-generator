-- Phase 2 — LLM Wiki tables
CREATE TABLE wiki_pages (
  id              TEXT PRIMARY KEY,
  book_id         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN
                    ('concept','entity','summary','compare','synthesis')),
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  aliases         TEXT NOT NULL DEFAULT '[]',
  related_slugs   TEXT NOT NULL DEFAULT '[]',
  description     TEXT NOT NULL DEFAULT '',
  content_md      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (book_id, type, slug)
);
CREATE INDEX idx_wiki_pages_book ON wiki_pages (book_id);

CREATE TABLE wiki_log (
  id                   TEXT PRIMARY KEY,
  book_id              TEXT NOT NULL,
  batch_id             TEXT NOT NULL,
  applied_at           INTEGER NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN
                         ('create','update','delete','undo')),
  op_status            TEXT NOT NULL CHECK (op_status IN
                         ('ok','failed','undone')) DEFAULT 'ok',
  page_id              TEXT,
  page_type            TEXT NOT NULL,
  page_slug            TEXT NOT NULL,
  page_snapshot_before TEXT,
  page_snapshot_after  TEXT,
  source               TEXT NOT NULL,
  summary              TEXT NOT NULL,
  error_message        TEXT
);
CREATE INDEX idx_wiki_log_book  ON wiki_log (book_id, applied_at);
CREATE INDEX idx_wiki_log_batch ON wiki_log (batch_id);
