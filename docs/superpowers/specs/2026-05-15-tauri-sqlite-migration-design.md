# Tauri + SQLite 桌面化遷移設計

> 日期：2026-05-15
> 對應 Roadmap：Phase 5（5a → 5b）
> 狀態：✅ 已實作（Phase 5a 2026-05-15 / Phase 5b 2026-05-17）
> 實作偏差：見文末「as-built 備註」

---

## 1. 動機

純瀏覽器環境下，IndexedDB / OPFS / localStorage 在**無痕模式關閉後一律會被清空**，使用者已多次回報「無痕視窗建立的書本關掉就不見」。WASM SQLite (sql.js / wa-sqlite) 仍須靠 IndexedDB 或 OPFS 持久化，**無法解決此問題**。

唯二根治方向是「桌面 App」或「雲端後端」。雲端違反專案「本機優先」定位，故選擇 Tauri 桌面化。

附帶好處：為 Phase 6（漫畫+TTS+影片）所需的大量 binary 儲存與 native ffmpeg 鋪路。

## 2. 目標 / 非目標

**目標**
- 解決無痕資料消失與瀏覽器配額限制
- 重構儲存層為 Adapter 模式，UI / business logic 不關心底層
- 桌面版以 SQLite + 本機檔案為主儲存
- 保留 Web 版（雙軌部署）— 同一份 React code 在瀏覽器仍可跑
- 為 Phase 6 媒體儲存規則（metadata 進 DB / binary 進檔案）預留 schema 位置

**非目標**
- 不做雲端同步 / 多裝置同步（需要後端，獨立 phase）
- 不做帳號系統
- 不在此 phase 實作漫畫 / 影片功能本身（Phase 6）
- 不重新設計 schema — 1:1 對齊現有 Dexie tables

## 3. 架構

```
┌─────────────────────────────────────────┐
│  React UI / Zustand stores / ai-tasks   │
│  （只依賴抽象介面，平台無關）             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  StorageAdapter (interface)             │
│  - projects.* / chapters.* / ...        │
│  - 與現有 Dexie API 形狀對齊             │
└──────┬───────────────────┬──────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────────┐
│ DexieAdapter│     │ TauriSqlite     │
│ (Phase 5a)  │     │ Adapter         │
│ 包現有 db   │     │ (Phase 5b)      │
│             │     │ tauri-plugin-sql│
└─────────────┘     └─────────────────┘
       ↑                   ↑
  瀏覽器執行時用       桌面執行時用
  （`npm run dev`）   （`npm run tauri dev`）
```

**Adapter 選擇：** 在啟動時用 platform detection（`window.__TAURI__` 存在 → SQLite，否則 → Dexie）。應用其餘部分透過單一匯出 `storage` 取得當前 adapter。

## 4. 分兩階段

### Phase 5a — 純前端重構（不引入 Tauri）

**目標：** 抽出 interface、現有 Dexie code 包成第一個實作，所有呼叫端改用 interface。完成後瀏覽器版仍正常運作，**程式碼變乾淨、無新功能**。

**任務**
1. 定義 `src/lib/storage/types.ts`：`StorageAdapter` interface + 各子介面（`ProjectStore`, `ChapterStore`, `VersionStore`, `CharacterStore`, `SettingsStore`, `AppMetaStore`）
2. 實作 `src/lib/storage/dexie-adapter.ts`：把現有 `src/lib/db.ts` 的 Dexie 操作包進 interface
3. 新增 `src/lib/storage/index.ts`：提供 `getStorage()` / 預設匯出 `storage`，內部依平台決定 adapter（5a 永遠回 Dexie）
4. 把 5 個直接 import `db` 的檔案改成用 `storage`：
   - `src/stores/projectStore.ts`
   - `src/lib/fs-sync.ts`
   - `src/lib/backup.ts`
   - `src/lib/db-maintenance.ts`
   - `src/components/home/HomePage.tsx`
5. **保留**舊 `db.ts` 但僅 adapter 內部使用，外部 import 全禁
6. 驗證：`npm run dev` 跑起來，建書 / 寫章節 / 切換書本 / 備份還原全部正常

**驗收**
- ESLint rule（或單純 grep 驗證）：除 `src/lib/storage/dexie-adapter.ts` 外無人 import `./db` / `../lib/db`
- 手動 smoke test：建立新書、生成章節、AI 補欄位、章節版本切換、File System Access 連結與同步

**時程估計：** 1-2 個工作 session

### Phase 5b — Tauri shell + SQLite adapter

**前提：** 5a 完成且穩定運行至少一段時間（建議至少一週實際使用）。

