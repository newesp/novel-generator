# LLM Wiki Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有桌面 / 瀏覽器雙平台 app 上，為每本書加上 LLM 自管的知識層：手動「📚 存入 Wiki」按鈕、自動 apply + 還原、Context Budget 整合（cheap relevance filter + 截斷預警）、左側 Wiki 分頁。

**Architecture:**
1. **資料層**：兩個新表 `wiki_pages` / `wiki_log`（SQLite + Dexie 平行實作），擴充 `StorageAdapter` 介面；Chapter 加 `wikiSyncedAt` / `wikiSyncedHash` / `wikiSyncStatus` 三欄位。
2. **Pipeline 層**：`wiki-ingest.ts`（Plan → 校驗 → Apply → 補償寫入），`wiki-loader.ts`（cheap filter → 排序 → 截斷），`wiki-undo.ts`（依 batchId 還原）。
3. **整合層**：`context-budget.ts` 注入 `wikiSection`，預設模板 `DEFAULT_CHAPTER_CONTENT_TEMPLATE` 加 `{{wikiSection}}`。
4. **UI 層**：左側 `WikiPanel`、章節「📚 存入 Wiki」按鈕 + 四狀態徽章、Toast + Undo modal、偏好設定 Wiki 區塊。

**Spec：** `docs/superpowers/specs/2026-05-17-llm-wiki-design.md`（已通過 4 輪 codex review）

**Tech Stack:** React 19 / TypeScript strict / Vite 8 / Zustand 5 / Dexie 4 / tauri-plugin-sql / 既有自製 UI 元件（無 shadcn、無 Tailwind）

**Test Strategy:** repo 內無單元測試框架（沿 Phase 1/5b 慣例）。每個 Task 用「**桌面與瀏覽器各跑一次的手動 smoke**」當驗收，並在最終 Task 15 跑 §8 規格驗收 14 條。複雜純函式（parser、relevance scorer、tokens）寫 **獨立 `temp/probe-*.ts` 探針**用 `tsx` 跑（dev-time only，不進 commit），印出實際結果與預期對照。

---

## Prerequisites（**人類確認**）

- [ ] 在 main 分支 head；Phase 5b 已合（commit `fd96d7d` 之後）
- [ ] `npm install` 已執行；`npm run dev` 與 `npm run tauri dev` 都能起來
- [ ] `npm i -D tsx` 已安裝（給探針腳本用）；若沒裝，第一個 Task 會補

---

## File Map

**新增（程式）：**
- `src/lib/tokens.ts` — `estimateTokens` / `tokensToChars` / `estimateCharsPerToken`
- `src/lib/wiki-parser.ts` — LLM 輸出 markdown → metadata + content_md 解析
- `src/lib/wiki-plan.ts` — Plan JSON 解析 / 校驗 / slug 正規化 / 衝突降級
- `src/lib/wiki-relevance.ts` — cheap relevance filter（needles + scoring）
- `src/lib/wiki-loader.ts` — `loadWikiForGeneration`
- `src/lib/wiki-ingest.ts` — Plan + Apply + 補償寫入；含 retry-remaining
- `src/lib/wiki-undo.ts` — 依 batchId 還原
- `src/lib/wiki-section.ts` — 給 prompt 用的 `wikiSection` 字串組裝
- `src/stores/wikiStore.ts` — Zustand store
- `src/components/wiki/WikiPanel.tsx` — 左側分頁主畫面（index + 編輯 + 操作記錄）
- `src/components/wiki/WikiPageEditor.tsx` — 單頁 markdown 編輯
- `src/components/wiki/WikiPartialModal.tsx` — partial / partial_stale 狀態的處理 modal
- `src/components/wiki/IngestToast.tsx` — 結果 toast
- `src/components/wiki/IngestDiffModal.tsx` — 「查看變更」modal

**新增（schema）：**
- `src-tauri/migrations/002_wiki_tables.sql`

**新增（dev-only，不 commit）：**
- `temp/probe-*.ts`（每個探針 Task 一份；放 `.gitignore` 內）

**修改：**
- `src/types/index.ts` — `WikiPageType`、`WikiPage`、`WikiPageSnapshot`、`WikiLogEntry`、Chapter 三欄位、`Project` 不變
- `src/lib/storage/types.ts` — `WikiOps` / `WikiLogOps`、`StorageBundle` +`wikiPages` +`wikiLog`
- `src/lib/storage/dexie-adapter.ts` — Wiki ops + replaceAll order
- `src/lib/storage/tauri-sqlite-adapter.ts` — Wiki ops + replaceAll order
- `src/lib/storage/sqlite-helpers.ts` — WikiPage/WikiLogEntry row converters
- `src/lib/db.ts` — Dexie v5 schema + migration
- `src/lib/backup.ts` — BackupSnapshot v2（新增 wikiPages / wikiLog 欄位）
- `src/lib/context-budget.ts` — `BudgetInputs` +`wikiSection`、`buildGenerationPrompt` 注入
- `src/lib/prompt-defaults.ts` — `DEFAULT_CHAPTER_CONTENT_TEMPLATE` +`{{wikiSection}}`、+ 4 個 wiki prompt templates
- `src/stores/settingsStore.ts` — `AIPromptPrefs` +4 個 wiki templates、新增 `wikiPrefs`
- `src/stores/projectStore.ts` — `updateChapter` 內 hook 計算新 wikiSyncStatus
- `src/components/chapters/ChapterEditor.tsx` — 「📚 存入 Wiki」按鈕 + 四狀態
- `src/components/chapters/ChaptersPanel.tsx` — 章節列表徽章 + 頂部 banner + 批次處理
- `src/components/Toolbar.tsx` — 偏好設定 Modal 增加「📚 Wiki 設定」區塊
- `src/App.tsx` — 解鎖 Wiki tab、掛 WikiPanel
- `src/index.css` — wiki UI 用樣式（沿用 CSS variables）
- `.gitignore` — 加 `temp/probe-*.ts`
- `docs/CHANGELOG.md`
- `modules/04-knowledge.md` — 標示 Phase 2 已落地、連結到 spec
- `modules/07-context-budget.md` — 標示 wikiSection 整合
- `specs/roadmap.md` — Phase 2 第 1 項 ❌ → ✅

**不動：**
- 既有 chapters 既有欄位（只**新增**三個 wiki 欄位）
- 既有 characters / versions / projects schema
- `llm.ts`、`ai-tasks.ts`（wiki ingest 走既有 `complete()`）
- `inline-edit.ts`、`auto-sync.ts`、`fs-sync.ts`

---

## Task 1: 探針工具就緒 + .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 確認 `tsx` 已裝**

```bash
npm ls tsx 2>/dev/null || npm i -D tsx
```

Expected: 退出碼 0；`package.json` 的 devDependencies 含 `tsx`。

- [ ] **Step 2: `.gitignore` 加上探針檔模式**

Edit `.gitignore` — 在檔末加：
```
# dev-time probes for plans (not committed)
temp/probe-*.ts
```

- [ ] **Step 3: 驗證探針可跑**

```bash
mkdir -p temp && echo 'console.log("probe ok");' > temp/probe-hello.ts
npx tsx temp/probe-hello.ts
rm temp/probe-hello.ts
```

Expected: 輸出 `probe ok`。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add tsx for ad-hoc probe scripts during Phase 2"
```

---

## Task 2: TypeScript 型別（WikiPageType / WikiPage / WikiLogEntry / Chapter 三欄位）

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 寫入 wiki 相關型別 + Chapter 三欄位**

Edit `src/types/index.ts`。在 `Character` 後（接近檔末，`LLMProvider` 前）插入：

```ts
// ─────────────────────────────────────────────────────────────
//  Wiki（Phase 2 — 知識層）
// ─────────────────────────────────────────────────────────────

export type WikiPageType = 'concept' | 'entity' | 'summary' | 'compare' | 'synthesis';

export interface WikiPageRelated {
  type: WikiPageType;
  slug: string;
}

export interface WikiPage {
  id: string;
  bookId: string;             // 對應 Project.id
  type: WikiPageType;
  slug: string;               // ASCII kebab-case
  title: string;
  aliases: string[];
  relatedSlugs: WikiPageRelated[];
  description: string;
  contentMd: string;
  createdAt: number;
  updatedAt: number;
}

/** 還原所需的完整頁面快照 — 等同 WikiPage 全欄位 */
export type WikiPageSnapshot = WikiPage;

export type WikiLogKind = 'create' | 'update' | 'delete' | 'undo';
export type WikiLogStatus = 'ok' | 'failed' | 'undone';

export interface WikiLogEntry {
  id: string;
  bookId: string;
  batchId: string;
  appliedAt: number;
  kind: WikiLogKind;
  opStatus: WikiLogStatus;
  pageId: string | null;
  pageType: WikiPageType;
  pageSlug: string;
  pageSnapshotBefore: WikiPageSnapshot | null;
  pageSnapshotAfter: WikiPageSnapshot | null;
  source: string;             // 'ingest:<chapterId>' | 'manual' | 'undo:<batchId>'
  summary: string;
  errorMessage?: string;
}

export type WikiSyncStatus = 'unsynced' | 'synced' | 'stale' | 'partial' | 'partial_stale';
```

接著修改既有 `Chapter` interface — 把：
```ts
  wikiSyncedAt: number | null;
```
改為（新增兩個欄位、保留既有 `wikiSyncedAt`）：
```ts
  wikiSyncedAt: number | null;
  wikiSyncedHash: string | null;       // sha1(content) at last successful (or partial) ingest
  wikiSyncStatus: WikiSyncStatus;      // 顯式狀態，不從 hash 推導
```

- [ ] **Step 2: TS 編譯通過驗證**

```bash
npx tsc -b --noEmit
```

Expected: 編譯通過，無 type 錯誤；既有引用 `wikiSyncedAt` 的程式只多了兩個 optional 顯示位置（projectStore.createChapter 等會在下個 task 補預設值）。
若有錯誤訊息提到 chapter 缺 `wikiSyncedHash` / `wikiSyncStatus`，那是預期的 — Task 3 會在 schema migration 後一併補 default。**先不要急著修。** 用 `npx tsc -b --noEmit 2>&1 | head -30` 紀錄錯誤條數，留待 Task 3 後再驗證歸零。

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Wiki/Wiki-log types and Chapter wiki-sync columns"
```

---

## Task 3: Schema migration（SQLite + Dexie），補既有 Chapter 預設值

**Files:**
- Create: `src-tauri/migrations/002_wiki_tables.sql`
- Modify: `src-tauri/src/lib.rs`（或 `main.rs`，看 Phase 5b 註冊在哪）
- Modify: `src/lib/db.ts`（Dexie v5）
- Modify: `src/stores/projectStore.ts`（createChapter 補預設值）

- [ ] **Step 1: 新增 SQLite migration 002**

Create `src-tauri/migrations/002_wiki_tables.sql`：

```sql
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
```

> 不在這條 migration 動 `chapters` 表 — Tauri 的 chapters 走 `data JSON` 欄位，新欄位透過 JSON 自動包含；TypeScript 型別已在 Task 2 加好，sqlite-helpers `chapterToRow` 直接 JSON.stringify 即可。**不需 ALTER TABLE chapters。**

- [ ] **Step 2: 把 002 註冊進 Tauri 的 SQL plugin**

開啟 `src-tauri/src/lib.rs`（Phase 5b 註冊 migrations 的檔案；若是 main.rs 同理）。找到既有的 `.add_migrations(...)` 區塊（含 001_initial），在 migrations Vec 內新增第二筆：

```rust
tauri_plugin_sql::Migration {
    version: 2,
    description: "wiki_pages and wiki_log",
    sql: include_str!("../migrations/002_wiki_tables.sql"),
    kind: tauri_plugin_sql::MigrationKind::Up,
},
```

> 若不確定 001 寫法長相，先 `grep -n "add_migrations\|MigrationKind" src-tauri/src/*.rs`，照 001 的寫法擺第二條。版本號**必須**是 `2`、且大於 001 的版本號。

- [ ] **Step 3: Dexie v5（既有 chapters 表加 wikiSyncStatus 索引，並 upgrade 補預設值）**

Edit `src/lib/db.ts` — 在 v4 區塊後追加 v5：

```ts
    // v5 — 章節新增 wikiSyncedHash / wikiSyncStatus；wiki_pages / wiki_log 兩新表
    this.version(5)
      .stores({
        projects: 'id, createdAt, updatedAt',
        chapters: 'id, projectId, order, wikiSyncStatus',
        versions: 'id, chapterId, createdAt',
        characters: 'id, projectId, name',
        settings: 'id',
        appMeta: 'key',
        wikiPages: 'id, bookId, [bookId+type+slug]',
        wikiLog: 'id, bookId, batchId, appliedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('chapters').toCollection().modify((c: Chapter) => {
          if (c.wikiSyncedHash === undefined) c.wikiSyncedHash = null;
          if (c.wikiSyncStatus === undefined) {
            c.wikiSyncStatus = c.wikiSyncedAt ? 'synced' : 'unsynced';
          }
        });
      });
```

同時在 `NovelDB` class 內新增兩個 Table 宣告：

```ts
  wikiPages!: Table<WikiPage>;
  wikiLog!: Table<WikiLogEntry>;
```

且檔頂 import 加上：

```ts
import type { Project, Chapter, ChapterVersion, Character, LLMConfig, WikiPage, WikiLogEntry } from '../types';
```

- [ ] **Step 4: `projectStore.createChapter` 補預設值**

Edit `src/stores/projectStore.ts` — `createChapter` 內把：
```ts
      content: '', referenceChapterId: null, wikiSyncedAt: null,
```
改為：
```ts
      content: '', referenceChapterId: null,
      wikiSyncedAt: null, wikiSyncedHash: null, wikiSyncStatus: 'unsynced',
```

- [ ] **Step 5: TS 編譯歸零**

```bash
npx tsc -b --noEmit
```

Expected: 0 errors。若還剩 Chapter 相關錯誤，逐一處理（多半是 mock / seed 之類靜態定義缺新欄位）。

- [ ] **Step 6: 桌面手動 smoke — migration 真的跑了**

```bash
npm run tauri dev
```

啟動後：
1. 在 app 內隨便建一本書 → 加一章 → 寫點正文 → 關閉視窗
2. 用 better-sqlite3 探針檢查：

Create `temp/probe-wiki-schema.ts`：
```ts
import Database from 'better-sqlite3';
const db = new Database('C:/Users/Leo/AppData/Roaming/com.novelgenerator.app/novel-generator.db', { readonly: true });
console.log('tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all());
console.log('wiki_pages cols:', db.prepare("PRAGMA table_info(wiki_pages)").all());
console.log('wiki_log cols:',   db.prepare("PRAGMA table_info(wiki_log)").all());
```

```bash
cd /tmp && npm i better-sqlite3 2>/dev/null
cd /c/Leo/Project/novel-generator && NODE_PATH=/tmp/node_modules npx tsx temp/probe-wiki-schema.ts
```

Expected: tables 列表含 `wiki_pages` 和 `wiki_log`；columns 與 SQL 對齊（`book_id`、`batch_id`、`page_snapshot_before/after` 等都在）。

- [ ] **Step 7: 瀏覽器手動 smoke — Dexie upgrade**

```bash
npm run dev
```

- 開瀏覽器，DevTools → Application → IndexedDB → NovelGenerator → 確認 `wikiPages` / `wikiLog` 兩個 object store 存在
- 既有 chapter 物件應有 `wikiSyncStatus='unsynced'`、`wikiSyncedHash=null`

- [ ] **Step 8: Commit**

```bash
git add src-tauri/migrations/002_wiki_tables.sql src-tauri/src/ src/lib/db.ts src/stores/projectStore.ts
git commit -m "feat(schema): wiki_pages + wiki_log tables (Dexie v5 + SQLite v2)"
```

---

