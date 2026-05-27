-- Phase 2 — FTS5 全文檢索（trigram tokenizer，CJK 友善）

-- ─────────────────────────────────────────────────
-- chapters FTS（chapters.data 是 JSON，走 json_extract）
-- ─────────────────────────────────────────────────
CREATE VIRTUAL TABLE chapters_fts USING fts5(
  chapter_id UNINDEXED,
  book_id UNINDEXED,
  title,
  content,
  tokenize='trigram'
);

CREATE TRIGGER chapters_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO chapters_fts(chapter_id, book_id, title, content)
  VALUES (new.id, new.project_id,
          json_extract(new.data, '$.title'),
          json_extract(new.data, '$.content'));
END;

CREATE TRIGGER chapters_ad AFTER DELETE ON chapters BEGIN
  DELETE FROM chapters_fts WHERE chapter_id = old.id;
END;

CREATE TRIGGER chapters_au AFTER UPDATE OF data ON chapters BEGIN
  UPDATE chapters_fts
    SET title = json_extract(new.data, '$.title'),
        content = json_extract(new.data, '$.content')
    WHERE chapter_id = old.id;
END;

-- ─────────────────────────────────────────────────
-- wiki_pages FTS（有 native columns 直接用）
-- aliases 是 JSON array，replace 三層拆成空白分隔字串給 trigram 切
-- ─────────────────────────────────────────────────
CREATE VIRTUAL TABLE wiki_pages_fts USING fts5(
  page_id UNINDEXED,
  book_id UNINDEXED,
  title,
  aliases,
  description,
  content_md,
  tokenize='trigram'
);

CREATE TRIGGER wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts(page_id, book_id, title, aliases, description, content_md)
  VALUES (new.id, new.book_id, new.title,
          replace(replace(replace(new.aliases, '[', ''), ']', ''), '"', ''),
          new.description, new.content_md);
END;

CREATE TRIGGER wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
  DELETE FROM wiki_pages_fts WHERE page_id = old.id;
END;

CREATE TRIGGER wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
  UPDATE wiki_pages_fts SET
    title = new.title,
    aliases = replace(replace(replace(new.aliases, '[', ''), ']', ''), '"', ''),
    description = new.description,
    content_md = new.content_md
    WHERE page_id = old.id;
END;

-- ─────────────────────────────────────────────────
-- 一次性回填現有資料
-- ─────────────────────────────────────────────────
INSERT INTO chapters_fts(chapter_id, book_id, title, content)
SELECT id, project_id,
       json_extract(data, '$.title'),
       json_extract(data, '$.content')
  FROM chapters;

INSERT INTO wiki_pages_fts(page_id, book_id, title, aliases, description, content_md)
SELECT id, book_id, title,
       replace(replace(replace(aliases, '[', ''), ']', ''), '"', ''),
       description, content_md
  FROM wiki_pages;
