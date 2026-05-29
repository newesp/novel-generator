/**
 * TauriSqliteAdapter — StorageAdapter 的 Tauri + tauri-plugin-sql 實作
 *
 * 設計：
 *  - DB 連線在 module load 時 lazy-init（第一次呼叫時開）
 *  - 介面形狀完全對齊 DexieAdapter（src/lib/storage/types.ts）
 *  - data TEXT 欄位存完整 entity JSON;indexed columns 同步寫
 *  - 部分更新走「SELECT → JSON.parse → merge → UPDATE」
 *  - replaceAll 用 BEGIN/COMMIT 包成單一 transaction
 */
import Database from '@tauri-apps/plugin-sql';
import type {
  StorageAdapter,
  ProjectStore,
  ChapterStore,
  VersionStore,
  CharacterStore,
  AppMetaStore,
  WikiPagesStore,
  WikiLogStore,
  ChapterComicStore,
  ComicPanelStore,
  MediaAssetStore,
  StorageBundle,
} from './types';
import {
  projectToRow,
  chapterToRow,
  versionToRow,
  characterToRow,
  rowToProject,
  rowToChapter,
  rowToVersion,
  rowToCharacter,
  mergePartial,
  wikiPageToRow,
  rowToWikiPage,
  wikiLogToRow,
  rowToWikiLog,
  chapterComicToRow,
  rowToChapterComic,
  comicPanelToRow,
  rowToComicPanel,
  mediaAssetToRow,
  rowToMediaAsset,
  type ProjectRow,
  type ChapterRow,
  type VersionRow,
  type CharacterRow,
  type AppMetaRow,
  type WikiPageRow,
  type WikiLogRow,
  type ChapterComicRow,
  type ComicPanelRow,
  type MediaAssetRow,
} from './sqlite-helpers';
import { createFtsSearchStore } from '../search/fts-tauri';

const DB_URL = 'sqlite:novel-generator.db';

let dbPromise: Promise<Database> | null = null;
function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load(DB_URL);
      // 效能調校：WAL mode + 寬鬆 fsync。
      //   - journal_mode=WAL：寫入走 WAL log，避免每筆 statement 都同步主檔
      //   - synchronous=NORMAL：fsync 只在 WAL checkpoint 時做，不是每筆 commit
      // 在 Windows + Defender 環境下，能把每筆 DELETE/INSERT 從 ~5s 壓到 <50ms。
      // 對單使用者桌面 app 來說資料安全性足夠（崩潰最多丟最近未 checkpoint 的寫入）。
      await db.execute('PRAGMA journal_mode = WAL');
      await db.execute('PRAGMA synchronous = NORMAL');
      return db;
    })();
  }
  return dbPromise;
}

// ============ projects ============

