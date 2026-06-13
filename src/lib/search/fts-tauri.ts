import type Database from '@tauri-apps/plugin-sql';
import { sanitizeFtsQuery } from './sanitize';
import type { SearchHit, SearchOptions, SearchStore } from './types';

interface ChapterLikeRow {
  id: string;
  chapter_order: number;
  title: string;
  content: string;
}

interface WikiLikeRow {
  id: string;
  type: string;
  slug: string;
  title: string;
  description: string;
  content_md: string;
}

const CJK_RE = /[\u3400-\u9fff]/;
const LIKE_ESCAPE_RE = /[\\%_]/g;

function containsCjk(value: string): boolean {
  return CJK_RE.test(value);
}

function escapeLike(value: string): string {
  return value.replace(LIKE_ESCAPE_RE, (match) => `\\${match}`);
}

function makeSnippet(text: string, query: string): string {
  const source = text || '';
  if (!source) return '';
  const lowerSource = source.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const index = lowerSource.indexOf(lowerQuery);
  if (index < 0) return source.slice(0, 120);
  const start = Math.max(0, index - 48);
  const end = Math.min(source.length, index + query.length + 48);
  return `${start > 0 ? '…' : ''}${source.slice(start, index)}<<<${source.slice(index, index + query.length)}>>>${source.slice(index + query.length, end)}${end < source.length ? '…' : ''}`;
}

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
      if (containsCjk(query) && hits.length === 0) {
        const existingKeys = new Set(hits.map((hit) => `${hit.scope}:${hit.id}`));
        const rawQuery = query.trim();
        const likeQuery = `%${escapeLike(rawQuery)}%`;
        const remaining = Math.max(0, limit - hits.length);

        if (remaining > 0 && (scope === 'chapter' || scope === 'both')) {
          const rows = await db.select<ChapterLikeRow[]>(`
            SELECT
              id,
              ord as chapter_order,
              COALESCE(json_extract(data, '$.title'), '') as title,
              COALESCE(json_extract(data, '$.content'), '') as content
            FROM chapters
            WHERE project_id = ?
              AND (
                COALESCE(json_extract(data, '$.title'), '') LIKE ? ESCAPE '\\'
                OR COALESCE(json_extract(data, '$.content'), '') LIKE ? ESCAPE '\\'
              )
            ORDER BY updated_at DESC LIMIT ?
          `, [bookId, likeQuery, likeQuery, remaining]);
          for (const r of rows) {
            const key = `chapter:${r.id}`;
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);
            hits.push({
              scope: 'chapter',
              id: r.id,
              title: r.title,
              snippet: makeSnippet(`${r.title}\n${r.content}`, rawQuery),
              score: 100 + hits.length,
              chapterOrder: r.chapter_order,
            });
          }
        }

        const wikiRemaining = Math.max(0, limit - hits.length);
        if (wikiRemaining > 0 && (scope === 'wikiPage' || scope === 'both')) {
          const rows = await db.select<WikiLikeRow[]>(`
            SELECT
              id,
              type,
              slug,
              title,
              description,
              content_md
            FROM wiki_pages
            WHERE book_id = ?
              AND (
                title LIKE ? ESCAPE '\\'
                OR aliases LIKE ? ESCAPE '\\'
                OR description LIKE ? ESCAPE '\\'
                OR content_md LIKE ? ESCAPE '\\'
              )
            ORDER BY updated_at DESC LIMIT ?
          `, [bookId, likeQuery, likeQuery, likeQuery, likeQuery, wikiRemaining]);
          for (const r of rows) {
            const key = `wikiPage:${r.id}`;
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);
            hits.push({
              scope: 'wikiPage',
              id: r.id,
              title: `${r.type}/${r.slug} · ${r.title}`,
              snippet: makeSnippet(`${r.title}\n${r.description}\n${r.content_md}`, rawQuery),
              score: 100 + hits.length,
            });
          }
        }
      }

      hits.sort((a, b) => a.score - b.score);
      return hits.slice(0, limit);
    },
  };
}