**任務**
1. 引入 Tauri：`npm create tauri-app`（或在現有 Vite 專案 retrofit），設定 `tauri.conf.json`
2. 加 `tauri-plugin-sql`（含 SQLite bundling）
3. 撰寫 SQL schema migration（與 Dexie tables 1:1 對齊，**加 `media_assets` 空表佔位**，詳見 §5）
4. 實作 `src/lib/storage/tauri-sqlite-adapter.ts`：實作 `StorageAdapter` interface
5. 修改 `getStorage()`：偵測 `window.__TAURI__` → 回 TauriSqliteAdapter
6. 一次性遷移：桌面版首次啟動時，若 SQLite 為空且使用者有舊的 IndexedDB 資料，跳出對話框「偵測到瀏覽器版資料，匯入桌面版？」；按下後讀 IndexedDB → 寫 SQLite
7. File System Access 在桌面版改成 Tauri `dialog.open` + `fs` API（透過同一個 adapter 層暴露）
8. CI：GitHub Actions 三平台打包（Windows `.msi` / macOS `.dmg` / Linux `.AppImage`）
9. 驗證：桌面版完整跑一輪建書 → 寫小說 → 關掉重開 → 資料還在；瀏覽器版仍能正常運作

**驗收**
- 桌面版 cold start → 看到舊書（從 IndexedDB 遷移過來）
- 桌面版關掉重開資料還在
- 瀏覽器版（同一份 codebase）`npm run dev` 仍能用 Dexie 跑
- 三平台打包產物可執行

**時程估計：** 3-5 個工作 session（含 Tauri / Rust 環境設定學習成本）

## 5. SQLite Schema（Phase 5b）

**原則：** 與 `src/lib/db.ts` 的 Dexie tables 1:1 對齊，只加 `media_assets` 佔位。

```sql
-- 對齊 Dexie v4 schema
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  -- 其餘欄位以 JSON 字串存於 data 欄，避免 schema 細節分裂
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_updated ON projects(updated_at);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ord INTEGER NOT NULL,           -- 對應 Dexie 的 `order`
  data TEXT NOT NULL              -- 章節主體（title/beat/points/content/wikiSyncedAt 等）
);
CREATE INDEX idx_chapters_project ON chapters(project_id, ord);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'full' | 'inline'
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

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);

-- Phase 6 佔位（不含資料、只建表）
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,                 -- nullable（封面類非屬章節）
  kind TEXT NOT NULL,              -- 'image' | 'audio' | 'video'
  file_path TEXT NOT NULL,         -- 相對於 project media 資料夾
  data TEXT NOT NULL,              -- metadata: prompt / panel_index / duration 等
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_media_chapter ON media_assets(chapter_id);
CREATE INDEX idx_media_project ON media_assets(project_id);
```

**設計取捨**
- **`data TEXT (JSON)` 而非欄位拆開**：保留現有 Dexie 模型彈性，schema 變更不需要 ALTER TABLE。代價是無法用 SQL 直接 query 內欄位 — 但目前所有 query 都走 id / project_id / order，未實際需要。
- **欄名 `ord` 而非 `order`**：`order` 是 SQL 關鍵字。adapter 層做 `order ↔ ord` 對應。
- **未加 FTS5 / 全文搜尋**：YAGNI，搜尋功能不在此 phase。
- **不存 binary**：圖片/音檔/影片在 Phase 6 走檔案系統。

**未來相容性（Phase 7 Web 回部署）：** 這份 schema 在 wa-sqlite 也能執行（皆為標準 SQLite 子集，無 native-only feature）。

## 6. StorageAdapter Interface 形狀

對齊現有 Dexie API 與 store 用法。以 `ChapterStore` 為例：

```ts
export interface ChapterStore {
  list(projectId: string): Promise<Chapter[]>;        // by order ASC
  get(id: string): Promise<Chapter | undefined>;
  put(chapter: Chapter): Promise<void>;               // upsert
  delete(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;              // 批次更新 order
}

export interface StorageAdapter {
  projects: ProjectStore;
  chapters: ChapterStore;
  versions: VersionStore;
  characters: CharacterStore;
  settings: SettingsStore;
  appMeta: AppMetaStore;

  /** 給 backup / 遷移用 */
  exportAll(): Promise<BackupSnapshot>;
  importAll(s: BackupSnapshot, mode: 'replace' | 'merge'): Promise<void>;
}
```

各子 interface 的方法逐個與 `src/stores/projectStore.ts` 既有呼叫對應，不增不減。

## 7. 風險與緩解

| 風險 | 緩解 |
|------|------|
| Tauri 環境設定踩坑（Rust toolchain、Windows MSVC、code signing） | 5b 第一個 task 就是「能跑 `npm run tauri dev` 看到空畫面」，先把環境問題解決才往下走 |
| IndexedDB → SQLite 遷移資料遺失 | 遷移前先 export 一份 JSON snapshot 到使用者 Documents；過程失敗可還原 |
| `tauri-plugin-sql` 與 wa-sqlite transaction API 差異 | adapter 層內薄 wrapper 統一；目前用法都是簡單 CRUD，無複雜 transaction |
| 5a 完成但 5b 遲遲不做 → Adapter 抽象變成沒人用的負擔 | 5a 本身就有獨立價值（codebase 變乾淨、未來測試好寫）；即使 5b 永遠不做也不虧 |
| Tauri 打包檔案太大 | Tauri 本身產物約 5-10 MB，遠小於 Electron（100+ MB），可接受 |
| Code signing（macOS / Windows）成本 | 第一版可先不簽（使用者需手動允許）；商業化前再處理 |