const projects: ProjectStore = {
  listAllByUpdatedDesc: async () => {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>(
      'SELECT id, data, created_at, updated_at FROM projects ORDER BY updated_at DESC'
    );
    return rows.map(rowToProject);
  },
  list: async () => {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>(
      'SELECT id, data, created_at, updated_at FROM projects'
    );
    return rows.map(rowToProject);
  },
  get: async (id) => {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>(
      'SELECT id, data, created_at, updated_at FROM projects WHERE id = $1',
      [id]
    );
    return rows[0] ? rowToProject(rows[0]) : undefined;
  },
  add: async (p) => {
    const db = await getDb();
    const r = projectToRow(p);
    await db.execute(
      'INSERT INTO projects (id, data, created_at, updated_at) VALUES ($1, $2, $3, $4)',
      [r.id, r.data, r.created_at, r.updated_at]
    );
  },
  update: async (id, data) => {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>(
      'SELECT id, data, created_at, updated_at FROM projects WHERE id = $1',
      [id]
    );
    if (!rows[0]) return;
    const merged = mergePartial(rowToProject(rows[0]), data);
    const r = projectToRow(merged);
    await db.execute(
      'UPDATE projects SET data = $1, created_at = $2, updated_at = $3 WHERE id = $4',
      [r.data, r.created_at, r.updated_at, id]
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM projects WHERE id = $1', [id]);
  },
  bulkDelete: async (ids) => {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM projects WHERE id IN (${placeholders})`, ids);
  },
};

// ============ chapters ============

const chapters: ChapterStore = {
  list: async () => {
    const db = await getDb();
    const rows = await db.select<ChapterRow[]>(
      'SELECT id, project_id, ord, updated_at, data FROM chapters'
    );
    return rows.map(rowToChapter);
  },
  listByProject: async (projectId, opts) => {
    const db = await getDb();
    const order = opts?.sorted === false ? '' : 'ORDER BY ord ASC';
    const rows = await db.select<ChapterRow[]>(
      `SELECT id, project_id, ord, updated_at, data FROM chapters WHERE project_id = $1 ${order}`,
      [projectId]
    );
    return rows.map(rowToChapter);
  },
  add: async (c) => {
    const db = await getDb();
    const r = chapterToRow(c);
    await db.execute(
      'INSERT INTO chapters (id, project_id, ord, updated_at, data) VALUES ($1, $2, $3, $4, $5)',
      [r.id, r.project_id, r.ord, r.updated_at, r.data]
    );
  },
  update: async (id, data) => {
    const db = await getDb();
    const rows = await db.select<ChapterRow[]>(
      'SELECT id, project_id, ord, updated_at, data FROM chapters WHERE id = $1',
      [id]
    );
    if (!rows[0]) return;
    const merged = mergePartial(rowToChapter(rows[0]), data);
    const r = chapterToRow(merged);
    await db.execute(
      'UPDATE chapters SET project_id = $1, ord = $2, updated_at = $3, data = $4 WHERE id = $5',
      [r.project_id, r.ord, r.updated_at, r.data, id]
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM chapters WHERE id = $1', [id]);
  },
  deleteByProject: async (projectId) => {
    const db = await getDb();
    await db.execute('DELETE FROM chapters WHERE project_id = $1', [projectId]);
  },
  deleteByProjects: async (projectIds) => {
    if (projectIds.length === 0) return;
    const db = await getDb();
    const ph = projectIds.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM chapters WHERE project_id IN (${ph})`, projectIds);
  },
  bulkDelete: async (ids) => {
    if (ids.length === 0) return;
    const db = await getDb();
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM chapters WHERE id IN (${ph})`, ids);
  },
};

// ============ versions ============

const versions: VersionStore = {
  list: async () => {
    const db = await getDb();
    const rows = await db.select<VersionRow[]>(
      'SELECT id, chapter_id, kind, created_at, data FROM versions'
    );
    return rows.map(rowToVersion);
  },
  listByChapterDesc: async (chapterId) => {
    const db = await getDb();
    const rows = await db.select<VersionRow[]>(
      'SELECT id, chapter_id, kind, created_at, data FROM versions WHERE chapter_id = $1 ORDER BY created_at DESC',
      [chapterId]
    );
    return rows.map(rowToVersion);
  },
  add: async (v) => {
    const db = await getDb();
    const r = versionToRow(v);
    await db.execute(
      'INSERT INTO versions (id, chapter_id, kind, created_at, data) VALUES ($1, $2, $3, $4, $5)',
      [r.id, r.chapter_id, r.kind, r.created_at, r.data]
    );
  },
  update: async (id, data) => {
    const db = await getDb();
    const rows = await db.select<VersionRow[]>(
      'SELECT id, chapter_id, kind, created_at, data FROM versions WHERE id = $1',
      [id]
    );
    if (!rows[0]) return;
    const merged = mergePartial(rowToVersion(rows[0]), data);
    const r = versionToRow(merged);
    await db.execute(
      'UPDATE versions SET chapter_id = $1, kind = $2, created_at = $3, data = $4 WHERE id = $5',
      [r.chapter_id, r.kind, r.created_at, r.data, id]
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM versions WHERE id = $1', [id]);
  },
  deleteByChapter: async (chapterId) => {
    const db = await getDb();
    await db.execute('DELETE FROM versions WHERE chapter_id = $1', [chapterId]);
  },
  deleteByChapters: async (chapterIds) => {
    if (chapterIds.length === 0) return;
    const db = await getDb();
    const ph = chapterIds.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM versions WHERE chapter_id IN (${ph})`, chapterIds);
  },
  idsByChapters: async (chapterIds) => {
    if (chapterIds.length === 0) return [];
    const db = await getDb();
    const ph = chapterIds.map((_, i) => `$${i + 1}`).join(',');
    const rows = await db.select<{ id: string }[]>(
      `SELECT id FROM versions WHERE chapter_id IN (${ph})`,
      chapterIds
    );
    return rows.map((r) => r.id);
  },
  bulkDelete: async (ids) => {
    if (ids.length === 0) return;
    const db = await getDb();
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM versions WHERE id IN (${ph})`, ids);
  },
};

// ============ characters ============

const characters: CharacterStore = {
  list: async () => {
    const db = await getDb();
    const rows = await db.select<CharacterRow[]>(
      'SELECT id, project_id, name, data FROM characters'
    );
    return rows.map(rowToCharacter);
  },
  listByProject: async (projectId) => {
    const db = await getDb();
    const rows = await db.select<CharacterRow[]>(
      'SELECT id, project_id, name, data FROM characters WHERE project_id = $1',
      [projectId]
    );
    return rows.map(rowToCharacter);
  },
  add: async (c) => {
    const db = await getDb();
    const r = characterToRow(c);
    await db.execute(
      'INSERT INTO characters (id, project_id, name, data) VALUES ($1, $2, $3, $4)',
      [r.id, r.project_id, r.name, r.data]
    );
  },
  update: async (id, data) => {
    const db = await getDb();
    const rows = await db.select<CharacterRow[]>(
      'SELECT id, project_id, name, data FROM characters WHERE id = $1',
      [id]
    );
    if (!rows[0]) return;
    const merged = mergePartial(rowToCharacter(rows[0]), data);
    const r = characterToRow(merged);
    await db.execute(
      'UPDATE characters SET project_id = $1, name = $2, data = $3 WHERE id = $4',
      [r.project_id, r.name, r.data, id]
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM characters WHERE id = $1', [id]);
  },
  deleteByProject: async (projectId) => {
    const db = await getDb();
    await db.execute('DELETE FROM characters WHERE project_id = $1', [projectId]);
  },
  deleteByProjects: async (projectIds) => {
    if (projectIds.length === 0) return;
    const db = await getDb();
    const ph = projectIds.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM characters WHERE project_id IN (${ph})`, projectIds);
  },
  bulkDelete: async (ids) => {
    if (ids.length === 0) return;
    const db = await getDb();
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    await db.execute(`DELETE FROM characters WHERE id IN (${ph})`, ids);
  },
};