## Task 4: StorageAdapter Wiki ops（介面 + Dexie + Tauri 雙實作）

**Files:**
- Modify: `src/lib/storage/types.ts`
- Modify: `src/lib/storage/dexie-adapter.ts`
- Modify: `src/lib/storage/tauri-sqlite-adapter.ts`
- Modify: `src/lib/storage/sqlite-helpers.ts`

- [ ] **Step 1: 介面定義（types.ts）**

Edit `src/lib/storage/types.ts`。檔頂 import 加：
```ts
import type {
  Project, Chapter, ChapterVersion, Character,
  WikiPage, WikiLogEntry, WikiPageType,
} from '../../types';
```

在 `AppMetaStore` 後新增：

```ts
export interface WikiPagesStore {
  list(bookId: string): Promise<WikiPage[]>;
  get(id: string): Promise<WikiPage | undefined>;
  findBySlug(bookId: string, type: WikiPageType, slug: string): Promise<WikiPage | undefined>;
  add(page: WikiPage): Promise<void>;
  update(page: WikiPage): Promise<void>;
  delete(id: string): Promise<void>;
  /** SUM(length(content_md)) over the book */
  totalLength(bookId: string): Promise<number>;
  /** 給匯出 / 級聯用 */
  listAll(): Promise<WikiPage[]>;
  deleteByBook(bookId: string): Promise<void>;
}

export interface WikiLogStore {
  list(bookId: string, limit?: number): Promise<WikiLogEntry[]>;
  listByBatch(bookId: string, batchId: string): Promise<WikiLogEntry[]>;
  add(entry: WikiLogEntry): Promise<void>;
  updateStatus(id: string, opStatus: WikiLogEntry['opStatus'], errorMessage?: string): Promise<void>;
  /** 給匯出 / 級聯用 */
  listAll(): Promise<WikiLogEntry[]>;
  deleteByBook(bookId: string): Promise<void>;
}
```

修改 `StorageBundle`：

```ts
export interface StorageBundle {
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
  wikiPages?: WikiPage[];   // 向後相容：舊 backup 缺此欄位視為空
  wikiLog?: WikiLogEntry[];
}
```

修改 `StorageAdapter`：

```ts
export interface StorageAdapter {
  projects: ProjectStore;
  chapters: ChapterStore;
  versions: VersionStore;
  characters: CharacterStore;
  appMeta: AppMetaStore;
  wikiPages: WikiPagesStore;
  wikiLog: WikiLogStore;

  replaceAll(bundle: StorageBundle): Promise<void>;
}
```

- [ ] **Step 2: Dexie 實作**

Edit `src/lib/storage/dexie-adapter.ts`。檔頂 import 加：
```ts
import type {
  StorageAdapter, ProjectStore, ChapterStore, VersionStore, CharacterStore,
  AppMetaStore, WikiPagesStore, WikiLogStore, StorageBundle,
} from './types';
import type { WikiPage, WikiLogEntry, WikiPageType } from '../../types';
```

在 `characters` 區塊後加：

```ts
const wikiPages: WikiPagesStore = {
  list: (bookId) => db.wikiPages.where('bookId').equals(bookId).toArray(),
  get: (id) => db.wikiPages.get(id),
  findBySlug: (bookId, type, slug) =>
    db.wikiPages.where('[bookId+type+slug]').equals([bookId, type, slug]).first(),
  add: async (p) => { await db.wikiPages.add(p); },
  update: async (p) => { await db.wikiPages.put(p); },     // full replace, includes updatedAt
  delete: (id) => db.wikiPages.delete(id),
  totalLength: async (bookId) => {
    const pages = await db.wikiPages.where('bookId').equals(bookId).toArray();
    return pages.reduce((sum, p) => sum + (p.contentMd?.length ?? 0), 0);
  },
  listAll: () => db.wikiPages.toArray(),
  deleteByBook: async (bookId) => {
    await db.wikiPages.where('bookId').equals(bookId).delete();
  },
};

const wikiLog: WikiLogStore = {
  list: async (bookId, limit) => {
    let q = db.wikiLog.where('bookId').equals(bookId);
    const arr = await q.sortBy('appliedAt');
    arr.reverse();
    return limit ? arr.slice(0, limit) : arr;
  },
  listByBatch: (bookId, batchId) =>
    db.wikiLog.where('batchId').equals(batchId).toArray()
      .then((arr) => arr.filter((e) => e.bookId === bookId)),
  add: async (e) => { await db.wikiLog.add(e); },
  updateStatus: async (id, opStatus, errorMessage) => {
    await db.wikiLog.update(id, { opStatus, errorMessage });
  },
  listAll: () => db.wikiLog.toArray(),
  deleteByBook: async (bookId) => {
    await db.wikiLog.where('bookId').equals(bookId).delete();
  },
};
```

修改 `replaceAll`：

```ts
async function replaceAll(bundle: StorageBundle): Promise<void> {
  await db.transaction('rw',
    [db.projects, db.chapters, db.versions, db.characters, db.wikiPages, db.wikiLog],
    async () => {
      await db.projects.clear();
      await db.chapters.clear();
      await db.versions.clear();
      await db.characters.clear();
      await db.wikiPages.clear();
      await db.wikiLog.clear();
      await db.projects.bulkAdd(bundle.projects ?? []);
      await db.chapters.bulkAdd(bundle.chapters ?? []);
      await db.versions.bulkAdd(bundle.versions ?? []);
      await db.characters.bulkAdd(bundle.characters ?? []);
      // pages → log 順序（spec §3.4）
      await db.wikiPages.bulkAdd(bundle.wikiPages ?? []);
      await db.wikiLog.bulkAdd(bundle.wikiLog ?? []);
    },
  );
}
```

修改最後的 export：

```ts
export const dexieAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  wikiPages, wikiLog,
  replaceAll,
};
```

- [ ] **Step 3: sqlite-helpers 加 wiki row converters**

Edit `src/lib/storage/sqlite-helpers.ts`。檔頂 import 加：
```ts
import type { WikiPage, WikiLogEntry } from '../../types';
```

在檔末新增：

```ts
// ---------- Wiki rows ----------

export interface WikiPageRow {
  id: string;
  book_id: string;
  type: string;
  slug: string;
  title: string;
  aliases: string;          // JSON string
  related_slugs: string;    // JSON string
  description: string;
  content_md: string;
  created_at: number;
  updated_at: number;
}

export interface WikiLogRow {
  id: string;
  book_id: string;
  batch_id: string;
  applied_at: number;
  kind: string;
  op_status: string;
  page_id: string | null;
  page_type: string;
  page_slug: string;
  page_snapshot_before: string | null;
  page_snapshot_after: string | null;
  source: string;
  summary: string;
  error_message: string | null;
}

export function wikiPageToRow(p: WikiPage): WikiPageRow {
  return {
    id: p.id,
    book_id: p.bookId,
    type: p.type,
    slug: p.slug,
    title: p.title,
    aliases: JSON.stringify(p.aliases ?? []),
    related_slugs: JSON.stringify(p.relatedSlugs ?? []),
    description: p.description ?? '',
    content_md: p.contentMd,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function rowToWikiPage(r: WikiPageRow): WikiPage {
  return {
    id: r.id,
    bookId: r.book_id,
    type: r.type as WikiPage['type'],
    slug: r.slug,
    title: r.title,
    aliases: JSON.parse(r.aliases || '[]'),
    relatedSlugs: JSON.parse(r.related_slugs || '[]'),
    description: r.description ?? '',
    contentMd: r.content_md,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function wikiLogToRow(e: WikiLogEntry): WikiLogRow {
  return {
    id: e.id,
    book_id: e.bookId,
    batch_id: e.batchId,
    applied_at: e.appliedAt,
    kind: e.kind,
    op_status: e.opStatus,
    page_id: e.pageId,
    page_type: e.pageType,
    page_slug: e.pageSlug,
    page_snapshot_before: e.pageSnapshotBefore ? JSON.stringify(e.pageSnapshotBefore) : null,
    page_snapshot_after:  e.pageSnapshotAfter  ? JSON.stringify(e.pageSnapshotAfter)  : null,
    source: e.source,
    summary: e.summary,
    error_message: e.errorMessage ?? null,
  };
}

export function rowToWikiLog(r: WikiLogRow): WikiLogEntry {
  return {
    id: r.id,
    bookId: r.book_id,
    batchId: r.batch_id,
    appliedAt: r.applied_at,
    kind: r.kind as WikiLogEntry['kind'],
    opStatus: r.op_status as WikiLogEntry['opStatus'],
    pageId: r.page_id,
    pageType: r.page_type as WikiLogEntry['pageType'],
    pageSlug: r.page_slug,
    pageSnapshotBefore: r.page_snapshot_before ? JSON.parse(r.page_snapshot_before) : null,
    pageSnapshotAfter:  r.page_snapshot_after  ? JSON.parse(r.page_snapshot_after)  : null,
    source: r.source,
    summary: r.summary,
    errorMessage: r.error_message ?? undefined,
  };
}
```

- [ ] **Step 4: Tauri SQLite 實作**

Edit `src/lib/storage/tauri-sqlite-adapter.ts`。檔頂 import 加：
```ts
import {
  wikiPageToRow, rowToWikiPage, wikiLogToRow, rowToWikiLog,
  type WikiPageRow, type WikiLogRow,
} from './sqlite-helpers';
import type { WikiPage, WikiLogEntry, WikiPageType } from '../../types';
import type { WikiPagesStore, WikiLogStore } from './types';
```

在 `characters` 區塊後加：

```ts
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
```

修改 `replaceAll`（順序：pages → log）：

```ts
async function replaceAll(bundle: StorageBundle): Promise<void> {
  const db = await getDb();
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
}
```

修改 export：

```ts
export const tauriSqliteAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  wikiPages, wikiLog,
  replaceAll,
};
```

- [ ] **Step 5: TS 編譯通過**

```bash
npx tsc -b --noEmit
```

Expected: 0 errors。

- [ ] **Step 6: 雙平台 ad-hoc smoke**

Create `temp/probe-wiki-adapter.ts`：
```ts
// 跑兩次：先 npm run dev 開瀏覽器跑 DevTools console，再 tauri dev 跑同樣事
// 此腳本貼進 DevTools console（或在 main.tsx 內暫時 import 後跑）
import { storage } from './src/lib/storage';
import { v4 as uuid } from 'uuid';

const bookId = 'probe-book';
const page = {
  id: uuid(), bookId, type: 'entity' as const, slug: 'test-li',
  title: '測試李', aliases: ['小李'], relatedSlugs: [],
  description: '探針', contentMd: '# 測試李\n\n探針內容', createdAt: Date.now(), updatedAt: Date.now(),
};
await storage.wikiPages.add(page);
console.log('list:', await storage.wikiPages.list(bookId));
console.log('findBySlug:', await storage.wikiPages.findBySlug(bookId, 'entity', 'test-li'));
console.log('totalLength:', await storage.wikiPages.totalLength(bookId));
await storage.wikiPages.deleteByBook(bookId);
console.log('after delete:', await storage.wikiPages.list(bookId));
```

驗證方式（兩個平台都跑）：
1. 瀏覽器版：`npm run dev` → DevTools console → 貼上腳本身（去掉 import，改用 `await import('./src/lib/storage')` 或乾脆放進 main.tsx 暫測）
2. 桌面版：`npm run tauri dev` → 同上

Expected: 兩平台都印出 1 筆 page、findBySlug 命中、totalLength = contentMd.length（中文每字 1）、最後刪除為空陣列。

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/
git commit -m "feat(storage): WikiOps + WikiLogOps in both adapters"
```

---

## Task 5: Bundle 版本升級 + cascade delete + 匯入向後相容

**Files:**
- Modify: `src/lib/backup.ts`
- Modify: `src/stores/projectStore.ts`（deleteProject 級聯 wiki）

- [ ] **Step 1: BackupSnapshot 升 v2**

Edit `src/lib/backup.ts`：

```ts
import type {
  Project, Chapter, ChapterVersion, Character,
  WikiPage, WikiLogEntry,
} from '../types';

// v1: 無 wiki；v2: 含 wikiPages / wikiLog
export const BACKUP_SCHEMA_VERSION = 2 as const;
export const BACKUP_FILENAME = 'novel-generator-backup.json';

export interface BackupSnapshot {
  schema: 1 | 2;                   // 接受讀入 v1 與 v2，輸出固定 v2
  exportedAt: number;
  app: 'novel-generator';
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
  wikiPages?: WikiPage[];          // v1 缺欄位
  wikiLog?: WikiLogEntry[];        // v1 缺欄位
}
```

修改 `exportSnapshot`：

```ts
export async function exportSnapshot(): Promise<BackupSnapshot> {
  const [projects, chapters, versions, characters, wikiPages, wikiLog] = await Promise.all([
    storage.projects.list(),
    storage.chapters.list(),
    storage.versions.list(),
    storage.characters.list(),
    storage.wikiPages.listAll(),
    storage.wikiLog.listAll(),
  ]);
  return {
    schema: 2,
    exportedAt: Date.now(),
    app: 'novel-generator',
    projects, chapters, versions, characters, wikiPages, wikiLog,
  };
}
```

修改 `importSnapshot` 的校驗 + replaceAll：

```ts
export async function importSnapshot(snapshot: BackupSnapshot, mode: 'replace' = 'replace'): Promise<void> {
  if (snapshot?.app !== 'novel-generator') {
    throw new Error('檔案格式不是 novel-generator 備份');
  }
  if (snapshot.schema !== 1 && snapshot.schema !== 2) {
    throw new Error(`不支援的備份版本：${snapshot.schema}（目前支援 v1, v2）`);
  }

  if (mode === 'replace') {
    await storage.replaceAll({
      projects: snapshot.projects ?? [],
      chapters: (snapshot.chapters ?? []).map(upgradeChapterV1ToV2),
      versions: snapshot.versions ?? [],
      characters: snapshot.characters ?? [],
      wikiPages: snapshot.wikiPages ?? [],
      wikiLog: snapshot.wikiLog ?? [],
    });
  }
}

/** v1 backup 的 chapter 沒有 wikiSyncedHash / wikiSyncStatus，補預設值 */
function upgradeChapterV1ToV2(c: Chapter): Chapter {
  return {
    ...c,
    wikiSyncedHash: c.wikiSyncedHash ?? null,
    wikiSyncStatus: c.wikiSyncStatus ?? (c.wikiSyncedAt ? 'synced' : 'unsynced'),
  };
}
```

修改 `describeSnapshot` 顯示 wiki 計數：

```ts
export function describeSnapshot(s: BackupSnapshot): string {
  const t = new Date(s.exportedAt).toLocaleString();
  const wiki = s.wikiPages?.length ?? 0;
  return `${s.projects?.length ?? 0} 本書 · ${s.chapters?.length ?? 0} 章節 · ${s.characters?.length ?? 0} 角色 · ${wiki} Wiki 頁 · 匯出於 ${t}`;
}
```

- [ ] **Step 2: deleteProject 級聯 wiki**

Edit `src/stores/projectStore.ts` — `deleteProject` 內，在 `storage.characters.deleteByProject(id)` 之後、`storage.projects.delete(id)` 之前加：

```ts
    await storage.wikiPages.deleteByBook(id);
    await storage.wikiLog.deleteByBook(id);
