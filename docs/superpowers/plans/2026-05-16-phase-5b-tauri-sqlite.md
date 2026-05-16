# Phase 5b — Tauri Shell + SQLite Adapter (Windows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把現有的 React/Vite app 包成 Tauri Windows 桌面版，並讓桌面版的儲存層走 SQLite（透過已抽好的 `StorageAdapter` 介面）；瀏覽器版同一份 codebase 仍走 Dexie。

**Architecture:**
1. 在 repo 內 retrofit `src-tauri/`（Rust 殼），不動既有 React code。
2. 新增 `TauriSqliteAdapter` 實作 `StorageAdapter`，並在 `src/lib/storage/index.ts` 用 `window.__TAURI_INTERNALS__` 偵測平台決定 adapter。
3. SQLite schema 與 Dexie tables 1:1 對齊（`data TEXT` 存 JSON + 必要 indexed columns），詳見 `docs/superpowers/specs/2026-05-15-tauri-sqlite-migration-design.md` §5。
4. 跨平台資料遷移走「使用者手動 export JSON → 桌面版 import JSON」流程（沿用 5a 既有 `backup.ts`），**不寫自動偵測**。

**Tech Stack:**
- Tauri 2.x (`@tauri-apps/cli`, `@tauri-apps/api`)
- `@tauri-apps/plugin-sql` + `tauri-plugin-sql` (Rust crate, SQLite bundled)
- Rust toolchain (Windows 用 MSVC `stable-x86_64-pc-windows-msvc`)
- 沿用 React 19 / Vite 8 / Zustand 5 / TypeScript strict

**Scope（YAGNI）：**
- 只做 Windows 平台（macOS/Linux 之後再說）。
- 不做自動 IndexedDB→SQLite 遷移、不做 code signing、不做自動更新、不引入 Tauri 後端代理 LLM。
- 不重做 schema、不加 FTS5、不存 binary。
- `fs-sync.ts` 的 File System Access auto-sync 在 Tauri 環境自動降級（不啟用 UI），不寫桌面版替代品（留到後續 polish）。

---

## File Map

**新增**
- `src-tauri/Cargo.toml` — Rust crate manifest
- `src-tauri/tauri.conf.json` — Tauri 設定（window / build commands / bundle 設定）
- `src-tauri/src/main.rs` — Rust entry point；註冊 `tauri-plugin-sql`
- `src-tauri/build.rs` — Tauri build script
- `src-tauri/icons/` — app icon（暫用 Tauri 預設）
- `src-tauri/migrations/001_initial.sql` — SQLite 初始 schema
- `src-tauri/.gitignore` — 忽略 `target/`
- `src/lib/storage/sqlite-helpers.ts` — 共用 helpers：row ↔ entity 轉換、JSON 欄位序列化
- `src/lib/storage/tauri-sqlite-adapter.ts` — `StorageAdapter` 的 SQLite 實作
- `src/lib/platform.ts` — `isTauri()` 偵測（從 `storage/index.ts` 抽出，供其他 module 共用）

**修改**
- `package.json` — 加 `tauri` script、`@tauri-apps/cli` (devDep)、`@tauri-apps/api` + `@tauri-apps/plugin-sql` (deps)
- `src/lib/storage/index.ts` — 改用 `platform.isTauri()`、Tauri 環境改回 `TauriSqliteAdapter`
- `src/lib/fs-sync.ts` — `isFsAccessSupported()` 在 Tauri 環境一律回 false（auto-sync UI 自動隱藏）
- `.gitignore`（repo root）— 忽略 `src-tauri/target/`
- `docs/CHANGELOG.md` — 加 Phase 5b 條目
- `specs/tech-stack.md` — 標註 Tauri/SQLite 進入生產

**不動**
- 既有所有 React component、Zustand stores、`ai-tasks`、`backup.ts`、`db.ts`（仍是 Dexie 用）
- `dexie-adapter.ts`（瀏覽器版繼續使用）

---

## Prerequisites

### P1: Rust + Tauri prerequisites（手動，**人類執行**）

實作 agent **不要**自動跑這步；先請使用者確認下列環境就緒，避免 CI 與本機環境踩坑：

- [ ] **Rust toolchain**：`rustup --version` 有輸出；若無，從 https://rustup.rs/ 安裝
  - 預設 toolchain：`stable-x86_64-pc-windows-msvc`
  - `rustc --version` 應顯示 `1.7x` 或更新版
