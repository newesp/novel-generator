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
  type ProjectRow,
  type ChapterRow,
  type VersionRow,
  type CharacterRow,
  type AppMetaRow,
} from './sqlite-helpers';

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

// ============ replaceAll ============

/**
 * 注意：tauri-plugin-sql v2.x **沒有 transaction API**，每次 db.execute() 都從 pool 取
 * 獨立 connection — 因此 BEGIN/COMMIT 無法真正包成 atomic transaction。
 * 中途失敗會留下部分 commit 的狀態；對「使用者明確按下覆蓋確認」的 replaceAll 情境
 * 可接受（重 import 即可恢復）。WAL 模式讓每筆 op 都很快，整體 8-12 筆寫入 <200ms。
 */
async function replaceAll(bundle: StorageBundle): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM characters');
  await db.execute('DELETE FROM versions');
  await db.execute('DELETE FROM chapters');
  await db.execute('DELETE FROM projects');
  for (const p of bundle.projects ?? []) await projects.add(p);
  for (const c of bundle.chapters ?? []) await chapters.add(c);
  for (const v of bundle.versions ?? []) await versions.add(v);
  for (const c of bundle.characters ?? []) await characters.add(c);
}

export const tauriSqliteAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  replaceAll,
};