```

- [ ] **Step 3: TS 編譯 + smoke**

```bash
npx tsc -b --noEmit
```

驗收 smoke（瀏覽器版）：
1. 建一本書、加幾頁 wiki（用 Step 6 探針）
2. 匯出 backup → JSON 內含 `schema: 2`、`wikiPages: [...]`
3. 刪該書 → 重新整理 → wiki_pages / wiki_log 該 bookId 為 0 筆
4. 匯入剛才的 backup → 書 + wiki 都回來

具體探針 `temp/probe-bundle.ts`：
```ts
// 在 main.tsx 暫時 import 並呼叫，或貼進 DevTools console
import { exportSnapshot, importSnapshot, describeSnapshot } from './src/lib/backup';
const snap = await exportSnapshot();
console.log(describeSnapshot(snap));
console.log('schema:', snap.schema, 'wiki:', snap.wikiPages?.length, snap.wikiLog?.length);
```

Expected: schema=2、wikiPages / wikiLog 數字反映實際內容。

- [ ] **Step 4: Commit**

```bash
git add src/lib/backup.ts src/stores/projectStore.ts
git commit -m "feat(backup): schema v2 with wikiPages/wikiLog + cascade delete"
```

---

## Task 6: `tokens.ts` — 估算抽象

**Files:**
- Create: `src/lib/tokens.ts`

- [ ] **Step 1: 寫實作**

Create `src/lib/tokens.ts`：

```ts
/**
 * Token 估算抽象（Phase 2 保守版）
 *
 * 中文混雜英文時，1.5 char/token 是保守估算（漢字偏向 1.0~1.5 token/字、
 * 英文偏向 4 char/token）。實際 prompt 上送會比預估多一點，這正是我們要的
 * — 寧可預留空間，也不要因為樂觀估算讓 prompt 超 budget 被截斷。
 *
 * 未來（Phase 2.5+）可換成 tiktoken-wasm 或 provider-specific tokenizer，
 * 呼叫端不必改。
 */
const CHARS_PER_TOKEN = 1.5;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tokensToChars(tokens: number): number {
  if (tokens <= 0) return 0;
  return Math.floor(tokens * CHARS_PER_TOKEN);
}

export function estimateCharsPerToken(): number {
  return CHARS_PER_TOKEN;
}
```

- [ ] **Step 2: 探針驗證**

Create `temp/probe-tokens.ts`：
```ts
import { estimateTokens, tokensToChars } from '../src/lib/tokens';

const cases = [
  '',
  '你好',                      // 2 中文 → 2/1.5 = 2 tokens
  'hello',                     // 5 字母 → 4 tokens (ceil(5/1.5))
  '中文混English夾雜123',
];
for (const t of cases) console.log(JSON.stringify(t), '→', estimateTokens(t), 'tokens');
console.log('tokensToChars(1000) =', tokensToChars(1000));
```

Run:
```bash
npx tsx temp/probe-tokens.ts
```

Expected:
- `""` → 0
- `"你好"` → 2
- `"hello"` → 4
- `tokensToChars(1000)` → 1500

- [ ] **Step 3: Commit**

```bash
git add src/lib/tokens.ts
git commit -m "feat(tokens): conservative 1.5 char/token estimator abstraction"
```

---

## Task 7: `wiki-parser.ts` — 解析 LLM 輸出 markdown 為頁面欄位

**Files:**
- Create: `src/lib/wiki-parser.ts`

> 規格參考：spec §4.3「Apply 輸出格式」與 §4.7「Prompt 移植規則」

- [ ] **Step 1: 寫實作**

Create `src/lib/wiki-parser.ts`：

```ts
/**
 * 解析 Apply LLM 輸出的完整頁面 markdown，產出可寫入 wiki_pages 的欄位。
 *
 * 規範：spec §4.3
 *   - 第一行 `# <Title>` 是顯示標題
 *   - 第一段 `> ` blockquote（連續 `> ` 行）含 `**Type:** ...`, `**Aliases:** ...`, `**Related:** ...`
 *   - 第一個 `## <section>` 之後是 prose
 *   - 全文 = contentMd
 *
 * 容錯：blockquote 不存在時 metadata 用 defaults；# Title 行不存在用 fallbackTitle。
 */
import type { WikiPageType, WikiPageRelated } from '../types';

export interface ParsedWikiPage {
  title: string;
  aliases: string[];
  relatedSlugs: WikiPageRelated[];
  /** 從第一段純 prose 取的 1-line description（給 index 用，60 字截斷） */
  fallbackDescription: string;
  contentMd: string;
}

const TYPES: readonly WikiPageType[] =
  ['concept', 'entity', 'summary', 'compare', 'synthesis'] as const;

export function parseWikiPageMarkdown(md: string, fallbackTitle = '(未命名)'): ParsedWikiPage {
  const lines = md.split(/\r?\n/);
  let title = fallbackTitle;
  const aliases: string[] = [];
  const relatedSlugs: WikiPageRelated[] = [];

  // 1) Title
  const h1Idx = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (h1Idx >= 0) title = lines[h1Idx].replace(/^#\s+/, '').trim();

  // 2) Blockquote metadata（h1 之後、第一個 ## 之前）
  const h2Idx = lines.findIndex((l, i) => i > h1Idx && /^##\s+/.test(l));
  const metaEnd = h2Idx >= 0 ? h2Idx : lines.length;
  for (let i = h1Idx + 1; i < metaEnd; i++) {
    const line = lines[i];
    if (!/^>/.test(line)) continue;
    const stripped = line.replace(/^>\s?/, '');
    // **Aliases:** 小李, 老李
    const ma = stripped.match(/^\*\*Aliases:\*\*\s*(.+)$/);
    if (ma) {
      ma[1].split(/[，,]/).map((s) => s.trim()).filter(Boolean).forEach((a) => aliases.push(a));
      continue;
    }
    // **Related:** [Foo](../entity/foo.md), [Bar](concept/bar.md)
    const mr = stripped.match(/^\*\*Related:\*\*\s*(.+)$/);
    if (mr) {
      const refs = mr[1].matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
      for (const r of refs) {
        const parsed = parseRelatedRef(r[1]);
        if (parsed) relatedSlugs.push(parsed);
      }
      continue;
    }
    // **Type:** entity   ← 我們已知 type，不用回填，但容錯保留
  }

  // 3) Fallback description：第一段純 prose（非 #, 非 >）的前 60 字
  let proseStart = h2Idx >= 0 ? h2Idx + 1 : metaEnd;
  while (proseStart < lines.length && !lines[proseStart].trim()) proseStart++;
  let paragraph = '';
  for (let i = proseStart; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) break;
    if (/^[#>\-*]/.test(l)) break;
    paragraph += (paragraph ? ' ' : '') + l;
  }
  const fallbackDescription =
    paragraph.length > 60 ? paragraph.slice(0, 60) + '…' : paragraph;

  return { title, aliases, relatedSlugs, fallbackDescription, contentMd: md };
}

/** 解析 markdown link 內的路徑為 {type, slug} — 例如 "../entity/foo.md" → {entity, foo} */
function parseRelatedRef(href: string): WikiPageRelated | null {
  // 支援 `entity/foo.md`、`../entity/foo.md`、`./entity/foo.md`、`entity/foo`
  const cleaned = href.replace(/^\.\.?\//, '').replace(/\.md$/, '');
  const parts = cleaned.split('/');
  if (parts.length < 2) return null;
  const type = parts[parts.length - 2];
  const slug = parts[parts.length - 1];
  if (!TYPES.includes(type as WikiPageType)) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  return { type: type as WikiPageType, slug };
}
```

- [ ] **Step 2: 探針**

Create `temp/probe-wiki-parser.ts`：
```ts
import { parseWikiPageMarkdown } from '../src/lib/wiki-parser';

const md = `# 李明

> **Type:** entity
> **Aliases:** 小李，老李
> **Related:** [主角](../entity/protagonist.md), [拜師](summary/ch5.md)

## 概述

李明是主角在第 5 章收的徒弟，劍術天才，16 歲。

## 出處

- 第 5 章「拜師」`;

const r = parseWikiPageMarkdown(md);
console.log('title:', r.title);
console.log('aliases:', r.aliases);
console.log('relatedSlugs:', r.relatedSlugs);
console.log('fallbackDescription:', r.fallbackDescription);
console.log('contentMd len:', r.contentMd.length);

// 容錯案例：無 blockquote、無 H1
const bare = '光禿正文。';
console.log('bare:', parseWikiPageMarkdown(bare, '備援標題'));
```

Run:
```bash
npx tsx temp/probe-wiki-parser.ts
```

Expected:
- title=「李明」
- aliases=`['小李','老李']`
- relatedSlugs=`[{type:'entity',slug:'protagonist'}, {type:'summary',slug:'ch5'}]`
- fallbackDescription 為「李明是主角在第 5 章收的徒弟，劍術天才，16 歲。」（< 60 字未截）
- bare 案例：title='備援標題'，aliases/relatedSlugs 空陣列

- [ ] **Step 3: Commit**

```bash
git add src/lib/wiki-parser.ts
git commit -m "feat(wiki): markdown parser for LLM page output"
```

---

## Task 8: `wiki-plan.ts` — Plan JSON 解析、校驗、衝突降級

**Files:**
- Create: `src/lib/wiki-plan.ts`

> 規格參考：spec §4.2 Plan JSON 格式、§4.4 校驗規則、§4.7 容錯（filesystem path → type+slug normalize）

- [ ] **Step 1: 寫實作**

Create `src/lib/wiki-plan.ts`：

```ts
/**
 * Plan JSON 解析 / 校驗 / slug 正規化 / 衝突降級
 *
 * 規範：spec §4.2 §4.4 §4.7
 *
 * 輸入：LLM 回傳的 raw text + 當前 wiki index（type+slug→page）
 * 輸出：normalized + validated PlanOperations
 *
 * 校驗失敗（不可自動修復）會 throw；可自動修復的（如 slug 衝突）會降級並回 warnings。
 */
import type { WikiPage, WikiPageType } from '../types';

const TYPES: readonly WikiPageType[] =
  ['concept', 'entity', 'summary', 'compare', 'synthesis'] as const;

export interface PlanCreateOp {
  action: 'create';
  type: WikiPageType;
  slug: string;
  title: string;
  aliases: string[];
  description?: string;
  reason: string;
  content_brief: string;
}

export interface PlanUpdateOp {
  action: 'update';
  type: WikiPageType;
  slug: string;
  reason: string;
  change_brief: string;
}

export type PlanOp = PlanCreateOp | PlanUpdateOp;

export interface UnrecordedCharacter {
  name: string;
  sourceExcerpt: string;
}

export interface Plan {
  operations: PlanOp[];
  log_entry: string;
  unrecorded_characters: UnrecordedCharacter[];
  warnings: string[];      // 由校驗階段填入：「li-ming 已存在 → 自動改為 update」之類
}

/** 寬鬆地把 LLM 輸出剝出純 JSON（去除 ```json fence、前後白話） */
export function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  // 找第一個 { 與最後一個 } 之間
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return raw.trim();
}

export interface PlanValidationContext {
  /** 當前 wiki index — 用 key="type/slug" 查 */
  existing: Map<string, WikiPage>;
}

/** 1. parse → 2. normalize slug → 3. validate against index → 4. downgrade conflicts */
export function parseAndValidatePlan(raw: string, ctx: PlanValidationContext): Plan {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(raw));
  } catch (e) {
    throw new Error(`Plan JSON 解析失敗：${(e as Error).message}`);
  }
  if (!json || typeof json !== 'object') throw new Error('Plan 不是物件');

  const obj = json as Record<string, unknown>;
  const opsRaw = (obj.operations ?? []) as Array<Record<string, unknown>>;
  const warnings: string[] = [];
  const seen = new Set<string>();                  // type/slug，避免同批重複
  const operations: PlanOp[] = [];

  for (const raw of opsRaw) {
    const action = raw.action;
    if (action !== 'create' && action !== 'update') {
      warnings.push(`未知 action "${String(action)}"，跳過`);
      continue;
    }
    let { type, slug } = normalizeTypeSlug(raw, warnings);
    if (!type || !slug) continue;

    const key = `${type}/${slug}`;
    if (seen.has(key)) {
      warnings.push(`同批重複 ${key}，後者覆寫前者`);
      // 移除前者
      const idx = operations.findIndex((o) => `${o.type}/${o.slug}` === key);
      if (idx >= 0) operations.splice(idx, 1);
    }
    seen.add(key);

    const existsInIndex = ctx.existing.has(key);

    if (action === 'create' && existsInIndex) {
      // 降級為 update（spec §4.4）
      warnings.push(`create ${key} 已存在 → 自動改為 update`);
      const op: PlanUpdateOp = {
        action: 'update',
        type, slug,
        reason: String(raw.reason ?? '合併新資訊'),
        change_brief: String(raw.content_brief ?? raw.change_brief ?? '合併新資訊'),
      };
      operations.push(op);
      continue;
    }
    if (action === 'update' && !existsInIndex) {
      warnings.push(`update ${key} 不存在 → 自動改為 create`);
      const op: PlanCreateOp = {
        action: 'create',
        type, slug,
        title: String(raw.title ?? slug),
        aliases: toStringArray(raw.aliases),
        description: typeof raw.description === 'string' ? raw.description : undefined,
        reason: String(raw.reason ?? '新建（原 update 不存在）'),
        content_brief: String(raw.change_brief ?? raw.content_brief ?? ''),
      };
      operations.push(op);
      continue;
    }

    if (action === 'create') {
      operations.push({
        action: 'create',
        type, slug,
        title: String(raw.title ?? slug),
        aliases: toStringArray(raw.aliases),
        description: typeof raw.description === 'string' ? raw.description : undefined,
        reason: String(raw.reason ?? ''),
        content_brief: String(raw.content_brief ?? ''),
      });
    } else {
      operations.push({
        action: 'update',
        type, slug,
        reason: String(raw.reason ?? ''),
        change_brief: String(raw.change_brief ?? ''),
      });
    }
  }

  return {
    operations,
    log_entry: String(obj.log_entry ?? `ingest pages_created=${operations.filter(o => o.action==='create').length} pages_updated=${operations.filter(o => o.action==='update').length}`),
    unrecorded_characters: parseUnrecorded(obj.unrecorded_characters),
    warnings,
  };
}

/**
 * 從 op 取出 type / slug，含 spec §4.7 容錯：
 *   - 直接給 {type, slug}：OK
 *   - 給 path 形式 "entity/protagonist.md"：split → 第一段 type、第二段去 .md
 *   - slug 強制 ASCII kebab-case；若 LLM 給中文，正規化（lowercase + 非字母數字換 -）
 */
function normalizeTypeSlug(
  raw: Record<string, unknown>,
  warnings: string[],
): { type: WikiPageType | null; slug: string | null } {
  let type = raw.type as string | undefined;
  let slug = raw.slug as string | undefined;
  const path = raw.path as string | undefined;

  if ((!type || !slug) && typeof path === 'string') {
    const cleaned = path.replace(/^\.\.?\//, '').replace(/\.md$/, '');
    const parts = cleaned.split('/');
    if (parts.length >= 2) {
      type = type ?? parts[parts.length - 2];
      slug = slug ?? parts[parts.length - 1];
    }
  }
  if (!type || !TYPES.includes(type as WikiPageType)) {
    warnings.push(`非法 type "${String(type)}"，跳過`);
    return { type: null, slug: null };
  }
  if (!slug) {
    warnings.push('缺 slug，跳過');
    return { type: null, slug: null };
  }
  // ASCII kebab-case 正規化
  const normalized = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
  if (!normalized) {
    warnings.push(`slug "${slug}" 正規化後為空，跳過`);
    return { type: null, slug: null };
  }
  if (normalized !== slug) warnings.push(`slug "${slug}" → "${normalized}"`);
  return { type: type as WikiPageType, slug: normalized };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function parseUnrecorded(v: unknown): UnrecordedCharacter[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return { name: x, sourceExcerpt: '' };
      if (x && typeof x === 'object') {
        return {
          name: String((x as Record<string, unknown>).name ?? ''),
          sourceExcerpt: String((x as Record<string, unknown>).sourceExcerpt ?? ''),
        };
      }
      return null;
    })
    .filter((c): c is UnrecordedCharacter => !!c && !!c.name);
}
```

- [ ] **Step 2: 探針**

Create `temp/probe-wiki-plan.ts`：
```ts
import { parseAndValidatePlan } from '../src/lib/wiki-plan';
import type { WikiPage } from '../src/types';

const existing = new Map<string, WikiPage>();
existing.set('entity/protagonist', {
  id: 'p1', bookId: 'b1', type: 'entity', slug: 'protagonist',
  title: '主角', aliases: [], relatedSlugs: [],
  description: '', contentMd: '# 主角', createdAt: 0, updatedAt: 0,
});

const raw = '```json\n' + JSON.stringify({
  operations: [
    { action: 'create', type: 'entity', slug: 'li-ming', title: '李明',
      aliases: ['小李'], reason: 'ch5', content_brief: '徒弟' },
    // 衝突，應降級為 update
    { action: 'create', type: 'entity', slug: 'protagonist', title: '主角',
      reason: '揭真名', content_brief: '名為陳遠' },
    // path 形式容錯
    { action: 'update', path: '../concept/fire-magic.md',
      reason: 'ch5 新規則', change_brief: '加註火元素的代價' },
    // 非法 type
    { action: 'create', type: 'badtype', slug: 'x', title: 'x', reason: '', content_brief: '' },
    // 中文 slug 正規化
    { action: 'create', type: 'entity', slug: '李四', title: '李四', reason: 'ch5', content_brief: '' },
  ],
  log_entry: 'ingest chapter=5',
  unrecorded_characters: [
    { name: '王芳', sourceExcerpt: '...走進來王芳...' },
    '張三',
  ],
}) + '\n```';

const plan = parseAndValidatePlan(raw, { existing });
console.log(JSON.stringify(plan, null, 2));
```

Run:
```bash
npx tsx temp/probe-wiki-plan.ts
```

Expected ops（順序可能不同）：
1. create entity/li-ming
2. **update** entity/protagonist（從 create 降級，warning 帶 reason）
3. update concept/fire-magic（path 容錯成功）
4. （非法 type 被跳過，警告紀錄）
5. create entity/li-si（slug 從「李四」正規化失敗 → 變空字串 → 跳過，warning）
   - **驗證**：中文 slug 正規化後為空，這條應被跳過。實作正確的話 plan 內不會有它。

unrecorded_characters: `[{name:'王芳',sourceExcerpt:'...走進來王芳...'},{name:'張三',sourceExcerpt:''}]`

warnings 內應出現：`create entity/protagonist 已存在 → 自動改為 update`、`非法 type "badtype"`、`slug "李四" 正規化後為空`。

- [ ] **Step 3: Commit**

```bash
git add src/lib/wiki-plan.ts
git commit -m "feat(wiki): Plan JSON parser with normalization & conflict downgrade"
```

---

## Task 9: `wiki-relevance.ts` — Cheap filter（needles + scoring）

**Files:**
- Create: `src/lib/wiki-relevance.ts`

> 規格參考：spec §5.3 Step 1（明確規則：2-4 字滑動窗、字頻 top 50、純 JS 零依賴）

- [ ] **Step 1: 寫實作**

Create `src/lib/wiki-relevance.ts`：

```ts
/**
 * Cheap relevance filter（Phase 2 — 純 JS 零依賴）
 *
 * 規範：spec §5.3 Step 1
 *
 * needle 集合：
 *   - 角色名 + aliases
 *   - 章節標題（整串 + 2-4 字滑動窗）
 *   - 章節要點（2-4 字滑動窗）
 *   - 故事節拍（去括號後整串）
 *   - 參考章節尾段 1500 字的 2-4 字滑動窗，取字頻 top 50
 * 去重、過濾長度 < 2 / 全標點、英文 lowercase。
 *
 * relevanceScore：
 *   slug 命中 +10；title 命中 +8；aliases ∩ needles 數 ×6；contentMd 含 needle 個數（cap 5）×1
 */
import type { WikiPage } from '../types';

export interface ChapterContext {
  title?: string;
  points?: string;
  beat?: string;
  referenceChapterContent?: string;
  characterNames?: string[];
  characterAliases?: string[];
}

export interface RelevanceScored {
  page: WikiPage;
  score: number;
}

const PUNCT = /^[\s\p{P}\p{S}]+$/u;

/** 從一段文字生出 2-4 字滑動窗 */
function sliding2to4(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const t = text.replace(/\s+/g, ' ');
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= t.length; i++) {
      const piece = t.slice(i, i + n);
      if (!PUNCT.test(piece)) out.push(piece);
    }
  }
  return out;
}