- [ ] **Microsoft C++ Build Tools**：透過 Visual Studio Installer 安裝「Desktop development with C++」workload；包含 MSVC + Windows SDK
- [ ] **WebView2 Runtime**：Windows 10/11 通常已內建；若無從 https://developer.microsoft.com/microsoft-edge/webview2/ 安裝 Evergreen Bootstrapper
- [ ] **Node 工具鏈不變**：沿用現有 Vite 8 / Node 20+
- [ ] **磁碟空間**：第一次 `cargo build` 約需 1.5 GB（依賴編譯）

通過後使用者回覆 "prereqs OK" 再進入 Task 1。

---

## Task 1: Scaffold src-tauri/（最小可開啟視窗）

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/.gitignore`
- Create: `src-tauri/icons/` (use Tauri default — see Step 3)
- Modify: `package.json`（加 `tauri` script + devDep `@tauri-apps/cli@^2`）
- Modify: `.gitignore`（root）

- [ ] **Step 1: 安裝 Tauri CLI 與 API**

Run:
```bash
npm install --save-dev @tauri-apps/cli@^2
npm install @tauri-apps/api@^2
```

Expected: `package.json` 多出兩個依賴；無安裝錯誤。

- [ ] **Step 2: 加 `tauri` script**

Edit `package.json` — 在 `"scripts"` 區段加入：
```json
"tauri": "tauri"
```

完整 `scripts` 預期長相：
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "tauri": "tauri"
}
```

- [ ] **Step 3: 用官方 init 產出最小骨架**

Run:
```bash
npm run tauri init
```

互動式回答：
- App name: `novel-generator`
- Window title: `小說產生器`
- Web assets location: `../dist`
- Dev server URL: `http://localhost:5173`
- Frontend dev command: `npm run dev`
- Frontend build command: `npm run build`

Expected: `src-tauri/` 目錄被建立，含 `Cargo.toml` / `tauri.conf.json` / `src/main.rs` / `build.rs` / `icons/`。

- [ ] **Step 4: 手動覆寫 tauri.conf.json 確保 Windows-only + 識別碼**

Replace `src-tauri/tauri.conf.json` content with:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "小說產生器",
  "version": "0.1.0",
  "identifier": "com.novelgenerator.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "小說產生器",
        "width": 1280,
        "height": 800,
        "minWidth": 960,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ]
  }
}
```

說明：`targets: ["msi"]` 只打 Windows MSI；`csp: null` 允許前端直接 fetch LLM API（沿用瀏覽器版行為）。

- [ ] **Step 5: 加 root `.gitignore` 規則**

Append to `.gitignore` (root):
```
# Tauri build artifacts
src-tauri/target/
```

並建立 `src-tauri/.gitignore`：
```
/target/
```

- [ ] **Step 6: 第一次 `tauri dev` smoke test**

Run:
```bash
npm run tauri dev
```

Expected:
- 第一次需 5-15 分鐘編譯 Rust 依賴
- 編譯完成後跳出 1280×800 視窗，顯示既有 React app 首頁（書庫）
- 視窗 title 為「小說產生器」
- DevTools (F12 或右鍵 Inspect) 可開啟，console 無 error
- 在 app 內可建一本書（Dexie 還沒被取代，仍可運作）

若編譯失敗 — 通常是 MSVC / SDK 沒裝好；參考 Prerequisites P1。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/ package.json package-lock.json .gitignore
git commit -m "feat(5b): scaffold Tauri Windows shell

- Add src-tauri/ with minimal tauri.conf.json (Windows MSI target only)
- Wire 'npm run tauri dev' to existing Vite dev server
- Existing React app (Dexie storage) confirmed working inside webview"
```

---

## Task 2: 加入 tauri-plugin-sql 與初始 schema

**Files:**
- Modify: `src-tauri/Cargo.toml`（加 `tauri-plugin-sql` 依賴）
- Modify: `src-tauri/src/main.rs`（註冊 plugin + migrations）
- Create: `src-tauri/migrations/001_initial.sql`
- Modify: `src-tauri/tauri.conf.json`（plugin permissions）
- Modify: `package.json`（加 `@tauri-apps/plugin-sql`）

- [ ] **Step 1: 安裝 JS 端 plugin**

