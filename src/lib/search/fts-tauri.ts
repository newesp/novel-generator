import type Database from '@tauri-apps/plugin-sql';
import { sanitizeFtsQuery } from './sanitize';
import type { SearchHit, SearchOptions, SearchStore } from './types';

interface ChapterFtsRow {
  id: string;
  chapter_order: number;
  title: string;
  snippet: string;
  score: number;
}

interface WikiFtsRow {
  id: string;
  type: string;
  slug: string;
  title: string;
  snippet: string;
  score: number;
}

/**
 * 工廠函式 — 給 TauriSqliteAdapter wire 用。
 * 拆成 factory 是為了 mock db 寫測試方便（不直接 import Database）。
 */
export function createFtsSearchStore(getDb: () => Promise<Database>): SearchStore {
  return {
    async search(bookId: string, query: string, opts?: SearchOptions): Promise<SearchHit[]> {
      const q = sanitizeFtsQuery(query);
      if (!q) return [];

      const scope = opts?.scope ?? 'both';
      const limit = opts?.limit ?? 50;
      const db = await getDb();
      const hits: SearchHit[] = [];

      if (scope === 'chapter' || scope === 'both') {
        const rows = await db.select<ChapterFtsRow[]>(`
          SELECT
            c.id,
            c.ord as chapter_order,
            chapters_fts.title as title,
            snippet(chapters_fts, 3, '<<<', '>>>', '…', 16) as snippet,
            bm25(chapters_fts) as score
          FROM chapters_fts
          JOIN chapters c ON c.id = chapters_fts.chapter_id
          WHERE chapters_fts MATCH ? AND chapters_fts.book_id = ?
          ORDER BY score LIMIT ?
        `, [q, bookId, limit]);
        for (const r of rows) {
          hits.push({
            scope: 'chapter', id: r.id, title: r.title,
            snippet: r.snippet, score: r.score,
            chapterOrder: r.chapter_order,
          });
        }
      }

      if (scope === 'wikiPage' || scope === 'both') {
        const rows = await db.select<WikiFtsRow[]>(`
          SELECT
            p.id, p.type, p.slug, p.title,
            snippet(wiki_pages_fts, 3, '<<<', '>>>', '…', 16) as snippet,
            bm25(wiki_pages_fts) as score
          FROM wiki_pages_fts
          JOIN wiki_pages p ON p.id = wiki_pages_fts.page_id
          WHERE wiki_pages_fts MATCH ? AND wiki_pages_fts.book_id = ?
          ORDER BY score LIMIT ?
        `, [q, bookId, limit]);
        for (const r of rows) {
          hits.push({
            scope: 'wikiPage', id: r.id,
            title: `${r.type}/${r.slug} — ${r.title}`,
            snippet: r.snippet, score: r.score,
          });
        }
      }

      // bm25 越小越相關，asc 排序
      hits.sort((a, b) => a.score - b.score);
      return hits.slice(0, limit);
    },
  };
}