/** 取字串尾段 N 字 */
function tail(s: string, n: number): string {
  if (!s || s.length <= n) return s || '';
  return s.slice(s.length - n);
}

/** 字頻 top K */
function topNByFrequency(arr: string[], k: number): string[] {
  const freq = new Map<string, number>();
  for (const x of arr) freq.set(x, (freq.get(x) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([s]) => s);
}

export function buildNeedles(ctx: ChapterContext): Set<string> {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    if (!s) return;
    const v = s.trim();
    if (v.length >= 2 && !PUNCT.test(v)) out.add(v.toLowerCase());
  };

  for (const n of ctx.characterNames ?? []) add(n);
  for (const a of ctx.characterAliases ?? []) add(a);

  if (ctx.title) {
    add(ctx.title);
    for (const p of sliding2to4(ctx.title)) add(p);
  }
  if (ctx.points) {
    for (const p of sliding2to4(ctx.points)) add(p);
  }
  if (ctx.beat) {
    add(ctx.beat.replace(/\(.+?\)/g, '').trim());
  }
  if (ctx.referenceChapterContent) {
    const pieces = sliding2to4(tail(ctx.referenceChapterContent, 1500));
    for (const p of topNByFrequency(pieces, 50)) add(p);
  }
  return out;
}

export function scorePages(pages: WikiPage[], needles: Set<string>): RelevanceScored[] {
  const out: RelevanceScored[] = [];
  for (const page of pages) {
    let score = 0;
    const slug = page.slug.toLowerCase();
    const title = page.title.toLowerCase();

    if (containsAny(slug, needles)) score += 10;
    if (containsAny(title, needles)) score += 8;

    const aliasHits = page.aliases.reduce(
      (n, a) => n + (needles.has(a.toLowerCase()) ? 1 : 0), 0);
    score += aliasHits * 6;

    // contentMd 含 needle 個數（最多 5 算）
    let contentHits = 0;
    const md = page.contentMd.toLowerCase();
    for (const n of needles) {
      if (md.includes(n)) {
        contentHits++;
        if (contentHits >= 5) break;
      }
    }
    score += contentHits;

    out.push({ page, score });
  }
  return out;
}

function containsAny(text: string, needles: Set<string>): boolean {
  for (const n of needles) {
    if (text.includes(n)) return true;
  }
  return false;
}
```

- [ ] **Step 2: 探針**

Create `temp/probe-wiki-relevance.ts`：
```ts
import { buildNeedles, scorePages } from '../src/lib/wiki-relevance';
import type { WikiPage } from '../src/types';

const ctx = {
  title: '李明的試煉',
  points: '李明在山頂遇到老者，學會火屬性魔法初步。',
  characterNames: ['李明'],
  characterAliases: ['小李'],
  referenceChapterContent: '山風吹過，李明握緊劍柄。'.repeat(50),
};

const pages: WikiPage[] = [
  { id:'1', bookId:'b', type:'entity', slug:'li-ming', title:'李明',
    aliases:['小李'], relatedSlugs:[], description:'', contentMd:'徒弟、劍術',
    createdAt:0, updatedAt:0 },
  { id:'2', bookId:'b', type:'concept', slug:'fire-magic', title:'火屬性魔法',
    aliases:['烈焰'], relatedSlugs:[], description:'', contentMd:'火元素的設定',
    createdAt:0, updatedAt:0 },
  { id:'3', bookId:'b', type:'entity', slug:'unrelated-merchant', title:'路邊商人',
    aliases:[], relatedSlugs:[], description:'', contentMd:'賣藥的',
    createdAt:0, updatedAt:0 },
];

const needles = buildNeedles(ctx);
console.log('needles size:', needles.size);
console.log('sample needles (first 10):', Array.from(needles).slice(0, 10));
console.log('scores:', scorePages(pages, needles).map(s => `${s.page.slug}: ${s.score}`));
```

Run:
```bash
npx tsx temp/probe-wiki-relevance.ts
```

Expected:
- `li-ming` 分數最高（slug 命中 + title 命中 + aliases 命中 = 10+8+6）
- `fire-magic` 也有分（title「火屬性魔法」命中 needles 中 points 切出的「火屬性」/「屬性魔」之類片段）
- `unrelated-merchant` 接近 0（contentMd「賣藥的」不該命中）

- [ ] **Step 3: Commit**

```bash
git add src/lib/wiki-relevance.ts
git commit -m "feat(wiki): cheap relevance filter (2-4 char sliding window)"
```

---

## Task 10: `wiki-loader.ts` + `wiki-section.ts` — query + 注入字串

**Files:**
- Create: `src/lib/wiki-loader.ts`
- Create: `src/lib/wiki-section.ts`

> 規格參考：spec §5.2 §5.3

- [ ] **Step 1: `wiki-loader.ts`**

Create `src/lib/wiki-loader.ts`：

```ts
/**
 * 為章節生成載入 Wiki 內容
 *
 * 規範：spec §5.2 §5.3
 *
 * 三段式：
 *   Step 1: cheap relevance filter（wiki-relevance.ts）
 *   Step 2: 結合優先級權重（type weight + recency）
 *   Step 3: 預算截斷（綠/黃/紅）
 */
import type { WikiPage } from '../types';
import { storage } from './storage';
import { buildNeedles, scorePages, type ChapterContext } from './wiki-relevance';
import { estimateCharsPerToken } from './tokens';

const TYPE_WEIGHT: Record<WikiPage['type'], number> = {
  entity: 5,
  concept: 4,
  synthesis: 3,
  summary: 2,
  compare: 1,
};

export type WikiLoadStatus = 'ok' | 'warn-truncated' | 'red-truncated';

export interface WikiLoaderInput {
  bookId: string;
  contextWindowTokens: number;
  budgetRatio?: number;     // 預設 0.25
  chapterContext?: ChapterContext;
}

export interface WikiLoadResult {
  pages: WikiPage[];        // 已排序、已截斷後實際載入的頁
  loadedPages: number;
  totalPages: number;
  truncatedPages: number;
  status: WikiLoadStatus;
  relevanceHits: number;
}

export async function loadWikiForGeneration(input: WikiLoaderInput): Promise<WikiLoadResult> {
  const ratio = input.budgetRatio ?? 0.25;
  const budgetChars = Math.floor(input.contextWindowTokens * ratio * estimateCharsPerToken());

  const all = await storage.wikiPages.list(input.bookId);
  if (all.length === 0) {
    return { pages: [], loadedPages: 0, totalPages: 0, truncatedPages: 0, status: 'ok', relevanceHits: 0 };
  }

  // Step 1: relevance
  const needles = input.chapterContext ? buildNeedles(input.chapterContext) : new Set<string>();
  const scored = scorePages(all, needles);
  const relevanceHits = scored.filter((s) => s.score > 0).length;

  // Step 2: priority
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const withPriority = scored.map((s) => {
    const days = Math.max(0, (now - s.page.updatedAt) / day);
    const recency = 1 / (days + 1);
    const typeWeight = TYPE_WEIGHT[s.page.type] ?? 0;
    const priority =
      (relevanceHits > 0 ? s.score * 100 : 0)    // 全無命中時，relevance 加成失效
      + typeWeight * 10
      + recency;
    return { page: s.page, priority };
  });
  withPriority.sort((a, b) => b.priority - a.priority);

  // Step 3: truncation
  const totalChars = all.reduce((sum, p) => sum + p.contentMd.length, 0);
  let status: WikiLoadStatus = 'ok';
  if (totalChars > budgetChars * 1.5) status = 'red-truncated';
  else if (totalChars > budgetChars) status = 'warn-truncated';

  let loaded: WikiPage[] = [];
  if (status === 'ok') {
    loaded = withPriority.map((p) => p.page);
  } else {
    let used = 0;
    for (const { page } of withPriority) {
      const cost = page.contentMd.length;
      if (used + cost > budgetChars) continue;
      loaded.push(page);
      used += cost;
    }
  }

  return {
    pages: loaded,
    loadedPages: loaded.length,
    totalPages: all.length,
    truncatedPages: all.length - loaded.length,
    status,
    relevanceHits,
  };
}
```

- [ ] **Step 2: `wiki-section.ts`**

Create `src/lib/wiki-section.ts`：

```ts
/**
 * 把 loadWikiForGeneration 的結果格式化為 prompt 的 `{{wikiSection}}` 字串
 *
 * 規範：spec §5.4 輸出格式
 */
import type { WikiLoadResult } from './wiki-loader';

const TYPE_LABEL: Record<string, string> = {
  entity: '角色',
  concept: '概念',
  summary: '章節摘要',
  compare: '對比',
  synthesis: '綜述',
};

export function formatWikiSection(result: WikiLoadResult): string {
  if (result.loadedPages === 0) return '';
  const head = '\n\n### 相關 Wiki 條目\n（以下為本書知識庫，撰寫時請保持一致）\n';
  const body = result.pages.map((p) => {
    const label = TYPE_LABEL[p.type] ?? p.type;
    const aliasNote = p.aliases.length > 0 ? `（別名：${p.aliases.join('、')}）` : '';
    return `\n#### ${label}：${p.title}${aliasNote}\n${p.contentMd}\n`;
  }).join('');
  const warn = result.status === 'ok'
    ? ''
    : `\n\n> ⚠️ 本書 Wiki 規模超出載入預算，已截斷 ${result.truncatedPages} 頁。`
      + (result.status === 'red-truncated'
        ? '請至偏好設定啟用 pick-pages 模式或換用更大 context 的模型。'
        : '若一致性出問題，請至偏好設定啟用 pick-pages 模式。');
  return head + body + warn;
}
```

- [ ] **Step 3: 探針**

Create `temp/probe-wiki-loader.ts`：
```ts
// 此探針要先在 dev 環境內預先建幾頁 wiki（可用 Task 4 探針）；這裡只展示呼叫
import { loadWikiForGeneration } from '../src/lib/wiki-loader';
import { formatWikiSection } from '../src/lib/wiki-section';
const r = await loadWikiForGeneration({
  bookId: '<your test bookId>',
  contextWindowTokens: 32000,
  chapterContext: { title: '李明的試煉', characterNames: ['李明'], characterAliases: ['小李'] },
});
console.log('status:', r.status, 'loaded:', r.loadedPages, '/', r.totalPages);
console.log(formatWikiSection(r).slice(0, 500));
```

驗證（在 DevTools console 跑，因為要連 Dexie / Tauri SQL）：
- 預先建 5 頁 wiki，跑 loader → status='ok'、pages 完整
- 將 contextWindowTokens 改 200（強制 budget 極小）→ status='warn-truncated' 或 'red-truncated'
- formatWikiSection 輸出含「### 相關 Wiki 條目」、命中的頁、warn 標註

- [ ] **Step 4: Commit**

```bash
git add src/lib/wiki-loader.ts src/lib/wiki-section.ts
git commit -m "feat(wiki): loader (cheap-filter + priority + truncation) + section formatter"
```

---

## Task 11: Prompt 模板 + settingsStore 接線 + Context Budget 注入

**Files:**
- Modify: `src/lib/prompt-defaults.ts`（4 個新 templates + chapterContentTemplate +`{{wikiSection}}`）
- Modify: `src/stores/settingsStore.ts`（`AIPromptPrefs` +4 個、新增 `WikiPrefs`）
- Modify: `src/lib/context-budget.ts`（`BudgetInputs` +`wikiSection`、`buildGenerationPrompt` 注入）

- [ ] **Step 1: 加 4 個 wiki prompt templates 到 prompt-defaults.ts**

Edit `src/lib/prompt-defaults.ts`。在 `DEFAULT_INLINE_ADJUST_TEMPLATE` 後新增：

```ts
// ─── #5. Wiki Ingest — Plan pass ─────────────────────────────────
export const DEFAULT_WIKI_INGEST_PLAN_TEMPLATE = `你是這本中文小說 Wiki 的維護者。請根據新加入的章節內容，提出 Wiki 更新計畫（**只輸出嚴格 JSON，不要 markdown fence、不要註解**）。

## 當前 Wiki 索引（{{indexCount}} 頁）
{{indexJson}}

## 已知角色（角色庫，**不要重複建立**）
{{knownCharactersList}}

## 本章內容（標題：{{chapterTitle}}）
{{chapterContent}}

## 輸出格式（嚴格 JSON）
{
  "operations": [
    {
      "action": "create",
      "type": "concept|entity|summary|compare|synthesis",
      "slug": "ascii-kebab-case",
      "title": "可中文",
      "aliases": ["別名1"],
      "description": "1 句 index 用描述（可選，缺則 fallback prose 開頭）",
      "reason": "為何要建這頁",
      "content_brief": "頁面內容 brief（給後續 Apply 用）"
    },
    {
      "action": "update",
      "type": "entity",
      "slug": "existing-slug",
      "reason": "為何要更新",
      "change_brief": "要怎麼改"
    }
  ],
  "log_entry": "ingest chapter=X pages_created=Y pages_updated=Z",
  "unrecorded_characters": [
    { "name": "王芳", "sourceExcerpt": "原文片段約 30-60 字" }
  ]
}

## 規則
1. **不要對已存在的 slug 做 create**（會自動降級為 update，但會浪費 token）。
2. **不要為「已知角色」清單中已有的角色，新建 entity 頁**——除非本章首次給出值得單獨成頁的細節（用 update 補充更好）。
3. **不要把章節摘要做為 entity**；章節摘要請用 type=summary，slug 用「ch-章節 id 或 ch-序號」。
4. unrecorded_characters 是本章出現、但**不在已知角色清單也不在 wiki 中**的人物（不論 entity 是否要建頁）。
5. 若本章沒任何值得 ingest 的，operations 可以是空陣列；但 unrecorded_characters 仍可填。
`;