Run:
```bash
npm install @tauri-apps/plugin-sql@^2
```

- [ ] **Step 2: 加入 Rust 端 plugin 依賴**

Edit `src-tauri/Cargo.toml`，在 `[dependencies]` 區段加入（保留既有 `tauri` / `serde` 等行）：
```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

- [ ] **Step 3: 撰寫 SQL migration**

Create `src-tauri/migrations/001_initial.sql`:
```sql
-- Phase 5b initial schema
-- Aligned 1:1 with Dexie v4 tables; data column stores full entity as JSON.
-- Top-level columns mirror indexed fields for query efficiency.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_updated ON projects(updated_at);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_chapters_project ON chapters(project_id, ord);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_versions_chapter ON versions(chapter_id, created_at);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_characters_project ON characters(project_id);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Phase 6 placeholder (empty table — no app code touches it yet)
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_media_chapter ON media_assets(chapter_id);
CREATE INDEX idx_media_project ON media_assets(project_id);
```

說明：
- `ord` 而非 `order`（後者是 SQL 關鍵字）。
- `chapters.updated_at` 提到頂層方便排序 / 診斷（雖然當前無 query 用，但成本低）。
- 不含 `settings` 表 — LLM config 沿用 Zustand persist (localStorage)，不進儲存層（與 spec §1 一致）。
- 不含 FTS / 全文搜尋（YAGNI）。

- [ ] **Step 4: 在 main.rs 註冊 plugin + migrations**

Replace `src-tauri/src/main.rs` content with:
```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:novel-generator.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

說明：DB 檔名為 `novel-generator.db`，會放在 Tauri 預設 `$APPDATA/com.novelgenerator.app/` 下（Windows 上即 `%AppData%\com.novelgenerator.app\novel-generator.db`）。

- [ ] **Step 5: 加 tauri.conf.json plugin permissions**

Edit `src-tauri/tauri.conf.json`，在最外層加入 `plugins` 區段：
```json
"plugins": {
  "sql": {
    "preload": ["sqlite:novel-generator.db"]
  }
}
```

完整檔案應在 `bundle` 之後加入該區段。

- [ ] **Step 6: 啟動驗證 migration 執行**

Run:
```bash
npm run tauri dev
```

Expected:
- App 視窗開啟（Rust 重新編譯包含 plugin，需 3-5 分鐘）
- DevTools console 無 plugin-sql 相關 error
- 用檔案總管確認 `%AppData%\com.novelgenerator.app\novel-generator.db` 已建立且非 0 bytes
  - 用 SQLite browser（如 https://sqlitebrowser.org/）打開，確認 7 個表（projects/chapters/versions/characters/app_meta/media_assets + _sqlx_migrations）都存在

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/migrations/ src-tauri/tauri.conf.json package.json package-lock.json
git commit -m "feat(5b): add tauri-plugin-sql with initial SQLite schema

- 7 tables: projects/chapters/versions/characters/app_meta/media_assets (+ _sqlx_migrations)
- data TEXT (JSON) + indexed top-level cols (1:1 with Dexie v4)
- DB located at %AppData%/com.novelgenerator.app/novel-generator.db"
```

---

## Task 3: 抽 platform.ts + SQLite helpers

**Files:**
- Create: `src/lib/platform.ts`
- Create: `src/lib/storage/sqlite-helpers.ts`

- [ ] **Step 1: 抽 isTauri() 到獨立模組**

Create `src/lib/platform.ts`:
```ts
/**
 * 平台偵測 — 只回答「目前是不是跑在 Tauri webview 內」
 *
 * Tauri 2.x 在 window 上注入 __TAURI_INTERNALS__；舊版用 __TAURI__。
 * 同時檢查兩者，相容性最廣。
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}
```

- [ ] **Step 2: 建立 SQLite helpers**

Create `src/lib/storage/sqlite-helpers.ts`:
```ts
/**
 * TauriSqliteAdapter 的內部 helpers
 *
 * 主要負責：
 *  - 「entity (TS object) ↔ row (SQL columns)」轉換
 *  - data TEXT 欄位的 JSON.parse / stringify
 *  - 部分更新時的「讀-merge-寫」邏輯
 */
import type { Project, Chapter, ChapterVersion, Character } from '../../types';