## 8. 已決議事項

### 8.1 LLM 呼叫：前端 fetch（決議：維持現狀）

桌面版 LLM 呼叫**繼續走前端 `src/lib/llm.ts`**，不引入 Rust 後端代理。

理由：
- API key 已在使用者自己機器上（IndexedDB / SQLite 都同台），後端代理無真實安全增益
- 維持瀏覽器版與桌面版邏輯完全一致 — adapter 只負責儲存
- SSE streaming 在前端 fetch 直接運作，搬到 Rust 需重做 IPC streaming pipeline
- Phase 7 回 Web 時不需拆改

### 8.2 File System Access：桌面版砍自動同步、保留手動匯出入

| 行為 | 瀏覽器版 | 桌面版 |
|------|----------|--------|
| 自動寫 JSON snapshot 到連結資料夾 | ✅ 保留 | ❌ 移除 |
| 手動「匯出至資料夾」JSON snapshot | ✅ 保留 | ✅ 保留（改 Tauri `dialog.save`） |
| 手動「從資料夾匯入」JSON snapshot | ✅ 保留 | ✅ 保留（跨機器搬遷） |
| 關閉前 / 每日自動匯出 snapshot | （可選） | ✅ 新加（取代自動同步） |

理由：
- 桌面版資料本身就是本機檔案，使用者可自行把 app data 資料夾放雲端同步
- **不能自動同步 live `.db`**：SQLite 連線開著時被雲端工具同步會產生不完整檔案或寫入衝突
- 改為「明確的 snapshot 匯出」可放心進雲端同步資料夾

實作影響：`auto-sync.ts` 的 daemon 在桌面 adapter 下不啟動，改成「on shutdown / scheduled」呼叫 `storage.exportAll()` 寫到使用者指定 snapshot 路徑。

## 9. 驗收里程碑

- ✅ **M1（5a 完成）：** 所有非 adapter 檔案都不再 import `./db`；瀏覽器版 smoke test 全綠
- ✅ **M2（5b α）：** `npm run tauri dev` 跑得起來，桌面版能建一本空書並重啟後資料還在
- ✅ **M3（5b β）：** 瀏覽器版資料可匯出 JSON → 桌面版匯入（bit-perfect 驗證通過）；反向亦然
- ⚠️ **M4（5b RC）：** Windows MSI ✅；macOS / Linux 打包待補；瀏覽器版仍可跑 ✅

---

## 10. As-Built 備註（與設計草案的偏差）

> 記錄實作時踩到的雷與設計偏差，供未來維護參考。

### 10.1 StorageAdapter interface 微幅調整

草案的 ChapterStore 用 `put()` (upsert)、`list(projectId)`，實作時改用：
- `add()` / `update()` 分開（配合 Dexie 既有習慣，projectStore.ts 原始呼叫模式）
- `listByProject(id, opts?)` 帶 `sorted` 選項
- `listByChapterDesc(id)` 處理版本降序

### 10.2 tauri-plugin-sql 沒有 transaction API

設計草案提到「adapter 層薄 wrapper 統一 transaction API 差異」。實際上 `tauri-plugin-sql` v2.x 每個 `execute()` 用獨立 pool 連線，**無法用 `BEGIN/COMMIT` 包多個 execute**。

因此 `replaceAll` 為非 atomic — 中途失敗可能留部分 commit。對「使用者已明確確認覆蓋」的 import 場景可接受，重 import 即可恢復。

### 10.3 WAL 效能調校（Windows Defender）

SQLite 預設 `synchronous=FULL` + Windows Defender 掃描 `%AppData%` 寫入，導致每個 `execute()` 耗 ~5 秒。getDb() 初始化時設：
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```
per-op 時間降到 <50ms。

### 10.4 LLM fetch 路由

草案決議「LLM 繼續走前端 fetch」，但實作後發現 `fetch('/llm-proxy')` 是 vite middleware 的相對路徑，在安裝版 MSI 無 vite → 收到 SPA index.html → JSON 解析爆掉。

修法：`postToLLM()` helper 在 `isTauri()` 時直接 fetch 絕對 targetUrl（CSP 設 null，webview 可跨域）；瀏覽器保持走 proxy。

### 10.5 MSI productName 須 ASCII

WiX light.exe 預設 codepage 1252（西歐），「小說產生器」無法編碼 → LGHT0311 錯誤。
改 `productName: "Novel Generator"`，視窗 title 仍保中文。

### 10.6 IndexedDB → SQLite 自動遷移未實作

設計草案 M3 寫「首次啟動偵測舊 IndexedDB 資料並匯入」。實際採**手動 JSON 搬遷**（使用者自行 export → import），因為：
- 桌面版 webview 無法 import IndexedDB 模組（Tauri webview ≠ Node.js）
- 手動路徑用戶已熟悉，且可自選遷移時機
- 自動遷移風險大（萬一失敗資料兩邊都不完整）