// ─── #6. Wiki Ingest — Apply create ─────────────────────────────
export const DEFAULT_WIKI_INGEST_CREATE_TEMPLATE = `根據以下資訊撰寫一頁完整的 Wiki markdown 頁面。

## 頁面類型 / slug
{{type}} / {{slug}}

## 顯示標題
{{title}}

## 別名
{{aliasesList}}

## 撰寫意圖（reason）
{{reason}}

## 內容 brief
{{contentBrief}}

## 本章節相關片段（資料來源）
{{chapterExcerpt}}

## 輸出格式（嚴格遵守）

第一行 H1 為顯示標題；接著 \`> \` blockquote 含 Type/Aliases/Related（無 related 可省略 Related 整行）；空一行後正文 ## 段落；最後 \`## 出處\` 段標註來源章節。範例：

\`\`\`markdown
# <顯示標題>

> **Type:** {{type}}
> **Aliases:** {{aliasesList}}
> **Related:** [其他頁](../entity/other.md)

## 概述

…正文…

## 出處

- 第 X 章「章節標題」
\`\`\`

只輸出 markdown 本身，不要任何前言或結尾說明。
`;

// ─── #7. Wiki Ingest — Apply update ─────────────────────────────
export const DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE = `根據新章節資訊，把現有 Wiki 頁面更新到「合併新資訊後」的完整版本。

## 頁面類型 / slug
{{type}} / {{slug}}

## 現有頁面全文
\`\`\`markdown
{{existingMarkdown}}
\`\`\`

## 本次更新理由
{{reason}}

## 改動 brief
{{changeBrief}}

## 本章節相關片段（資料來源）
{{chapterExcerpt}}

## 輸出要求
- 輸出**完整新版頁面 markdown**（不是 diff）
- 保留既有 H1 標題與整體結構，僅在必要處新增或修改段落
- 若 aliases / related 有變動，更新 blockquote 的對應行
- 保留 \`## 出處\` 區段並追加本章來源
- 只輸出 markdown 本身，不要任何前言或結尾說明
`;

// ─── #8. Wiki Query — Answer（Phase 2.5 預留；UI 入口此版未開）─────
export const DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE = `你是這本小說的 Wiki 助理。請根據以下 Wiki 頁面回答使用者的問題；引用時標註頁面 type/slug。若 Wiki 沒有相關內容，誠實說「Wiki 中無此資訊」。

## 使用者問題
{{question}}

## 相關 Wiki 頁面
{{pagesMarkdown}}
`;
```

修改既有 `DEFAULT_CHAPTER_CONTENT_TEMPLATE`，把 `{{charactersSection}}` 後加上 `{{wikiSection}}`：

```ts
export const DEFAULT_CHAPTER_CONTENT_TEMPLATE = `## 背景資訊

### 世界觀
{{worldSetting}}{{mainPlotSection}}{{charactersSection}}{{wikiSection}}

## 本章要求
- 章節標題：{{chapterTitle}}
- 故事節拍：{{beat}}
- 章節要點：{{points}}
- 目標字數：{{targetWords}}{{referenceSection}}{{olderSummarySection}}{{adjustInstructionSection}}

---
請開始撰寫本章正文。要求：
1. 嚴格遵守上述「本章要求」{{adjustInstructionRule}}
2. 保持文風一致，與前文順暢銜接，不要複述前文
3. 直接從前文結尾處繼續創作
4. 直接輸出小說正文，不要加任何說明、標題或註解`;
```

在 `PROMPT_TEMPLATE_SAMPLES` 的 `chapterContentTemplate` 加 `wikiSection: ''`（範例用空）。

在 `PROMPT_TEMPLATE_VARS` 的 `chapterContentTemplate` 加：
```ts
    { var: 'wikiSection', desc: 'Wiki 相關條目區段（Phase 2，若無 wiki 為空字串）' },
```

並在 `PROMPT_TEMPLATE_VARS` 末端新增 4 個 wiki entry：
```ts
  wikiIngestPlanTemplate: [
    { var: 'indexCount', desc: '當前 wiki 頁數' },
    { var: 'indexJson', desc: 'JSON 陣列：{type, slug, title, description, aliases}' },
    { var: 'knownCharactersList', desc: '角色庫的 name / aliases 清單' },
    { var: 'chapterTitle', desc: '本章標題' },
    { var: 'chapterContent', desc: '本章正文' },
  ],
  wikiIngestCreateTemplate: [
    { var: 'type', desc: '頁面類型' },
    { var: 'slug', desc: 'ASCII kebab-case' },
    { var: 'title', desc: '顯示標題' },
    { var: 'aliasesList', desc: '逗號分隔別名（可空）' },
    { var: 'reason', desc: '建立原因' },
    { var: 'contentBrief', desc: '內容 brief' },
    { var: 'chapterExcerpt', desc: '相關章節片段' },
  ],
  wikiIngestUpdateTemplate: [
    { var: 'type', desc: '頁面類型' },
    { var: 'slug', desc: 'ASCII kebab-case' },
    { var: 'existingMarkdown', desc: '既有頁面全文' },
    { var: 'reason', desc: '更新原因' },
    { var: 'changeBrief', desc: '改動 brief' },
    { var: 'chapterExcerpt', desc: '相關章節片段' },
  ],
  wikiQueryAnswerTemplate: [
    { var: 'question', desc: '使用者問題（Phase 2.5）' },
    { var: 'pagesMarkdown', desc: '相關 wiki 頁全文（Phase 2.5）' },
  ],
```

- [ ] **Step 2: settingsStore 加 4 個 templates + WikiPrefs**

Edit `src/stores/settingsStore.ts`。檔頂 import 加：
```ts
import {
  DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  DEFAULT_CHAPTER_CONTINUATION_RULES,
  DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  DEFAULT_CHAPTER_POINTS_TEMPLATE,
  DEFAULT_INLINE_ADJUST_TEMPLATE,
  DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
} from '../lib/prompt-defaults';
```

擴充 `AIPromptPrefs`：
```ts
export interface AIPromptPrefs {
  chapterDraftsTemplate: string;
  chapterContinuationRules: string;
  chapterContentTemplate: string;
  chapterPointsTemplate: string;
  inlineAdjustTemplate: string;
  wikiIngestPlanTemplate: string;
  wikiIngestCreateTemplate: string;
  wikiIngestUpdateTemplate: string;
  wikiQueryAnswerTemplate: string;
}
```

擴充 `DEFAULT_AI_PROMPTS`：
```ts
const DEFAULT_AI_PROMPTS: AIPromptPrefs = {
  chapterDraftsTemplate: DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  chapterContinuationRules: DEFAULT_CHAPTER_CONTINUATION_RULES,
  chapterContentTemplate: DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  chapterPointsTemplate: DEFAULT_CHAPTER_POINTS_TEMPLATE,
  inlineAdjustTemplate: DEFAULT_INLINE_ADJUST_TEMPLATE,
  wikiIngestPlanTemplate: DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  wikiIngestCreateTemplate: DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  wikiIngestUpdateTemplate: DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  wikiQueryAnswerTemplate: DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
};
```

新增 `WikiPrefs` interface 與 state：

```ts
export interface WikiPrefs {
  /** Wiki 區塊佔 context window 的比例（spec §5.3） */
  budgetRatio: number;          // 預設 0.25
  /** 連續超預算警告閾值，到達後 UI 強烈建議 pick-pages（Phase 2.5） */
  overflowWarnThreshold: number; // 預設 3
  /** Phase 2.5 後可用；目前永遠 false */
  enablePickPages: boolean;
}

interface SettingsState {
  llmConfig: LLMConfig;
  inlineEdit: InlineEditPrefs;
  aiPrompts: AIPromptPrefs;
  wikiPrefs: WikiPrefs;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setInlineEdit: (prefs: Partial<InlineEditPrefs>) => void;
  setAiPrompts: (prefs: Partial<AIPromptPrefs>) => void;
  setWikiPrefs: (prefs: Partial<WikiPrefs>) => void;
}

const DEFAULT_WIKI_PREFS: WikiPrefs = {
  budgetRatio: 0.25,
  overflowWarnThreshold: 3,
  enablePickPages: false,
};
```

在 store factory 內加 `wikiPrefs: { ...DEFAULT_WIKI_PREFS }` 與 setter，並在 persist `merge` 內補：
```ts
          wikiPrefs: { ...DEFAULT_WIKI_PREFS, ...(p.wikiPrefs ?? {}) },
          aiPrompts: { ...DEFAULT_AI_PROMPTS, ...(p.aiPrompts ?? {}) },
```

- [ ] **Step 3: Context Budget 注入 wikiSection**

Edit `src/lib/context-budget.ts`：

加入 `wikiSection` 欄位：
```ts
export interface BudgetInputs {
  worldSetting: string;
  mainPlot: string;
  characters: string;
  beat: string;
  chapterPoints: string;
  referenceChapterTitle: string;
  referenceChapterContent: string;
  olderChapterSummary: string;
  wikiSection: string;       // 預先組好；無 wiki 給空字串
}
```

`BudgetAllocation` 也含 wikiSection（透過 `...inputs` 已包含；不需多動）。

在 `buildGenerationPrompt` 內，把 `renderTemplate` 呼叫的物件加上：
```ts
    wikiSection: budget.wikiSection || '',
```

- [ ] **Step 4: TS 編譯**

```bash
npx tsc -b --noEmit
```

Expected: 0 errors。可能會有 caller 呼叫 `allocateBudget` 沒傳 `wikiSection` 的報錯 — 用 grep 找出來：
```bash
grep -rn "allocateBudget\|BudgetInputs" src/ --include='*.ts' --include='*.tsx' | head
```
每個 caller 都加 `wikiSection: ''`（Task 11 暫時，Task 12 之後會由 wiki-loader 填）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt-defaults.ts src/lib/context-budget.ts src/stores/settingsStore.ts
git commit -m "feat(prompts): wiki ingest/query templates + chapter template wikiSection slot"
```

---

## Task 12: `wiki-ingest.ts` — Pipeline（Plan + Apply + 補償寫入 + retry-remaining）

**Files:**
- Create: `src/lib/wiki-ingest.ts`

> 規格參考：spec §4.1 §4.4 §4.5

- [ ] **Step 1: 寫實作**

Create `src/lib/wiki-ingest.ts`：