export interface ProjectRow {
  id: string;
  data: string;
  created_at: number;
  updated_at: number;
}
export interface ChapterRow {
  id: string;
  project_id: string;
  ord: number;
  updated_at: number;
  data: string;
}
export interface VersionRow {
  id: string;
  chapter_id: string;
  kind: 'full' | 'inline';
  created_at: number;
  data: string;
}
export interface CharacterRow {
  id: string;
  project_id: string;
  name: string;
  data: string;
}
export interface AppMetaRow {
  key: string;
  value: string;
}

// ---------- entity → row ----------

export function projectToRow(p: Project): ProjectRow {
  return {
    id: p.id,
    data: JSON.stringify(p),
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function chapterToRow(c: Chapter): ChapterRow {
  return {
    id: c.id,
    project_id: c.projectId,
    ord: c.order,
    updated_at: c.updatedAt,
    data: JSON.stringify(c),
  };
}

export function versionToRow(v: ChapterVersion): VersionRow {
  return {
    id: v.id,
    chapter_id: v.chapterId,
    kind: v.kind,
    created_at: v.createdAt,
    data: JSON.stringify(v),
  };
}

export function characterToRow(c: Character): CharacterRow {
  return {
    id: c.id,
    project_id: c.projectId,
    name: c.name,
    data: JSON.stringify(c),
  };
}

// ---------- row → entity ----------

export function rowToProject(r: ProjectRow): Project {
  return JSON.parse(r.data) as Project;
}
export function rowToChapter(r: ChapterRow): Chapter {
  return JSON.parse(r.data) as Chapter;
}
export function rowToVersion(r: VersionRow): ChapterVersion {
  return JSON.parse(r.data) as ChapterVersion;
}
export function rowToCharacter(r: CharacterRow): Character {
  return JSON.parse(r.data) as Character;
}

// ---------- partial merge for update() ----------

/**
 * 把 Partial<T> 合進現有 entity，回傳更新後物件。
 * 用於 storage.{kind}.update(id, data) 的「讀-merge-寫」流程。
 */
export function mergePartial<T extends object>(current: T, patch: Partial<T>): T {
  return { ...current, ...patch };
}
```

- [ ] **Step 3: TypeScript 編譯檢查**

Run:
```bash
npm run build
```

Expected: 編譯通過（這兩個檔案目前無人使用，只是先存在）。

- [ ] **Step 4: Commit**

```bash
git add src/lib/platform.ts src/lib/storage/sqlite-helpers.ts
git commit -m "refactor(5b): extract platform detection + add SQLite helpers

- src/lib/platform.ts: isTauri() detection (window.__TAURI_INTERNALS__)
- src/lib/storage/sqlite-helpers.ts: entity↔row conversion + JSON serialization
- Not wired yet; TauriSqliteAdapter in next task"
```

---

## Task 4: 實作 TauriSqliteAdapter（5 個 stores + replaceAll）

**Files:**
- Create: `src/lib/storage/tauri-sqlite-adapter.ts`

- [ ] **Step 1: 撰寫 adapter 主體**

Create `src/lib/storage/tauri-sqlite-adapter.ts`:
```ts
/**
 * TauriSqliteAdapter — StorageAdapter 的 Tauri + tauri-plugin-sql 實作
 *
 * 設計：
 *  - DB 連線在 module load 時 lazy-init（第一次呼叫時開）
 *  - 介面形狀完全對齊 DexieAdapter（src/lib/storage/types.ts）
 *  - data TEXT 欄位存完整 entity JSON；indexed columns 同步寫
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
import type { Project, Chapter, ChapterVersion, Character } from '../../types';
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
  if (!dbPromise) dbPromise = Database.load(DB_URL);
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

async function replaceAll(bundle: StorageBundle): Promise<void> {
  const db = await getDb();
  await db.execute('BEGIN');
  try {
    await db.execute('DELETE FROM characters');
    await db.execute('DELETE FROM versions');
    await db.execute('DELETE FROM chapters');
    await db.execute('DELETE FROM projects');
    for (const p of bundle.projects ?? []) await projects.add(p);
    for (const c of bundle.chapters ?? []) await chapters.add(c);
    for (const v of bundle.versions ?? []) await versions.add(v);
    for (const c of bundle.characters ?? []) await characters.add(c);
    await db.execute('COMMIT');
  } catch (err) {
    await db.execute('ROLLBACK');
    throw err;
  }
}

export const tauriSqliteAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  replaceAll,
};
```

說明：
- `getDb()` 用 lazy module-level promise；首次呼叫才連線，後續共用同一個 connection。
- `bulkDelete` 與 `deleteByProjects` 自行組 `IN ($1,$2,...)` placeholder list — `tauri-plugin-sql` 不支援 array binding。
- `replaceAll` 用 raw `BEGIN/COMMIT` 而非 plugin 的 transaction API（後者目前 API 不穩，raw SQL 更可控）。
- `appMeta.put` 用 `ON CONFLICT DO UPDATE`（SQLite upsert）。

- [ ] **Step 2: TypeScript 編譯**

Run:
```bash
npm run build
```

Expected: 編譯通過；`tauri-sqlite-adapter.ts` 不會被任何前端 module import，只是先存在於 codebase。

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/tauri-sqlite-adapter.ts
git commit -m "feat(5b): implement TauriSqliteAdapter

- All 5 stores (projects/chapters/versions/characters/appMeta) + replaceAll
- Lazy DB connection via getDb() promise
- Partial updates use SELECT → merge → UPDATE pattern
- replaceAll wrapped in BEGIN/COMMIT/ROLLBACK
- Not wired into pickAdapter() yet"
```

---

## Task 5: 串接 pickAdapter() + fs-sync 降級

**Files:**
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/fs-sync.ts`

- [ ] **Step 1: 改 pickAdapter() 走 Tauri 分支**

Replace `src/lib/storage/index.ts` content with:
```ts
/**
 * Storage entry point
 *
 * 平台偵測決定 adapter：
 *  - Tauri webview → TauriSqliteAdapter（Phase 5b）
 *  - 一般瀏覽器  → DexieAdapter（Phase 5a）
 *
 * 對外只 export `storage`（singleton）；UI / stores / lib 都 import 它。
 */
import type { StorageAdapter } from './types';
import { dexieAdapter } from './dexie-adapter';
import { tauriSqliteAdapter } from './tauri-sqlite-adapter';
import { isTauri } from '../platform';

function pickAdapter(): StorageAdapter {
  return isTauri() ? tauriSqliteAdapter : dexieAdapter;
}

export const storage: StorageAdapter = pickAdapter();
export type { StorageAdapter, StorageBundle } from './types';
```

- [ ] **Step 2: fs-sync 在 Tauri 下永遠不支援**

Edit `src/lib/fs-sync.ts`：

(a) 在檔頭 import 區塊（`import { storage } from './storage';` 下一行）加：
```ts
import { isTauri } from './platform';
```

(b) 把既有 `isFsAccessSupported` 函式整段替換為：
```ts
/** Vendor-prefixed API 不存在的瀏覽器（Firefox / Safari）會回 false。Tauri 桌面版亦回 false（改走後續手動 export/import）。 */
export function isFsAccessSupported(): boolean {
  if (isTauri()) return false;
  return typeof (globalThis as any).showDirectoryPicker === 'function';
}
```

說明：UI 端已依此 flag 決定是否顯示「連結資料夾」按鈕，桌面版自然不顯示，無需改 UI 元件。

- [ ] **Step 3: 瀏覽器版 regression check**

Run:
```bash
npm run dev
```

開瀏覽器到 http://localhost:5173，DevTools console 應無 error，建一本書能成功（沿用 DexieAdapter）。Ctrl+C 停掉。

- [ ] **Step 4: 桌面版第一次走 SQLite path**

Run:
```bash
npm run tauri dev
```

Expected:
- 視窗開啟，首頁書庫空白（SQLite 是新的）
- 建立一本書「測試書」、加入大綱、儲存
- DevTools console 觀察：應看到 `tauri-plugin-sql` 訊息但無 error
- 確認 `%AppData%\com.novelgenerator.app\novel-generator.db` 內 `projects` 表多了一筆
- 關掉 app（×），重開 `npm run tauri dev`，首頁「測試書」仍在 → **資料持久化成功**

- [ ] **Step 5: 完整 CRUD smoke（在 Tauri 視窗內）**

進入「測試書」，逐項驗證：
- 新增章節 → 修改 title → 重排（如果 UI 支援）→ 刪章節 → 確認 DB rows 對應
- 在某章節按「生成」（若 LLM key 已設）或手動輸入 content → 儲存版本 → pin / unpin / delete version
- 新增角色 → 修改 → 刪除
- 刪除整本書 → 確認 chapters / versions / characters 連帶清空（用 SQLite browser 查）

期望：所有操作即時反映在 DB；無 console error。

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/index.ts src/lib/fs-sync.ts
git commit -m "feat(5b): route storage to TauriSqliteAdapter on desktop

- pickAdapter(): isTauri() → tauriSqliteAdapter, else dexieAdapter
- fs-sync.isFsAccessSupported() returns false in Tauri (no auto-sync UI)
- Browser version unchanged (still Dexie)
- Desktop verified: CRUD + cold-restart persistence"
```

---

## Task 6: 手動 export/import 跨平台搬遷驗證

**Files:** 無新檔案 — 純功能驗證；如發現問題才回頭改。

- [ ] **Step 1: 在瀏覽器版產出 snapshot**

Run `npm run dev`，瀏覽器開啟 app：
- 確認有現存資料（若無，建一本含 2 章節的範例書）
- 進入備份/匯出 UI，按「匯出 JSON」
- 應下載 `novel-generator-backup.json` 到 Downloads

把該檔複製到桌面方便下一步取用。

- [ ] **Step 2: 在桌面版匯入該 snapshot**

Run `npm run tauri dev`，Tauri 視窗開啟：
- 進入備份/匯入 UI，選剛才那個 JSON 檔
- 確認跳出「將清空現有資料並還原」確認框（沿用 5a 行為）
- 確認後等待完成
- 首頁應顯示瀏覽器版的書，點進去章節 / 版本 / 角色都還在

- [ ] **Step 3: SQLite 內容核對**

用 SQLite browser 打開 `%AppData%\com.novelgenerator.app\novel-generator.db`：
- `SELECT COUNT(*) FROM projects` / `chapters` / `versions` / `characters` 數字與瀏覽器版一致
- 抽一筆 `SELECT data FROM chapters LIMIT 1` 確認 JSON 結構正確（含 `title`/`content`/`order` 等欄位）

- [ ] **Step 4: 反向驗證（桌面 → 瀏覽器）**

桌面版內按「匯出 JSON」（沿用同一個 backup.ts code path）→ 把產出檔放 Downloads → 瀏覽器版匯入 → 確認資料還原。

- [ ] **Step 5: 若有 bug，回頭修並 commit**

若上述任一步失敗：
- DexieAdapter / TauriSqliteAdapter 任一邊的 `replaceAll` 行為不一致 → 對齊 `dexie-adapter.ts:94-105` 與 `tauri-sqlite-adapter.ts` 的 `replaceAll`
- JSON 欄位欄序不同 → 應該不會有影響，但要 grep 確認

若無 bug，**不需要 commit**（這個 task 純驗證）；繼續 Task 7。

---

## Task 7: 打 Windows MSI 安裝包

**Files:** 無原始碼變動；驗證 `tauri.conf.json` bundle 設定能產出可安裝檔。

- [ ] **Step 1: Release build**

Run:
```bash
npm run tauri build
```

Expected：
- Rust 以 release mode 重編譯（10-20 分鐘，第一次）
- 產出 `.msi` 路徑：`src-tauri/target/release/bundle/msi/小說產生器_0.1.0_x64_zh-TW.msi`（檔名實際隨 locale 而定，可能是 `_en-US`）

若編譯失敗，常見原因：
- 缺 WiX Toolset → Tauri 會自動下載；若被 firewall 擋需手動裝 https://wixtoolset.org/
- icons 找不到 → Task 1 Step 3 的 `tauri init` 應已產出預設 icons；若缺，從 https://tauri.app/distribute/sign/ 文件下載 sample icon set

- [ ] **Step 2: 雙擊安裝**

雙擊 `.msi`：
- 確認可完成安裝（可能跳「Windows protected your PC」— 點「More info → Run anyway」，未 code-sign 是已知事項）
- 從開始選單啟動「小說產生器」
- 視窗開啟，UI 正常
- 在已安裝版本內建立一本「安裝測試書」、加入章節、關掉、重開 → 資料仍在
- 確認 DB 位置：`%AppData%\com.novelgenerator.app\novel-generator.db`（與 dev 版同位置，**注意 dev 與安裝版會共用 DB**）

- [ ] **Step 3: 解除安裝（清理）**

開「設定 → 應用程式 → 安裝的應用程式」找到「小說產生器」→ 解除安裝。
注意：**解除安裝不會刪 `%AppData%\com.novelgenerator.app\`**（這是預期行為，避免使用者資料意外消失）。手動驗證 DB 仍在。

- [ ] **Step 4: Commit（如果有任何 conf 微調）**

若 Step 1-3 過程中改了 `tauri.conf.json`（例如 icon 路徑）：
```bash
git add src-tauri/tauri.conf.json
git commit -m "fix(5b): tauri bundle config tweaks for Windows MSI build"
```

若沒改任何檔案，跳過 commit。

---

## Task 8: 文件更新 + CHANGELOG

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `specs/tech-stack.md`
- Modify: `README.md`（加 desktop build 簡述）

- [ ] **Step 1: CHANGELOG**

在 `docs/CHANGELOG.md` 最頂端加入：
```markdown
## 2026-05-XX — Phase 5b：Tauri Windows 桌面版

- 新增 `src-tauri/` Rust 殼，沿用既有 Vite 前端
- SQLite 儲存層（`tauri-plugin-sql`）+ `TauriSqliteAdapter`：解決無痕模式 / 瀏覽器配額導致的資料消失問題
- 跨平台搬遷：使用者手動 export JSON → 桌面版 import JSON（沿用 5a `backup.ts`）
- `npm run tauri dev` 進入桌面開發；`npm run tauri build` 產出 Windows MSI 安裝包
- 瀏覽器版同一份 codebase 不受影響（仍走 DexieAdapter）

未含：
- macOS / Linux 打包（之後再加）
- Code signing（使用者首次安裝需手動允許）
- 自動 IndexedDB → SQLite 遷移（走手動 export/import）
- 桌面版的自動 snapshot 排程
```

把 `2026-05-XX` 改成實際完成日期。

- [ ] **Step 2: tech-stack.md**

找到 `specs/tech-stack.md` 內描述儲存層的段落，更新 Phase 5b 對應行：將「規劃中」改成「已上線（Windows）」。具體位置由實作者根據檔案實際內容找；若無對應段落，於檔末加：
```markdown
## Phase 5b 已落地（2026-05）

- Tauri 2.x + tauri-plugin-sql（SQLite bundled）
- Windows MSI 為主要分發；其他平台之後再加
- 桌面版 storage 走 `TauriSqliteAdapter`；瀏覽器版維持 DexieAdapter
```

- [ ] **Step 3: README 加一段 desktop 使用說明**

在 `README.md` 適當位置（通常「開發 / 執行」段落附近）加：
````markdown
### 桌面版（Windows）

需先安裝 Rust toolchain (`rustup`) + Visual Studio Build Tools (Desktop C++) + WebView2 Runtime。

```bash
# 開發
npm run tauri dev

# 打包 MSI 安裝檔
npm run tauri build
# 產物：src-tauri/target/release/bundle/msi/*.msi
```

桌面版使用 SQLite 儲存（位於 `%AppData%\com.novelgenerator.app\novel-generator.db`），不受瀏覽器無痕模式 / 配額限制。瀏覽器版資料可透過「匯出 JSON → 桌面版匯入」搬移。
````

- [ ] **Step 4: Commit**

```bash
git add docs/CHANGELOG.md specs/tech-stack.md README.md
git commit -m "docs(5b): document Tauri Windows desktop release"
```

---

## 完成後

依 superpowers 流程，所有任務完成後：

**Announce:** "I'm using the finishing-a-development-branch skill to complete this work."

執行 `superpowers:finishing-a-development-branch`，決定 push / merge 流程。

---

## Verification Summary（最終檢查清單）

- [ ] `npm run dev` 瀏覽器版正常（Dexie）
- [ ] `npm run tauri dev` 桌面版正常（SQLite）
- [ ] 桌面版冷啟動資料持久化
- [ ] export JSON → import JSON 跨平台搬遷雙向皆可
- [ ] `npm run tauri build` 產出可安裝的 `.msi`
- [ ] 安裝後從開始選單啟動正常
- [ ] `npm run build` (TS) 與 `npm run lint` 無新增 error
- [ ] CHANGELOG 已更新