// ============ wikiPages ============

const WIKI_PAGE_COLS =
  'id, book_id, type, slug, title, aliases, related_slugs, description, content_md, created_at, updated_at';

const wikiPages: WikiPagesStore = {
  list: async (bookId) => {
    const db = await getDb();
    const rows = await db.select<WikiPageRow[]>(
      `SELECT ${WIKI_PAGE_COLS} FROM wiki_pages WHERE book_id = $1 ORDER BY type, slug`,
      [bookId],
    );
    return rows.map(rowToWikiPage);
  },
  get: async (id) => {
    const db = await getDb();
    const rows = await db.select<WikiPageRow[]>(
      `SELECT ${WIKI_PAGE_COLS} FROM wiki_pages WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToWikiPage(rows[0]) : undefined;
  },
  findBySlug: async (bookId, type, slug) => {
    const db = await getDb();
    const rows = await db.select<WikiPageRow[]>(
      `SELECT ${WIKI_PAGE_COLS} FROM wiki_pages WHERE book_id=$1 AND type=$2 AND slug=$3`,
      [bookId, type, slug],
    );
    return rows[0] ? rowToWikiPage(rows[0]) : undefined;
  },
  add: async (p) => {
    const db = await getDb();
    const r = wikiPageToRow(p);
    await db.execute(
      `INSERT INTO wiki_pages (${WIKI_PAGE_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r.id, r.book_id, r.type, r.slug, r.title, r.aliases, r.related_slugs,
       r.description, r.content_md, r.created_at, r.updated_at],
    );
  },
  update: async (p) => {
    const db = await getDb();
    const r = wikiPageToRow(p);
    await db.execute(
      `UPDATE wiki_pages SET type=$1, slug=$2, title=$3, aliases=$4, related_slugs=$5,
          description=$6, content_md=$7, updated_at=$8
       WHERE id=$9`,
      [r.type, r.slug, r.title, r.aliases, r.related_slugs,
       r.description, r.content_md, r.updated_at, r.id],
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM wiki_pages WHERE id = $1', [id]);
  },
  totalLength: async (bookId) => {
    const db = await getDb();
    const rows = await db.select<{ total: number | null }[]>(
      'SELECT COALESCE(SUM(LENGTH(content_md)), 0) AS total FROM wiki_pages WHERE book_id=$1',
      [bookId],
    );
    return rows[0]?.total ?? 0;
  },
  listAll: async () => {
    const db = await getDb();
    const rows = await db.select<WikiPageRow[]>(`SELECT ${WIKI_PAGE_COLS} FROM wiki_pages`);
    return rows.map(rowToWikiPage);
  },
  deleteByBook: async (bookId) => {
    const db = await getDb();
    await db.execute('DELETE FROM wiki_pages WHERE book_id = $1', [bookId]);
  },
};

// ============ wikiLog ============

const WIKI_LOG_COLS =
  'id, book_id, batch_id, applied_at, kind, op_status, page_id, page_type, page_slug, ' +
  'page_snapshot_before, page_snapshot_after, source, summary, error_message';

const wikiLog: WikiLogStore = {
  list: async (bookId, limit) => {
    const db = await getDb();
    const lim = limit ? `LIMIT ${Number(limit) | 0}` : '';
    const rows = await db.select<WikiLogRow[]>(
      `SELECT ${WIKI_LOG_COLS} FROM wiki_log WHERE book_id=$1 ORDER BY applied_at DESC ${lim}`,
      [bookId],
    );
    return rows.map(rowToWikiLog);
  },
  listByBatch: async (bookId, batchId) => {
    const db = await getDb();
    const rows = await db.select<WikiLogRow[]>(
      `SELECT ${WIKI_LOG_COLS} FROM wiki_log WHERE book_id=$1 AND batch_id=$2 ORDER BY applied_at ASC`,
      [bookId, batchId],
    );
    return rows.map(rowToWikiLog);
  },
  add: async (e) => {
    const db = await getDb();
    const r = wikiLogToRow(e);
    await db.execute(
      `INSERT INTO wiki_log (${WIKI_LOG_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [r.id, r.book_id, r.batch_id, r.applied_at, r.kind, r.op_status,
       r.page_id, r.page_type, r.page_slug,
       r.page_snapshot_before, r.page_snapshot_after,
       r.source, r.summary, r.error_message],
    );
  },
  updateStatus: async (id, opStatus, errorMessage) => {
    const db = await getDb();
    await db.execute(
      'UPDATE wiki_log SET op_status=$1, error_message=$2 WHERE id=$3',
      [opStatus, errorMessage ?? null, id],
    );
  },
  listAll: async () => {
    const db = await getDb();
    const rows = await db.select<WikiLogRow[]>(`SELECT ${WIKI_LOG_COLS} FROM wiki_log`);
    return rows.map(rowToWikiLog);
  },
  deleteByBook: async (bookId) => {
    const db = await getDb();
    await db.execute('DELETE FROM wiki_log WHERE book_id = $1', [bookId]);
  },
};

// ============ appMeta ============

const appMeta: AppMetaStore = {
  get: async <T = unknown>(key: string): Promise<T | undefined> => {
    const db = await getDb();
    const rows = await db.select<AppMetaRow[]>(
      'SELECT key, value FROM app_meta WHERE key = $1',
      [key]
    );
    if (!rows[0]) return undefined;
    return JSON.parse(rows[0].value) as T;
  },
  put: async (key, value) => {
    const db = await getDb();
    const json = JSON.stringify(value);
    await db.execute(
      'INSERT INTO app_meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, json]
    );
  },
  delete: async (key) => {
    const db = await getDb();
    await db.execute('DELETE FROM app_meta WHERE key = $1', [key]);
  },
};

// ============ comics ============

const CHAPTER_COMIC_COLS = 'id, project_id, chapter_id, updated_at, data';
const COMIC_PANEL_COLS = 'id, comic_id, ord, status, data';
const MEDIA_ASSET_COLS = 'id, project_id, chapter_id, kind, file_path, data, created_at';

const comics: ChapterComicStore = {
  listByChapter: async (chapterId) => {
    const db = await getDb();
    const rows = await db.select<ChapterComicRow[]>(
      `SELECT ${CHAPTER_COMIC_COLS} FROM chapter_comics WHERE chapter_id=$1 ORDER BY updated_at DESC`,
      [chapterId],
    );
    return rows.map(rowToChapterComic);
  },
  get: async (id) => {
    const db = await getDb();
    const rows = await db.select<ChapterComicRow[]>(
      `SELECT ${CHAPTER_COMIC_COLS} FROM chapter_comics WHERE id=$1`,
      [id],
    );
    return rows[0] ? rowToChapterComic(rows[0]) : undefined;
  },
  add: async (comic) => {
    const db = await getDb();
    const row = chapterComicToRow(comic);
    await db.execute(
      `INSERT INTO chapter_comics (${CHAPTER_COMIC_COLS}) VALUES ($1,$2,$3,$4,$5)`,
      [row.id, row.project_id, row.chapter_id, row.updated_at, row.data],
    );
  },
  update: async (id, data) => {
    const current = await comics.get(id);
    if (!current) return;
    const db = await getDb();
    const row = chapterComicToRow(mergePartial(current, data));
    await db.execute(
      'UPDATE chapter_comics SET project_id=$1, chapter_id=$2, updated_at=$3, data=$4 WHERE id=$5',
      [row.project_id, row.chapter_id, row.updated_at, row.data, id],
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM chapter_comics WHERE id=$1', [id]);
  },
  deleteByProject: async (projectId) => {
    const db = await getDb();
    await db.execute('DELETE FROM chapter_comics WHERE project_id=$1', [projectId]);
  },
};

const comicPanels: ComicPanelStore = {
  listByComic: async (comicId) => {
    const db = await getDb();
    const rows = await db.select<ComicPanelRow[]>(
      `SELECT ${COMIC_PANEL_COLS} FROM comic_panels WHERE comic_id=$1 ORDER BY ord ASC`,
      [comicId],
    );
    return rows.map(rowToComicPanel);
  },
  get: async (id) => {
    const db = await getDb();
    const rows = await db.select<ComicPanelRow[]>(`SELECT ${COMIC_PANEL_COLS} FROM comic_panels WHERE id=$1`, [id]);
    return rows[0] ? rowToComicPanel(rows[0]) : undefined;
  },
  add: async (panel) => {
    const db = await getDb();
    const row = comicPanelToRow(panel);
    await db.execute(
      `INSERT INTO comic_panels (${COMIC_PANEL_COLS}) VALUES ($1,$2,$3,$4,$5)`,
      [row.id, row.comic_id, row.ord, row.status, row.data],
    );
  },
  bulkAdd: async (panels) => {
    for (const panel of panels) await comicPanels.add(panel);
  },
  update: async (id, data) => {
    const current = await comicPanels.get(id);
    if (!current) return;
    const db = await getDb();
    const row = comicPanelToRow(mergePartial(current, data));
    await db.execute(
      'UPDATE comic_panels SET comic_id=$1, ord=$2, status=$3, data=$4 WHERE id=$5',
      [row.comic_id, row.ord, row.status, row.data, id],
    );
  },
  deleteByComic: async (comicId) => {
    const db = await getDb();
    await db.execute('DELETE FROM comic_panels WHERE comic_id=$1', [comicId]);
  },
};

const mediaAssets: MediaAssetStore = {
  listByChapter: async (chapterId) => {
    const db = await getDb();
    const rows = await db.select<MediaAssetRow[]>(
      `SELECT ${MEDIA_ASSET_COLS} FROM media_assets WHERE chapter_id=$1 ORDER BY created_at ASC`,
      [chapterId],
    );
    return rows.map(rowToMediaAsset);
  },
  get: async (id) => {
    const db = await getDb();
    const rows = await db.select<MediaAssetRow[]>(`SELECT ${MEDIA_ASSET_COLS} FROM media_assets WHERE id=$1`, [id]);
    return rows[0] ? rowToMediaAsset(rows[0]) : undefined;
  },
  add: async (asset) => {
    const db = await getDb();
    const row = mediaAssetToRow(asset);
    await db.execute(
      `INSERT INTO media_assets (${MEDIA_ASSET_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, row.project_id, row.chapter_id, row.kind, row.file_path, row.data, row.created_at],
    );
  },
  update: async (id, data) => {
    const current = await mediaAssets.get(id);
    if (!current) return;
    const db = await getDb();
    const row = mediaAssetToRow(mergePartial(current, data));
    await db.execute(
      'UPDATE media_assets SET project_id=$1, chapter_id=$2, kind=$3, file_path=$4, data=$5, created_at=$6 WHERE id=$7',
      [row.project_id, row.chapter_id, row.kind, row.file_path, row.data, row.created_at, id],
    );
  },
  delete: async (id) => {
    const db = await getDb();
    await db.execute('DELETE FROM media_assets WHERE id=$1', [id]);
  },
  deleteByProject: async (projectId) => {
    const db = await getDb();
    await db.execute('DELETE FROM media_assets WHERE project_id=$1', [projectId]);
  },
};

// ============ replaceAll ============

/**
 * 注意：tauri-plugin-sql v2.x **沒有 transaction API**，每次 db.execute() 都從 pool 取
 * 獨立 connection — 因此 BEGIN/COMMIT 無法真正包成 atomic transaction。
 * 中途失敗會留下部分 commit 的狀態；對「使用者明確按下覆蓋確認」的 replaceAll 情境
 * 可接受（重 import 即可恢復）。WAL 模式讓每筆 op 都很快，整體 8-12 筆寫入 <200ms。
 */
async function replaceAll(bundle: StorageBundle): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM media_assets');
  await db.execute('DELETE FROM comic_panels');
  await db.execute('DELETE FROM chapter_comics');
  await db.execute('DELETE FROM wiki_log');
  await db.execute('DELETE FROM wiki_pages');
  await db.execute('DELETE FROM characters');
  await db.execute('DELETE FROM versions');
  await db.execute('DELETE FROM chapters');
  await db.execute('DELETE FROM projects');
  for (const p of bundle.projects ?? []) await projects.add(p);
  for (const c of bundle.chapters ?? []) await chapters.add(c);
  for (const v of bundle.versions ?? []) await versions.add(v);
  for (const c of bundle.characters ?? []) await characters.add(c);
  for (const p of bundle.wikiPages ?? []) await wikiPages.add(p);
  for (const e of bundle.wikiLog ?? [])   await wikiLog.add(e);
  for (const c of bundle.comics ?? []) await comics.add(c);
  for (const p of bundle.comicPanels ?? []) await comicPanels.add(p);
  for (const a of bundle.mediaAssets ?? []) await mediaAssets.add(a);
}

export const tauriSqliteAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  wikiPages, wikiLog, comics, comicPanels, mediaAssets,
  search: createFtsSearchStore(getDb),
  replaceAll,
};