```ts
/**
 * Wiki Ingest pipeline
 *
 * 規範：spec §4.1 §4.4 §4.5
 *
 * 流程：
 *   1. Pre-flight：撈本章 + index + characters + 計算 chapterContentHash
 *   2. Plan (1 LLM call) → parseAndValidatePlan
 *   3. Apply (每 op 1 LLM call，串行) → wiki-parser
 *   4. 寫 DB（補償模式：log 先寫、page 後寫；失敗用 op_status 標記）
 *   5. 更新 chapter wikiSyncStatus / wikiSyncedAt / wikiSyncedHash
 *
 * 沒有 transaction（tauri-plugin-sql 限制）：用 op_status='failed' 記實際結果。
 */
import { v4 as uuid } from 'uuid';
import type {
  Chapter, Character, WikiPage, WikiPageType,
  WikiLogEntry, WikiPageSnapshot, WikiSyncStatus,
} from '../types';
import { storage } from './storage';
import { useSettingsStore } from '../stores/settingsStore';
import { complete } from './llm';
import { renderTemplate } from './prompt-template';
import { parseAndValidatePlan, type Plan, type PlanOp } from './wiki-plan';
import { parseWikiPageMarkdown } from './wiki-parser';

export interface IngestResult {
  batchId: string;
  okCount: number;
  failedCount: number;
  plan: Plan;
  /** 對應 wiki_log 寫入順序 */
  logEntries: WikiLogEntry[];
  status: WikiSyncStatus;     // 'synced' | 'partial'
}

export async function ingestChapter(chapter: Chapter): Promise<IngestResult> {
  const batchId = uuid();
  const bookId = chapter.projectId;

  // [1] Pre-flight
  const [allPages, allChars] = await Promise.all([
    storage.wikiPages.list(bookId),
    storage.characters.listByProject(bookId),
  ]);
  const chapterContentHash = await sha1Hex(chapter.content);

  const indexJson = JSON.stringify(
    allPages.map((p) => ({
      type: p.type, slug: p.slug, title: p.title,
      description: p.description, aliases: p.aliases,
    })),
    null, 2,
  );
  const knownCharactersList = allChars
    .map((c) => c.name + (c.relations ? '' : '')).join('、') || '(無)';

  // [2] Plan
  const aiPrompts = useSettingsStore.getState().aiPrompts;
  const planPrompt = renderTemplate(aiPrompts.wikiIngestPlanTemplate, {
    indexCount: String(allPages.length),
    indexJson,
    knownCharactersList,
    chapterTitle: chapter.title || '(未命名)',
    chapterContent: chapter.content,
  });

  let planRaw = '';
  try {
    planRaw = await complete(planPrompt, { maxTokens: 2048 });
  } catch (e) {
    throw new Error(`Plan LLM 呼叫失敗：${(e as Error).message}`);
  }

  const existing = new Map<string, WikiPage>();
  for (const p of allPages) existing.set(`${p.type}/${p.slug}`, p);
  let plan: Plan;
  try {
    plan = parseAndValidatePlan(planRaw, { existing });
  } catch (e) {
    // 重試 1 次（spec §4.4 LLM 回非 JSON）
    planRaw = await complete(planPrompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 });
    plan = parseAndValidatePlan(planRaw, { existing });
  }

  // [3]+[4] Apply each op
  const logEntries: WikiLogEntry[] = [];
  let okCount = 0;
  let failedCount = 0;

  for (const op of plan.operations) {
    const opResult = await applyOneOp(bookId, chapter, op, batchId, aiPrompts, existing);
    logEntries.push(opResult.logEntry);
    if (opResult.logEntry.opStatus === 'ok') okCount++;
    else failedCount++;
  }

  // [5] 更新 chapter
  const status: WikiSyncStatus = failedCount > 0 ? 'partial' : 'synced';
  await storage.chapters.update(chapter.id, {
    wikiSyncedAt: Date.now(),
    wikiSyncedHash: chapterContentHash,
    wikiSyncStatus: status,
    updatedAt: chapter.updatedAt,  // 不動 updatedAt
  });

  return { batchId, okCount, failedCount, plan, logEntries, status };
}

/** 重試 batch 中 op_status='failed' 的條目 */
export async function retryRemaining(chapter: Chapter, batchId: string): Promise<IngestResult> {
  const bookId = chapter.projectId;
  const allLogs = await storage.wikiLog.listByBatch(bookId, batchId);
  const failed = allLogs.filter((l) => l.opStatus === 'failed');

  const aiPrompts = useSettingsStore.getState().aiPrompts;
  const allPages = await storage.wikiPages.list(bookId);
  const existing = new Map<string, WikiPage>();
  for (const p of allPages) existing.set(`${p.type}/${p.slug}`, p);

  const logEntries: WikiLogEntry[] = [];
  let ok = 0, fail = 0;

  for (const oldLog of failed) {
    // 從原 log 還原出 op brief
    const after = oldLog.pageSnapshotAfter;
    const op: PlanOp = oldLog.kind === 'create'
      ? {
          action: 'create',
          type: oldLog.pageType,
          slug: oldLog.pageSlug,
          title: after?.title ?? oldLog.pageSlug,
          aliases: after?.aliases ?? [],
          description: after?.description,
          reason: '重試 failed op',
          content_brief: after?.contentMd ?? '',
        }
      : {
          action: 'update',
          type: oldLog.pageType,
          slug: oldLog.pageSlug,
          reason: '重試 failed op',
          change_brief: oldLog.errorMessage ?? '重試',
        };

    const r = await applyOneOp(bookId, chapter, op, batchId, aiPrompts, existing);
    logEntries.push(r.logEntry);
    if (r.logEntry.opStatus === 'ok') {
      // 把舊 failed log 標記為 undone（避免下次再 retry）
      await storage.wikiLog.updateStatus(oldLog.id, 'undone');
      ok++;
    } else {
      fail++;
    }
  }

  // 重新計算章節 status
  const remainingFailed = (await storage.wikiLog.listByBatch(bookId, batchId))
    .filter((l) => l.opStatus === 'failed').length;
  const status: WikiSyncStatus = remainingFailed > 0 ? 'partial' : 'synced';
  await storage.chapters.update(chapter.id, { wikiSyncStatus: status });

  return {
    batchId, okCount: ok, failedCount: fail,
    plan: { operations: [], log_entry: 'retry-remaining', unrecorded_characters: [], warnings: [] },
    logEntries, status,
  };
}

interface ApplyResult {
  logEntry: WikiLogEntry;
}

async function applyOneOp(
  bookId: string, chapter: Chapter, op: PlanOp, batchId: string,
  aiPrompts: ReturnType<typeof useSettingsStore.getState>['aiPrompts'],
  existing: Map<string, WikiPage>,
): Promise<ApplyResult> {
  const now = Date.now();
  const logId = uuid();
  const key = `${op.type}/${op.slug}`;
  const beforePage = existing.get(key) ?? null;
  const source = `ingest:${chapter.id}`;
  const summary = op.action === 'create'
    ? `+${op.type}/${op.slug}`
    : `~${op.type}/${op.slug}`;

  // 構造 chapter excerpt（前 4k 字，避免 over-long context）
  const chapterExcerpt = chapter.content.slice(0, 4000);

  let afterContent: string;
  try {
    if (op.action === 'create') {
      const prompt = renderTemplate(aiPrompts.wikiIngestCreateTemplate, {
        type: op.type, slug: op.slug, title: op.title,
        aliasesList: op.aliases.join('、') || '(無)',
        reason: op.reason, contentBrief: op.content_brief,
        chapterExcerpt,
      });
      afterContent = await complete(prompt, { maxTokens: 2048 });
    } else {
      if (!beforePage) {
        throw new Error('update 但既有頁不存在（不該發生，校驗會降級）');
      }
      const prompt = renderTemplate(aiPrompts.wikiIngestUpdateTemplate, {
        type: op.type, slug: op.slug,
        existingMarkdown: beforePage.contentMd,
        reason: op.reason, changeBrief: (op as { change_brief: string }).change_brief,
        chapterExcerpt,
      });
      afterContent = await complete(prompt, { maxTokens: 2048 });
    }
  } catch (e) {
    // Apply LLM 失敗 — 寫 failed log，page_snapshot_after = null
    const failedLog: WikiLogEntry = {
      id: logId, bookId, batchId, appliedAt: now,
      kind: op.action === 'create' ? 'create' : 'update',
      opStatus: 'failed',
      pageId: beforePage?.id ?? null,
      pageType: op.type, pageSlug: op.slug,
      pageSnapshotBefore: beforePage,
      pageSnapshotAfter: null,
      source, summary,
      errorMessage: (e as Error).message,
    };
    await safeAddLog(failedLog);
    return { logEntry: failedLog };
  }

  // 解析 Apply 輸出
  const parsed = parseWikiPageMarkdown(afterContent, op.action === 'create' ? op.title : beforePage!.title);
  const description = op.action === 'create' && op.description
    ? op.description
    : parsed.fallbackDescription;

  const afterPage: WikiPageSnapshot = beforePage
    ? {
        ...beforePage,
        title: parsed.title || beforePage.title,
        aliases: parsed.aliases.length ? parsed.aliases : beforePage.aliases,
        relatedSlugs: parsed.relatedSlugs,
        description,
        contentMd: parsed.contentMd,
        updatedAt: now,
      }
    : {
        id: uuid(), bookId, type: op.type, slug: op.slug,
        title: parsed.title || op.title,
        aliases: parsed.aliases.length ? parsed.aliases : op.aliases,
        relatedSlugs: parsed.relatedSlugs,
        description,
        contentMd: parsed.contentMd,
        createdAt: now, updatedAt: now,
      };

  // [4] 補償寫入：先 log 再 page
  const okLog: WikiLogEntry = {
    id: logId, bookId, batchId, appliedAt: now,
    kind: op.action === 'create' ? 'create' : 'update',
    opStatus: 'ok',
    pageId: afterPage.id,
    pageType: op.type, pageSlug: op.slug,
    pageSnapshotBefore: beforePage,
    pageSnapshotAfter: afterPage,
    source, summary,
  };
  try {
    await storage.wikiLog.add(okLog);
  } catch (e) {
    // log 寫不進去 — 跳過該 op（記入記憶體錯誤，不寫 page）
    return {
      logEntry: { ...okLog, opStatus: 'failed', pageSnapshotAfter: null,
        errorMessage: `wiki_log insert 失敗：${(e as Error).message}` },
    };
  }
  try {
    if (op.action === 'create') {
      await storage.wikiPages.add(afterPage);
    } else {
      await storage.wikiPages.update(afterPage);
    }
    // 同步更新記憶體 index（給後續同 batch 的 ops 看見）
    existing.set(key, afterPage);
    return { logEntry: okLog };
  } catch (e) {
    // page 寫入失敗 — 把 log 改為 failed（after snapshot 保留供重試）
    await storage.wikiLog.updateStatus(okLog.id, 'failed', (e as Error).message);
    return { logEntry: { ...okLog, opStatus: 'failed', errorMessage: (e as Error).message } };
  }
}

async function safeAddLog(entry: WikiLogEntry): Promise<void> {
  try { await storage.wikiLog.add(entry); } catch { /* swallow — UI 仍會顯示 failed count */ }
}

async function sha1Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 給 UI 用：判斷章節是否該標 stale（spec §3.2）
export async function recomputeChapterSyncStatus(chapter: Chapter): Promise<WikiSyncStatus> {
  if (chapter.wikiSyncedHash === null) return 'unsynced';
  const currentHash = await sha1Hex(chapter.content);
  const changed = currentHash !== chapter.wikiSyncedHash;
  if (!changed) return chapter.wikiSyncStatus;
  // changed
  if (chapter.wikiSyncStatus === 'synced') return 'stale';
  if (chapter.wikiSyncStatus === 'partial') return 'partial_stale';
  return chapter.wikiSyncStatus;  // unsynced/stale/partial_stale 不變
}

/** 給 Toolbar / 章節編輯區用：取得 chapter 同 batch 的 failed log count（partial 數字） */
export async function getFailedCountForChapter(chapter: Chapter): Promise<number> {
  if (chapter.wikiSyncStatus !== 'partial' && chapter.wikiSyncStatus !== 'partial_stale') return 0;
  // 最近一個 ingest:<chapterId> 的 batchId
  const logs = await storage.wikiLog.list(chapter.projectId, 200);
  const myIngests = logs.filter((l) => l.source === `ingest:${chapter.id}`);
  if (myIngests.length === 0) return 0;
  const lastBatch = myIngests[0].batchId;
  return myIngests.filter((l) => l.batchId === lastBatch && l.opStatus === 'failed').length;
}
```

- [ ] **Step 2: 手動 smoke（瀏覽器 + 桌面各跑）**

1. `npm run dev`（或 `npm run tauri dev`）
2. 在 DevTools console 跑（在 main.tsx 暫加 `window.ingestChapter = ingestChapter;` 或一次性 `import('./src/lib/wiki-ingest').then(...)`）：

```js
const proj = (await window.__store.projects.list())[0]; // 隨便挑一本
const chs = await window.__store.chapters.listByProject(proj.id);
const ch = chs.find(c => c.content.length > 500);  // 找有正文的章
const result = await window.__ingest.ingestChapter(ch);
console.log(result);
```
（為了方便測，可在 dev 期暫時把 `storage` 與 `ingestChapter` 掛到 `window`，commit 前移除。）

Expected：
- `result.okCount + result.failedCount === plan.operations.length`
- 跑完後該章 `wikiSyncStatus` 變 `synced`（若全 ok）或 `partial`（有失敗）
- `wiki_pages` 表多了 ops 對應的條目
- `wiki_log` 表多了相同數量條目（含 before/after snapshot）

- [ ] **Step 3: Commit**

```bash
git add src/lib/wiki-ingest.ts
git commit -m "feat(wiki): ingest pipeline with compensation pattern + retry-remaining"
```

---

## Task 13: `wiki-undo.ts` + Chapter status hook 在 projectStore 內

**Files:**
- Create: `src/lib/wiki-undo.ts`
- Modify: `src/stores/projectStore.ts`（updateChapter 內 hook）

> 規格參考：spec §4.6（undo 只處理 op_status='ok'；failed entries 留為歷史）

- [ ] **Step 1: 寫 undo 實作**

Create `src/lib/wiki-undo.ts`：

```ts
/**
 * 還原 wiki ingest batch
 *
 * 規範：spec §4.6
 *
 * - 只處理 op_status='ok' 的 entries（failed 留為歷史）
 * - kind='create' → DELETE wiki_pages
 * - kind='update' → 用 pageSnapshotBefore 全欄位覆寫
 * - kind='delete' → 用 pageSnapshotBefore INSERT 回
 * - 原 entries op_status 改為 'undone'
 * - 新增一條 kind='undo' 記錄
 * - chapter status 回 'unsynced'
 */
import { v4 as uuid } from 'uuid';
import type { Chapter, WikiLogEntry, WikiPageType } from '../types';
import { storage } from './storage';

export async function undoBatch(chapter: Chapter, batchId: string): Promise<void> {
  const bookId = chapter.projectId;
  const all = await storage.wikiLog.listByBatch(bookId, batchId);
  const okEntries = all.filter((e) => e.opStatus === 'ok')
    .sort((a, b) => b.appliedAt - a.appliedAt);   // DESC

  for (const e of okEntries) {
    if (e.kind === 'create' && e.pageId) {
      await storage.wikiPages.delete(e.pageId);
    } else if (e.kind === 'update' && e.pageSnapshotBefore) {
      await storage.wikiPages.update(e.pageSnapshotBefore);
    } else if (e.kind === 'delete' && e.pageSnapshotBefore) {
      await storage.wikiPages.add(e.pageSnapshotBefore);
    }
    await storage.wikiLog.updateStatus(e.id, 'undone');
  }

  // 寫 1 條 undo summary log
  const summary: WikiLogEntry = {
    id: uuid(), bookId, batchId, appliedAt: Date.now(),
    kind: 'undo', opStatus: 'ok',
    pageId: null,
    pageType: 'concept' as WikiPageType,  // 哑欄位（CHECK 約束需要值）
    pageSlug: 'batch-undo',
    pageSnapshotBefore: null, pageSnapshotAfter: null,
    source: `undo:${batchId}`,
    summary: `還原 ${okEntries.length} 個操作`,
  };
  await storage.wikiLog.add(summary);

  await storage.chapters.update(chapter.id, {
    wikiSyncedAt: null,
    wikiSyncedHash: null,
    wikiSyncStatus: 'unsynced',
  });
}

/** 找出某 chapter 最近一個 ingest batchId（無則 null） */
export async function findLatestIngestBatch(chapter: Chapter): Promise<string | null> {
  const logs = await storage.wikiLog.list(chapter.projectId, 200);
  const mine = logs.filter((l) => l.source === `ingest:${chapter.id}`);
  return mine[0]?.batchId ?? null;
}
```

- [ ] **Step 2: projectStore.updateChapter 內 hook**

Edit `src/stores/projectStore.ts`。在檔頂 import 加：
```ts
import { recomputeChapterSyncStatus } from '../lib/wiki-ingest';
```

修改 `updateChapter`：

```ts
  updateChapter: async (id, data) => {
    const now = Date.now();
    // 先 patch 再算 hash（若 data 包含 content）
    const before = get().chapters.find((c) => c.id === id);
    let patch: Partial<Chapter> = { ...data, updatedAt: now };

    if (before && data.content !== undefined && data.content !== before.content) {
      const candidate: Chapter = { ...before, ...data, updatedAt: now };
      const newStatus = await recomputeChapterSyncStatus(candidate);
      if (newStatus !== before.wikiSyncStatus) patch = { ...patch, wikiSyncStatus: newStatus };
    }

    await storage.chapters.update(id, patch);
    const chapters = get().chapters.map((c) => c.id === id ? { ...c, ...patch } : c);
    set({ chapters });
  },
```

- [ ] **Step 3: 手動 smoke**

1. 對 Task 12 ingest 過的章，跑 undoBatch：
```js
const ch = (await window.__store.chapters.list()).find(c => c.wikiSyncStatus === 'synced');
const batchId = await window.__undo.findLatestIngestBatch(ch);
await window.__undo.undoBatch(ch, batchId);
```
2. Expected：對應 wiki_pages 全部消失（或回到 before snapshot）、章節 wikiSyncStatus 變 'unsynced'

3. 對 partial 章節改 content 一字 → 用 `recomputeChapterSyncStatus` 計算，應該變 'partial_stale'

- [ ] **Step 4: Commit**

```bash
git add src/lib/wiki-undo.ts src/stores/projectStore.ts
git commit -m "feat(wiki): undo (batchId) + chapter status hook on content change"
```

---

## Task 14: WikiStore + Wiki 分頁 UI（左側 + 編輯器）

**Files:**
- Create: `src/stores/wikiStore.ts`
- Create: `src/components/wiki/WikiPanel.tsx`
- Create: `src/components/wiki/WikiPageEditor.tsx`
- Modify: `src/App.tsx`（解鎖 wiki tab、掛 WikiPanel）

- [ ] **Step 1: Zustand store**

Create `src/stores/wikiStore.ts`：

```ts
import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { storage } from '../lib/storage';
import type { WikiPage, WikiPageType, WikiLogEntry } from '../types';

interface WikiState {
  pages: WikiPage[];
  log: WikiLogEntry[];
  selectedPageId: string | null;
  totalLength: number;

  loadForBook: (bookId: string) => Promise<void>;
  selectPage: (id: string | null) => void;
  createPageBlank: (bookId: string, type: WikiPageType, slug: string, title: string) => Promise<string>;
  savePage: (page: WikiPage) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
}

export const useWikiStore = create<WikiState>((set, get) => ({
  pages: [],
  log: [],
  selectedPageId: null,
  totalLength: 0,

  loadForBook: async (bookId) => {
    const [pages, log, totalLength] = await Promise.all([
      storage.wikiPages.list(bookId),
      storage.wikiLog.list(bookId, 50),
      storage.wikiPages.totalLength(bookId),
    ]);
    set({ pages, log, totalLength });
  },

  selectPage: (id) => set({ selectedPageId: id }),

  createPageBlank: async (bookId, type, slug, title) => {
    const now = Date.now();
    const id = uuid();
    const page: WikiPage = {
      id, bookId, type, slug, title,
      aliases: [], relatedSlugs: [],
      description: '',
      contentMd: `# ${title}\n\n> **Type:** ${type}\n\n## 概述\n\n`,
      createdAt: now, updatedAt: now,
    };
    await storage.wikiPages.add(page);
    await get().loadForBook(bookId);
    return id;
  },

  savePage: async (page) => {
    await storage.wikiPages.update({ ...page, updatedAt: Date.now() });
    await get().loadForBook(page.bookId);
  },

  deletePage: async (id) => {
    const page = get().pages.find((p) => p.id === id);
    if (!page) return;
    await storage.wikiPages.delete(id);
    await get().loadForBook(page.bookId);
  },
}));
```

- [ ] **Step 2: 單頁編輯器**

Create `src/components/wiki/WikiPageEditor.tsx`：

```tsx
import { useState, useEffect } from 'react';
import type { WikiPage } from '../../types';
import { useWikiStore } from '../../stores/wikiStore';
import { EditPreviewTabs } from '../common/EditPreviewTabs';
import { Textarea } from '../common/Textarea';
import { Button } from '../common/Button';

export function WikiPageEditor({ page }: { page: WikiPage }) {
  const { savePage, deletePage } = useWikiStore();
  const [draft, setDraft] = useState(page.contentMd);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(page.contentMd);
    setDirty(false);
  }, [page.id, page.contentMd]);

  const onSave = async () => {
    await savePage({ ...page, contentMd: draft });
    setDirty(false);
  };

  const onDelete = async () => {
    if (!confirm(`刪除 wiki 頁「${page.title}」？此動作不可還原（不會進 undo log）。`)) return;
    await deletePage(page.id);
  };

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        {page.type} / {page.slug}
        {page.aliases.length > 0 && ` · 別名：${page.aliases.join('、')}`}
      </div>
      <EditPreviewTabs
        markdown={draft}
        onMarkdownChange={(v) => { setDraft(v); setDirty(true); }}
        editor={
          <Textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
            style={{ flex: 1, minHeight: 400, fontFamily: 'var(--font-mono)' }}
          />
        }
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onDelete} variant="ghost">🗑 刪除</Button>
        <Button onClick={onSave} disabled={!dirty}>💾 儲存</Button>
      </div>
    </div>
  );
}
```

> 若 `EditPreviewTabs` 元件 prop 簽名不同，照既有 `ChapterEditor.tsx` 的用法（grep `EditPreviewTabs` 在 ChapterEditor 內如何呼叫）做調整；本檔不是這個 task 的關鍵。

- [ ] **Step 3: WikiPanel 主畫面**

Create `src/components/wiki/WikiPanel.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useWikiStore } from '../../stores/wikiStore';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { WikiPageEditor } from './WikiPageEditor';
import type { WikiPageType } from '../../types';

const TYPE_LABELS: Record<WikiPageType, string> = {
  concept: '概念', entity: '實體', summary: '摘要',
  compare: '對比', synthesis: '綜述',
};

export function WikiPanel() {
  const { project } = useProjectStore();
  const { pages, log, selectedPageId, totalLength, loadForBook, selectPage, createPageBlank } = useWikiStore();
  const [filter, setFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (project) loadForBook(project.id);
  }, [project, loadForBook]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return pages;
    const q = filter.toLowerCase();
    return pages.filter((p) =>
      p.slug.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.aliases.some((a) => a.toLowerCase().includes(q)));
  }, [pages, filter]);

  const grouped = useMemo(() => {
    const out: Record<WikiPageType, typeof pages> = {
      entity: [], concept: [], summary: [], compare: [], synthesis: [],
    };
    for (const p of filtered) out[p.type].push(p);
    return out;
  }, [filtered]);

  const selected = pages.find((p) => p.id === selectedPageId) ?? null;

  if (!project) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>📚 Wiki</strong>
          <Button size="sm" onClick={() => setShowNew(true)}>+ 新增頁面</Button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {pages.length} 頁 · 約 {Math.round(totalLength / 1000)}k 字
        </div>
        <Input
          placeholder="搜尋 slug/標題/別名…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginTop: 8, width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 左欄：分組列表 */}
        <div style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {(Object.keys(grouped) as WikiPageType[]).map((type) => {
            const arr = grouped[type];
            if (arr.length === 0) return null;
            return (
              <div key={type}>
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--surface-2)' }}>
                  {TYPE_LABELS[type]} ({arr.length})
                </div>
                {arr.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => selectPage(p.id)}
                    style={{
                      padding: '6px 12px', cursor: 'pointer', fontSize: 13,
                      background: selectedPageId === p.id ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    {p.title}
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.slug}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* 右欄：選中頁的編輯區 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {selected ? (
            <WikiPageEditor page={selected} />
          ) : (
            <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>選擇左側頁面以檢視 / 編輯</div>
          )}
        </div>
      </div>

      {/* 底部：操作記錄 */}
      <div style={{
        borderTop: '1px solid var(--border)', maxHeight: 180, overflowY: 'auto',
        padding: 8, fontSize: 11, fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>操作記錄（最近 50 條）</div>
        {log.length === 0 ? <div style={{ color: 'var(--text-tertiary)' }}>—</div> : log.map((e) => (
          <div key={e.id} style={{ opacity: e.opStatus === 'undone' ? 0.4 : 1, color: e.opStatus === 'failed' ? 'var(--accent-danger)' : 'inherit' }}>
            {new Date(e.appliedAt).toLocaleString()} {e.kind} {e.pageType}/{e.pageSlug}
            {e.opStatus !== 'ok' ? ` [${e.opStatus}]` : ''}
            {e.errorMessage ? ` — ${e.errorMessage.slice(0, 60)}` : ''}
          </div>
        ))}
      </div>

      {/* 新增頁面 Modal — 用最小化的內聯版本（避免新檔） */}
      {showNew && (
        <NewPageInline
          onClose={() => setShowNew(false)}
          onCreate={async (type, slug, title) => {
            const id = await createPageBlank(project.id, type, slug, title);
            selectPage(id);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function NewPageInline(props: {
  onClose: () => void;
  onCreate: (type: WikiPageType, slug: string, title: string) => void;
}) {
  const [type, setType] = useState<WikiPageType>('entity');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 8, minWidth: 360 }}>
        <h3 style={{ marginTop: 0 }}>新增 Wiki 頁</h3>
        <label>類型
          <select value={type} onChange={(e) => setType(e.target.value as WikiPageType)} style={{ width: '100%' }}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <Input style={{ marginTop: 8, width: '100%' }} placeholder="slug (ascii-kebab-case)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Input style={{ marginTop: 8, width: '100%' }} placeholder="標題（可中文）" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="ghost" onClick={props.onClose}>取消</Button>
          <Button
            onClick={() => props.onCreate(type, slug.trim(), title.trim())}
            disabled={!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !title.trim()}>
            建立
          </Button>
        </div>
      </div>
    </div>
  );
}
```

> Button / Input 元件 prop 介面若不同，照 `src/components/common/Button.tsx` 既有 props 微調。

- [ ] **Step 4: 解鎖 App.tsx 的 Wiki tab**

Edit `src/App.tsx`。把：
```ts
  { key: 'wiki', label: 'Wiki', disabled: true },
```
改為：
```ts
  { key: 'wiki', label: '📚 Wiki' },
```

並把 wiki tab 的 placeholder：
```tsx
              {activeTab === 'wiki' && (
                <div style={{...}}>
                  🔒 Phase 2 開放
                </div>
              )}
```
改為：
```tsx
              {activeTab === 'wiki' && <WikiPanel />}
```

檔頂加 import：
```ts
import { WikiPanel } from './components/wiki/WikiPanel';
```

- [ ] **Step 5: 桌面 + 瀏覽器手動 smoke**

1. 進入一本書，點 Wiki tab
2. 「+ 新增頁面」建一頁 entity（slug=`test-li`、title=`測試李`）
3. 寫一些 markdown → 儲存
4. 重新整理 → 頁仍在
5. 刪除 → 確認消失 + 操作記錄底部出現該動作

- [ ] **Step 6: Commit**

```bash
git add src/stores/wikiStore.ts src/components/wiki/ src/App.tsx
git commit -m "feat(wiki): WikiPanel UI (list/editor/log) + enable Wiki tab"
```

---

## Task 15: 章節「📚 存入 Wiki」按鈕 + 徽章 + Toast + 偏好設定 + 最終驗收

**Files:**
- Modify: `src/components/chapters/ChapterEditor.tsx`
- Modify: `src/components/chapters/ChaptersPanel.tsx`
- Modify: `src/components/Toolbar.tsx`（或目前放偏好設定 modal 的元件）
- Create: `src/components/wiki/IngestToast.tsx`
- Create: `src/components/wiki/WikiPartialModal.tsx`
- Create: `src/components/wiki/IngestDiffModal.tsx`
- Modify: `docs/CHANGELOG.md`
- Modify: `modules/04-knowledge.md`
- Modify: `modules/07-context-budget.md`
- Modify: `specs/roadmap.md`

> 本 Task 整合所有 UI 觸發點 + 跑完整驗收。檔案多但每處改動小、各自獨立。

- [ ] **Step 1: IngestToast — 簡易自帶 Toast**

Create `src/components/wiki/IngestToast.tsx`：

```tsx
import { useEffect } from 'react';
import { Button } from '../common/Button';

export interface IngestToastProps {
  message: string;        // "Wiki 已更新：新增 2、修改 1"
  variant: 'success' | 'warn' | 'danger';
  onViewDiff: () => void;
  onUndo: () => void;
  onClose: () => void;
  durationMs?: number;
}

export function IngestToast({ message, variant, onViewDiff, onUndo, onClose, durationMs = 8000 }: IngestToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [onClose, durationMs]);

  const bg = variant === 'danger' ? 'var(--accent-danger)'
           : variant === 'warn'    ? 'var(--accent-warning)'
                                   : 'var(--accent-success)';

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 200,
      background: 'var(--surface)', borderLeft: `4px solid ${bg}`,
      padding: 12, borderRadius: 6, boxShadow: 'var(--shadow)',
      minWidth: 320, fontSize: 13,
    }}>
      <div style={{ marginBottom: 8 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" onClick={onViewDiff}>查看變更</Button>
        <Button size="sm" variant="ghost" onClick={onUndo}>↩ 還原</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>關閉</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: IngestDiffModal — 顯示 batch ops 與簡單行 diff**

Create `src/components/wiki/IngestDiffModal.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { storage } from '../../lib/storage';
import type { WikiLogEntry } from '../../types';
import { Modal } from '../common/Modal';

export function IngestDiffModal({ bookId, batchId, onClose }: { bookId: string; batchId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<WikiLogEntry[]>([]);
  useEffect(() => { void storage.wikiLog.listByBatch(bookId, batchId).then(setEntries); }, [bookId, batchId]);
  return (
    <Modal title={`本次 ingest（batch ${batchId.slice(0, 8)}）`} onClose={onClose}>
      <div style={{ maxHeight: '60vh', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {entries.map((e) => (
          <details key={e.id} style={{ marginBottom: 8 }}>
            <summary>{e.kind} {e.pageType}/{e.pageSlug} [{e.opStatus}]{e.errorMessage ? ` — ${e.errorMessage}` : ''}</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <pre style={{ background: 'var(--surface-2)', padding: 8, overflow: 'auto' }}>
                {e.pageSnapshotBefore?.contentMd ?? '(無 before)'}
              </pre>
              <pre style={{ background: 'var(--surface-2)', padding: 8, overflow: 'auto' }}>
                {e.pageSnapshotAfter?.contentMd ?? '(無 after)'}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </Modal>
  );
}
```

> Modal 元件介面若不同，照既有 `src/components/common/Modal.tsx` 微調 props。

- [ ] **Step 3: WikiPartialModal — partial / partial_stale 章節的處理選單**

Create `src/components/wiki/WikiPartialModal.tsx`：

```tsx
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import type { Chapter } from '../../types';

export interface PartialAction {
  label: string;
  onClick: () => void;
}

export function WikiPartialModal({ chapter, actions, onClose }: { chapter: Chapter; actions: PartialAction[]; onClose: () => void }) {
  return (
    <Modal title={`「${chapter.title}」Wiki 處理`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
          status: {chapter.wikiSyncStatus}
        </div>
        {actions.map((a) => (
          <Button key={a.label} onClick={a.onClick}>{a.label}</Button>
        ))}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: ChapterEditor 加按鈕 + 觸發 ingest / undo / partial**

Edit `src/components/chapters/ChapterEditor.tsx`。在檔頂 import 加：
```ts
import { useState } from 'react';
import { ingestChapter, retryRemaining, getFailedCountForChapter } from '../../lib/wiki-ingest';
import { undoBatch, findLatestIngestBatch } from '../../lib/wiki-undo';
import { IngestToast } from '../wiki/IngestToast';
import { IngestDiffModal } from '../wiki/IngestDiffModal';
import { WikiPartialModal } from '../wiki/WikiPartialModal';
```

在元件內加 state：
```ts
const [busy, setBusy] = useState(false);
const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'warn' | 'danger'; batchId: string } | null>(null);
const [showDiff, setShowDiff] = useState<string | null>(null);
const [showPartial, setShowPartial] = useState(false);
const [failedCount, setFailedCount] = useState(0);
```

依當前章節 status 計算按鈕 UI：

```tsx
const status = chapter.wikiSyncStatus;
const label =
  status === 'unsynced'      ? '📚 存入 Wiki' :
  status === 'synced'        ? '✓ 已存入' :
  status === 'stale'         ? '⚠️ Wiki 已過時，重新存入' :
  status === 'partial'       ? `⚠️ Wiki 部分失敗 (${failedCount})` :
                               '⚠️ 部分失敗 + 已過時';
const variant: 'primary' | 'warn' | 'danger' | 'ghost' =
  status === 'synced' ? 'ghost' :
  status === 'stale'  ? 'warn'  :
  (status === 'partial' || status === 'partial_stale') ? 'danger' : 'primary';

const onClick = async () => {
  if (busy || status === 'synced') return;
  if (status === 'partial' || status === 'partial_stale') {
    setShowPartial(true); return;
  }
  setBusy(true);
  try {
    const r = await ingestChapter(chapter);
    const msg = `Wiki 已更新：新增 ${r.plan.operations.filter(o => o.action === 'create').length} 頁、修改 ${r.plan.operations.filter(o => o.action === 'update').length} 頁` +
                (r.failedCount > 0 ? `（${r.failedCount} 個失敗）` : '');
    setToast({ msg, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
  } catch (e) {
    setToast({ msg: `Ingest 失敗：${(e as Error).message}`, variant: 'danger', batchId: '' });
  } finally {
    setBusy(false);
  }
};
```

把這段加在「底部動作列」既有按鈕群左側（在 `[💾 存入版本]` 旁邊）：
```tsx
<Button onClick={onClick} variant={variant} disabled={busy}>
  {busy ? '存入中…' : label}
</Button>
```

加 useEffect 計算 failedCount（在 chapter / status 變動時）：
```tsx
useEffect(() => {
  if (status === 'partial' || status === 'partial_stale') {
    void getFailedCountForChapter(chapter).then(setFailedCount);
  } else {
    setFailedCount(0);
  }
}, [chapter, status]);
```

在元件 JSX 結尾加 Toast / Diff / Partial modal：
```tsx
{toast && (
  <IngestToast
    message={toast.msg} variant={toast.variant}
    onViewDiff={() => setShowDiff(toast.batchId)}
    onUndo={async () => {
      await undoBatch(chapter, toast.batchId);
      setToast(null);
    }}
    onClose={() => setToast(null)}
  />
)}
{showDiff && (
  <IngestDiffModal bookId={chapter.projectId} batchId={showDiff} onClose={() => setShowDiff(null)} />
)}
{showPartial && (
  <WikiPartialModal chapter={chapter} onClose={() => setShowPartial(false)}
    actions={
      status === 'partial' ? [
        { label: '重試剩餘', onClick: async () => {
            setShowPartial(false); setBusy(true);
            try { const r = await retryRemaining(chapter, (await findLatestIngestBatch(chapter)) ?? ''); setToast({ msg: `重試完成：${r.okCount} 成功、${r.failedCount} 仍失敗`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId }); }
            finally { setBusy(false); }
        }},
        { label: '還原', onClick: async () => {
            setShowPartial(false);
            const b = await findLatestIngestBatch(chapter);
            if (b) await undoBatch(chapter, b);
        }},
        { label: '完整重跑', onClick: async () => {
            setShowPartial(false); setBusy(true);
            try {
              const b = await findLatestIngestBatch(chapter);
              if (b) await undoBatch(chapter, b);
              const r = await ingestChapter(chapter);
              setToast({ msg: `完整重跑完成：${r.okCount}/${r.failedCount}`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
            } finally { setBusy(false); }
        }},
      ] : [
        // partial_stale: 不提供重試剩餘
        { label: '還原後重新 ingest', onClick: async () => {
            setShowPartial(false); setBusy(true);
            try {
              const b = await findLatestIngestBatch(chapter);
              if (b) await undoBatch(chapter, b);
              const r = await ingestChapter(chapter);
              setToast({ msg: `已重新 ingest：${r.okCount}/${r.failedCount}`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
            } finally { setBusy(false); }
        }},
        { label: '僅還原', onClick: async () => {
            setShowPartial(false);
            const b = await findLatestIngestBatch(chapter);
            if (b) await undoBatch(chapter, b);
        }},
        { label: '完整重跑', onClick: async () => {
            setShowPartial(false); setBusy(true);
            try {
              const b = await findLatestIngestBatch(chapter);
              if (b) await undoBatch(chapter, b);
              const r = await ingestChapter(chapter);
              setToast({ msg: `完整重跑完成：${r.okCount}/${r.failedCount}`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
            } finally { setBusy(false); }
        }},
      ]
    } />
)}
```

- [ ] **Step 5: ChaptersPanel 加徽章 + 頂部 banner + 批次處理**

Edit `src/components/chapters/ChaptersPanel.tsx`。對每個章節 item 渲染徽章：

```tsx
function WikiBadge({ status }: { status: Chapter['wikiSyncStatus'] }) {
  if (status === 'synced') return null;
  const map: Record<Exclude<Chapter['wikiSyncStatus'], 'synced'>, { text: string; color: string }> = {
    unsynced:      { text: '⚠️ 未存 Wiki',      color: 'var(--accent-warning)' },
    stale:         { text: '⚠️ Wiki 已過時',     color: 'var(--accent-warning)' },
    partial:       { text: '⚠️ Wiki 部分失敗',   color: 'var(--accent-danger)'  },
    partial_stale: { text: '⚠️ 部分失敗 + 已過時', color: 'var(--accent-danger)' },
  };
  const m = map[status];
  return <span style={{ fontSize: 10, color: m.color, marginLeft: 6 }}>{m.text}</span>;
}
```

把 `<WikiBadge status={chapter.wikiSyncStatus} />` 加到章節列表 item 中。

頂部 banner（在 chapters 列表頂端、按鈕群下方）：

```tsx
const nonSynced = chapters.filter((c) => c.wikiSyncStatus !== 'synced');
{nonSynced.length > 0 && (
  <div style={{
    background: 'var(--surface-2)', padding: 8, fontSize: 12, display: 'flex',
    justifyContent: 'space-between', alignItems: 'center',
  }}>
    <span>您有 {nonSynced.length} 個章節 Wiki 未完整同步</span>
    <Button size="sm" onClick={() => void batchProcess(nonSynced)} disabled={busy}>批次處理</Button>
  </div>
)}
```

`batchProcess` 邏輯（同檔內加函式 + state）：

```ts
const [busy, setBusy] = useState(false);
const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; cur: string } | null>(null);
const batchProcess = async (list: Chapter[]) => {
  setBusy(true);
  setBatchProgress({ done: 0, total: list.length, cur: '' });
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    setBatchProgress({ done: i, total: list.length, cur: ch.title });
    try {
      if (ch.wikiSyncStatus === 'unsynced' || ch.wikiSyncStatus === 'stale') {
        await ingestChapter(ch);
      } else if (ch.wikiSyncStatus === 'partial') {
        const b = await findLatestIngestBatch(ch);
        if (b) await retryRemaining(ch, b);
      } else if (ch.wikiSyncStatus === 'partial_stale') {
        const b = await findLatestIngestBatch(ch);
        if (b) await undoBatch(ch, b);
        await ingestChapter(ch);
      }
    } catch (e) {
      console.warn('batch ingest 失敗：', ch.title, e);
    }
  }
  setBatchProgress(null);
  setBusy(false);
  // 重新拉 chapters 給 store
  if (project) await useProjectStore.getState().loadChapters(project.id);
};
```

進度顯示（modal 或 inline）：

```tsx
{batchProgress && (
  <div style={{ padding: 8, background: 'var(--surface-2)', fontSize: 12 }}>
    處理中 {batchProgress.done}/{batchProgress.total}：{batchProgress.cur}
  </div>
)}
```

- [ ] **Step 6: Toolbar 偏好設定 Modal 加 Wiki 區塊**

Edit `src/components/Toolbar.tsx`（或目前承載偏好設定 Modal 的元件 — 用 `grep -rn "AI 提示詞\|偏好設定" src/components` 找實際位置）。

在「📜 AI 提示詞」區塊內，把新增的 4 個 wiki templates 加進可編輯列表（沿用既有 template 編輯 UI 邏輯）。

加新區塊「📚 Wiki 設定」：

```tsx
const { wikiPrefs, setWikiPrefs } = useSettingsStore();
// ...
<section>
  <h3>📚 Wiki 設定</h3>
  <label>
    Wiki 區塊預算佔比：
    <input
      type="range" min={0.1} max={0.5} step={0.05}
      value={wikiPrefs.budgetRatio}
      onChange={(e) => setWikiPrefs({ budgetRatio: parseFloat(e.target.value) })}
    />
    {Math.round(wikiPrefs.budgetRatio * 100)}%
  </label>
  <label>
    連續超預算警告閾值：
    <input type="number" min={1} max={20}
      value={wikiPrefs.overflowWarnThreshold}
      onChange={(e) => setWikiPrefs({ overflowWarnThreshold: parseInt(e.target.value) || 3 })}
    />
  </label>
  <label>
    <input type="checkbox" disabled checked={wikiPrefs.enablePickPages} />
    啟用 pick-pages 模式（Phase 2.5 後可用）
  </label>
</section>
```

- [ ] **Step 7: 把 wikiSection 接到實際章節生成流程**

找到目前 chapter generation 觸發點（多半在 `src/lib/ai-tasks.ts` 或 `ChapterEditor.tsx` 的「✨ 生成本章」/「↩️ 重新生成」handler）：

```bash
grep -rn "buildGenerationPrompt\|allocateBudget" src/ --include='*.ts' --include='*.tsx'
```

對每個 caller，在組 `BudgetInputs` 前先呼叫 wiki loader：

```ts
import { loadWikiForGeneration } from './wiki-loader';
import { formatWikiSection } from './wiki-section';
import { useSettingsStore } from '../stores/settingsStore';

// 在 caller 內：
const { wikiPrefs, llmConfig } = useSettingsStore.getState();
// 模型 context window — 沒設精細數字就用預設 128k（與既有 DEFAULT_CONTEXT_WINDOW 對齊）
const ctxWindow = 128000;
const wikiResult = await loadWikiForGeneration({
  bookId: project.id,
  contextWindowTokens: ctxWindow,
  budgetRatio: wikiPrefs.budgetRatio,
  chapterContext: {
    title: chapter.title,
    points: chapter.points,
    beat: chapter.beat,
    referenceChapterContent: refContent,         // 同既有變數
    characterNames: characters.map((c) => c.name),
    characterAliases: [],                        // characters 表目前無 aliases 欄位；先空陣列
  },
});
const wikiSection = formatWikiSection(wikiResult);

const budget = allocateBudget({
  // ...既有欄位...
  wikiSection,
});
```

- [ ] **Step 8: TS 編譯歸零 + 雙平台 dev 跑一次確認**

```bash
npx tsc -b --noEmit
npm run lint
```

兩個都 0 errors / warnings 後：
```bash
npm run dev        # 瀏覽器
npm run tauri dev  # 桌面
```

- [ ] **Step 9: 跑 spec §8 的 14 條驗收**

逐條手動執行（記錄結果到一個臨時 markdown）：

1. **基本 CRUD**：Wiki 分頁 + - 新增頁、編輯、刪除、重啟存活 — 兩平台都驗
2. **Ingest 成功路徑**：對既有書某章按「📚 存入 Wiki」→ wiki_pages 出現新頁、wiki_log 有對應 ok 記錄、徽章變灰
3. **Ingest 還原**：剛 ingest 完按 toast「↩ 還原」→ wiki 回到 ingest 前、徽章回橘
4. **重複偵測**：對含「李明」章 ingest 後，再對含「小李」章 ingest → 同一 entity 被 update 而非建立重複頁
5. **生成整合**：生成下一章時，prompt_log（temp/chapter-gen-*.txt）內含 `### 相關 Wiki 條目`
6. **預算警報**：建 50 頁 wiki + 偏好設定的 budgetRatio 拉到 0.05 + ctxWindow=4000 → 章節編輯區顯示黃色 banner；100 頁紅色
7. **未存提醒**：未存章節徽章正確；批次處理完徽章全清
8. **匯入向後相容**：載入 Phase 5b 時代 backup JSON（無 wikiPages / wikiLog 欄位）不報錯
9. **跨平台 round-trip**：瀏覽器版建 wiki → 匯出 → 桌面版匯入 → 桌面版查 → 一致
10. **刪書級聯**：刪除書後查 wiki_pages、wiki_log 為 0 條
11. **Partial 狀態**：mock apply 失敗（暫時 throw in `applyOneOp` 或斷網）→ status='partial'，徽章紅色，failed 數對
12. **Partial → 重試**：partial 章按「重試剩餘」→ 全成功則變 synced，仍有失敗則維持 partial
13. **Partial → 內容變更**：partial 章編輯後 status → partial_stale
14. **Delete undo round-trip**：手動建頁 → 刪除產生 delete log（**目前 UI 刪除不寫 log，是直接 storage.delete**；本 task 範圍內未涵蓋 → 標為「N/A，刪除走非 log 路徑」**且補一行**在 `docs/CHANGELOG.md` 標明）。

> 第 14 條的 N/A 是合理的 — spec 設計裡 wiki_pages 手動刪除走「直接刪、不進 log」（避免「使用者把自己手動刪的頁不小心 undo 回來」），ingest pipeline 的 delete op 才會有 delete log。若需求變了，後續再加 task。

- [ ] **Step 10: 文件更新**

Edit `docs/CHANGELOG.md` 頂端新增條目：

```markdown
## 2026-05-17 — Phase 2 Part 1: LLM Wiki

完整實作 LLM 自管知識層（spec：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md`，4 輪 codex review）。

**新增功能**
- 左側 📚 Wiki 分頁：5 種 page type、index、編輯、操作記錄
- 章節「📚 存入 Wiki」按鈕 + 5 種狀態徽章（unsynced/synced/stale/partial/partial_stale）
- Ingest pipeline：Plan + 校驗 + Apply + 補償寫入 + 一鍵還原
- Context Budget 整合：cheap relevance filter + 預算截斷預警
- 偏好設定「📚 Wiki 設定」 + 4 個 wiki prompt templates 可編輯
- 跨平台 round-trip：backup schema v2（向後相容 v1）

**Schema 變更**
- SQLite: 002_wiki_tables.sql（wiki_pages + wiki_log，含 batch_id、op_status、page_snapshot JSON）
- Dexie: v5（wikiPages / wikiLog object stores、chapters 多 wikiSyncedHash / wikiSyncStatus）

**已知限制 / 範圍**
- Pick-pages 兩段式查詢留 Phase 2.5
- Lint（矛盾 / 孤頁 / broken link）留 Phase 2.5
- Wiki 不自動寫入 characters 表，只在 unrecorded_characters 提示
- Wiki 頁手動刪除不進 log（只有 ingest pipeline 的 delete op 才寫 log）
```

Edit `modules/04-knowledge.md` 開頭加：

```markdown
> **Phase 2 LLM Wiki 已實作（2026-05-17）。** 設計與實作細節見：
> - 規格：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md`
> - 實作計畫：`docs/superpowers/plans/2026-05-17-llm-wiki-phase-2.md`
>
> 本檔（modules/04）保留為高層模組描述。
```

Edit `modules/07-context-budget.md` 在「Phase 1 實作狀況」之後加：

```markdown
## Phase 2 — wikiSection 整合（已實作 2026-05-17）

`BudgetInputs` 新增 `wikiSection: string` 欄位。`buildGenerationPrompt()` 將其注入 `DEFAULT_CHAPTER_CONTENT_TEMPLATE` 的 `{{wikiSection}}`。

實作：`src/lib/wiki-loader.ts`（cheap relevance filter + 優先級 + 預算截斷）→ `src/lib/wiki-section.ts`（格式化）。

詳見：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md` §5。
```

Edit `specs/roadmap.md`，Phase 2 第 1 項從：
```
1. ❌ LLM Wiki 完整功能（存入 + 未存入提醒機制）→ 04-knowledge
```
改為：
```
1. ✅ LLM Wiki 完整功能（2026-05-17）→ `docs/superpowers/specs/2026-05-17-llm-wiki-design.md`
```

Phase 2 標頭從「⚠️ 部分完成」更新為「⚠️ 進行中（Wiki ✅、Vector RAG/FTS ⏳、角色關係圖 ❌）」。

- [ ] **Step 11: 移除 dev-time 暫掛 window 物件**

`grep -rn "window\\.__" src/` 找出 dev 期暫加的 helper，移除。

- [ ] **Step 12: Final commit + push**

```bash
git add -A
git status                 # 確認沒 temp/probe-*.ts 等不該進的檔
git commit -m "feat(wiki): UI integration + docs update; close Phase 2 LLM Wiki"
git push origin main
```

---

## 完成標準

- 所有 15 個 Task 全 ✅
- `npx tsc -b --noEmit` 0 errors
- `npm run lint` 0 errors
- spec §8 驗收 1-13 通過（第 14 條標 N/A 並在 CHANGELOG 註明）
- `git status` clean
- 桌面 MSI 重新打包（`npm run tauri build`）並用新 wiki 流程跑通至少 1 章 ingest + 還原

