# LLM Wiki 知識層設計

> **狀態：** 設計草案（brainstorming 產出）  
> **Phase：** 2（roadmap.md「Phase 2 — 記憶與一致性」第 1 項）  
> **前置：** Phase 5 ✅（StorageAdapter / SQLite）  
> **參考設計：** `skills/llm-wiki/`（Karpathy 風格 LLM-owned wiki，套用其 prompts + page-type taxonomy，存儲改 SQLite）  
> **不在範圍：** Vector RAG（已建議改為 SQLite FTS5，獨立 spec）、角色關係圖視覺化（獨立 spec）、Lint（Phase 2.5）、Pick-pages 兩段式查詢（Phase 2.5）

---

## 1. 目標與動機

長篇章節生成的最大痛點是「**一致性漂移**」：第 8 章的角色設定與第 3 章不符、世界觀規則前後矛盾、伏筆消失。原因是 LLM 沒有「跨章節的長期記憶」，每章生成時看到的 context 是有限的。

LLM Wiki 是這個問題的「**LLM 自管知識層**」：用戶寫完一章 → 按「📚 存入 Wiki」→ AI 萃取本章關鍵資訊、寫進結構化的 wiki 頁；下一章生成時，Context Budget 載入相關 Wiki 條目作為背景，LLM 在「知道既有設定」的前提下續寫。

### 為什麼不直接用 RAG 拆原始章節做向量檢索

`skills/llm-wiki/reference/architecture.md` 開宗明義：「Direct RAG over raw chunks gives fragmented, source-shaped answers. The wiki layer **rewrites** that knowledge into concept-shaped pages.」我們認同這個論述 — Wiki 把按章節組織的資訊**重新組織成按概念組織**，這正是「一致性」需要的形狀。

### 為什麼套用 llm-wiki 而不從零設計

`skills/llm-wiki/` 已有完整的 prompt 範本、page-type taxonomy、ingest/query/lint 操作 — 是經過 Karpathy 公開驗證的設計。我們只需把「filesystem 為基底」換成「SQLite 為基底」，其餘可大量複用。

---

## 2. 設計決策總覽（brainstorming 對齊）

| # | 議題 | 決策 |
|---|---|---|
| D1 | Ingest 觸發 | 純手動「📚 存入 Wiki」按鈕 |
| D2 | Ingest 來源範圍 | 本章正文 + 本書當前 wiki index（含 aliases）+ characters 名稱清單 |
| D3 | 與 characters 表的關係 | 並存：characters 為 structured 主表、Wiki entity 為 prose 補充；ingest 不自動寫 characters，只提示 |
| D4 | Query 策略 | 小 Wiki 全載；中/大 Wiki 走 cheap relevance filter + 優先級排序 + 黃/紅警報截斷；pick-pages 留待 Phase 2.5 |
| D5 | UI 位置 | 左側主分頁「📚 Wiki」（specs/UI-layout.md 既已預留） |
| D6 | 人為關卡 | 自動 apply + 結果 toast + 一鍵還原（wiki_log 存 before/after） |
| D7 | Lint | 不做（Phase 2.5） |
| D8 | Pick-pages | 不做（Phase 2.5；連續 3 次黃線警告後啟用） |
| D9 | bookId 隔離 | 每本書獨立 Wiki，`UNIQUE (bookId, type, slug)` |

---

## 3. 資料模型

### 3.1 新表

```sql
CREATE TABLE wiki_pages (
  id              TEXT PRIMARY KEY,                -- uuid
  bookId          TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN
                    ('concept','entity','summary','compare','synthesis')),
  slug            TEXT NOT NULL,                   -- ASCII kebab-case
  title           TEXT NOT NULL,                   -- 顯示用，可中文
  aliases         TEXT NOT NULL DEFAULT '[]',      -- JSON string[]
  related_slugs   TEXT NOT NULL DEFAULT '[]',      -- JSON [{type, slug}]
  description     TEXT NOT NULL DEFAULT '',        -- 1-line 給 index 用
  content_md      TEXT NOT NULL,                   -- full page markdown
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (bookId, type, slug)
);
CREATE INDEX idx_wiki_pages_book ON wiki_pages (bookId);

CREATE TABLE wiki_log (
  id                   TEXT PRIMARY KEY,           -- uuid
  bookId               TEXT NOT NULL,
  batch_id             TEXT NOT NULL,              -- uuid，同一次 ingest 共用；undo / 重試剩餘以此為錨
  applied_at           TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN
                         ('create','update','delete','undo')),
  op_status            TEXT NOT NULL CHECK (op_status IN
                         ('ok','failed','undone')) DEFAULT 'ok',
  page_id              TEXT,                       -- nullable 若頁已被刪
  page_type            TEXT NOT NULL,
  page_slug            TEXT NOT NULL,
  page_snapshot_before TEXT,                       -- JSON 完整 page 物件；null on create
  page_snapshot_after  TEXT,                       -- JSON 完整 page 物件
                                                    -- null when: kind='delete', 或 Apply LLM 失敗 (沒拿到新內容)
                                                    -- 保留 when: page 寫入失敗 (after 已構造好，留著供重試)
  source               TEXT NOT NULL,              -- 'ingest:<chapterId>' | 'manual' | 'undo:<batchId>'
  summary              TEXT NOT NULL,              -- 1-line 人類可讀
  error_message        TEXT                        -- 只在 op_status='failed' 時填
);
CREATE INDEX idx_wiki_log_book ON wiki_log (bookId, applied_at);
CREATE INDEX idx_wiki_log_batch ON wiki_log (batch_id);
```

### 3.2 既有表新增欄位

```sql
ALTER TABLE chapters ADD COLUMN wikiSyncedAt    TEXT;  -- ISO8601 或 NULL
ALTER TABLE chapters ADD COLUMN wikiSyncedHash  TEXT;  -- ingest 時 chapter content 的 sha1，nullable
ALTER TABLE chapters ADD COLUMN wikiSyncStatus  TEXT
  CHECK (wikiSyncStatus IN ('unsynced','synced','stale','partial','partial_stale')) DEFAULT 'unsynced';
```

`wikiSyncStatus` 五種狀態（明示語意，不靠 hash 推導）：

| 狀態 | 意義 | UI 徽章 |
|---|---|---|
| `unsynced` | 從未 ingest 過 | 橘色 `⚠️ 未存 Wiki` |
| `synced` | 最近一次 ingest 全部成功且章節內容未變 | 灰色「✓ 已存入」+ tooltip 顯示時間 |
| `stale` | 之前同步成功，但章節內容後續修改了（`sha1(content) ≠ wikiSyncedHash`） | 橘色 `⚠️ Wiki 已過時` |
| `partial` | 最近一次 ingest 有 op_status='failed'；wiki 處於部分套用狀態 | 紅色 `⚠️ Wiki 部分失敗` + tooltip 顯示失敗數 |
| `partial_stale` | 同上但章節內容後續又被修改；失敗未處理且現在又過時了 | 紅色 `⚠️ 部分失敗 + 已過時` + tooltip 同時顯示失敗數與過時 |

**狀態轉換規則**（寫入時機）：

```
ingest 開始       → status 不變（保留歷史，避免 in-flight 狀態抖動）
ingest 結束時：
  全部 ok       → status='synced',  wikiSyncedAt=now, wikiSyncedHash=sha1(content)
  有 failed     → status='partial', wikiSyncedAt=now, wikiSyncedHash=sha1(content)
  Plan/校驗失敗 → status 不變（沒寫入任何 wiki_pages，章節狀態不該變）

undo（§4.6）   → status='unsynced', wikiSyncedAt=NULL, wikiSyncedHash=NULL

章節內容變更（任何 chapter.content 寫入時 hook）：
  if sha1(new_content) ≠ wikiSyncedHash:
    synced  → stale
    partial → partial_stale       （不可蓋掉失敗狀態）
    其他狀態（unsynced/stale/partial_stale）不變

「重試剩餘」（§4.5）全部成功 → status='synced'
「重試剩餘」仍有 failed       → status='partial'（時間戳更新）
```

> 改用 explicit status 欄位的理由：codex review 指出，原本「即使 failed 也寫 wikiSyncedAt」會讓「已同步」失準。partial 是真實的中間態，UI 必須能讓使用者一眼看見「這章 wiki 沒乾淨完成」。hash 仍保留，用來偵測 stale（章節內容後續被改）。

### 3.3 StorageAdapter 介面擴充

```ts
// src/lib/storage/types.ts
export type WikiPageType = 'concept' | 'entity' | 'summary' | 'compare' | 'synthesis';

export interface WikiPage {
  id: string;
  bookId: string;
  type: WikiPageType;
  slug: string;
  title: string;
  aliases: string[];           // 反序列化後
  relatedSlugs: { type: WikiPageType; slug: string }[];
  description: string;
  contentMd: string;
  createdAt: string;
  updatedAt: string;
}

/** 還原所需的完整頁面快照 — 等同 WikiPage 全欄位（含 id、bookId、type、slug、時間戳） */
export type WikiPageSnapshot = WikiPage;

export interface WikiLogEntry {
  id: string;
  bookId: string;
  batchId: string;                            // 同一次 ingest 共用；undo / 重試剩餘以此為錨
  appliedAt: string;
  kind: 'create' | 'update' | 'delete' | 'undo';
  opStatus: 'ok' | 'failed' | 'undone';
  pageId: string | null;
  pageType: WikiPageType;
  pageSlug: string;
  pageSnapshotBefore: WikiPageSnapshot | null;
  pageSnapshotAfter: WikiPageSnapshot | null;
  source: string;
  summary: string;
  errorMessage?: string;
}

export interface WikiOps {
  list(bookId: string): Promise<WikiPage[]>;
  get(id: string): Promise<WikiPage | undefined>;
  findBySlug(bookId: string, type: WikiPageType, slug: string): Promise<WikiPage | undefined>;
  add(page: WikiPage): Promise<void>;
  update(page: WikiPage): Promise<void>;
  delete(id: string): Promise<void>;
  totalLength(bookId: string): Promise<number>;   // sum(length(content_md))
}

export interface WikiLogOps {
  list(bookId: string, limit?: number): Promise<WikiLogEntry[]>;
  listByBatch(bookId: string, batchId: string): Promise<WikiLogEntry[]>;
  add(entry: WikiLogEntry): Promise<void>;
  updateStatus(id: string, opStatus: WikiLogEntry['opStatus'], errorMessage?: string): Promise<void>;
}

export interface StorageAdapter {
  // ...既有 ops...
  wikiPages: WikiOps;
  wikiLog: WikiLogOps;
}
```

### 3.4 Bundle（匯出 / 匯入）

`StorageBundle` 新增兩個欄位（向後相容：舊 backup 無此欄位 → 視為空陣列）：

```ts
export interface StorageBundle {
  // ...既有欄位...
  wikiPages?: WikiPage[];
  wikiLog?: WikiLogEntry[];
}
```

`replaceAll()` 在兩個 adapter 都需擴充：delete wiki 兩表後依序 insert。**順序固定為 pages → log**（即使目前無 FK；保留 UI 解析便利性與未來加 FK 的空間）。

### 3.5 Cascade Delete

刪除書時級聯刪除 wiki_pages + wiki_log（與既有 chapters/versions/characters 同等處理）。

---

## 4. Ingest Pipeline

### 4.1 流程

```
按「📚 存入 Wiki」 → 為本次 ingest 生成新的 batchId（uuid）
   │
   ▼
[1] Pre-flight（純應用層，無 LLM）
   - 撈本章 content
   - SELECT index (type, slug, title, description, aliases) FROM wiki_pages
   - SELECT names + aliases FROM characters
   - 計算 chapterContentHash = sha1(chapter.content)
   │
   ▼
[2] PLAN（1 LLM call）
   prompt: wikiIngestPlanTemplate
   input:  本章正文 + wiki index + characters names
   output: Plan JSON（嚴格 JSON，無註解）
   │
   ▼
[3] Plan 校驗（純應用層）
   - 所有 slug 為 ASCII kebab-case
   - create 的 (type, slug) 不可衝突 → 衝突則自動降級為 update
   - update 指定的 (type, slug) 必須存在 → 否則自動降級為 create
   - 任何不可自動修復的問題 → throw
   │
   ▼
[4] APPLY（每 op 1 LLM call，串行）
   create → wikiIngestCreateTemplate
   update → wikiIngestUpdateTemplate
   │
   ▼
[5] 寫 DB（每 op 為一個「補償單元」）
   針對每個 op：
     a. 構造 newSnapshot（從 LLM 輸出 markdown 解析得到）
     b. 構造 beforeSnapshot（update 取既有 page；create 為 null）
     c. INSERT INTO wiki_log (batch_id, kind, op_status='ok',
                              page_snapshot_before, page_snapshot_after,
                              source='ingest:<chapterId>', ...)
     d. INSERT/UPDATE wiki_pages（用 newSnapshot 的全欄位）
     e. 若 (d) 失敗：updateStatus(log.id, 'failed', errorMessage)
                    （log 已記錄完整 before/after，可以重試或還原）

   全部完成後依結果寫入 chapter 同步狀態（見 §3.2 狀態轉換表）：
     全部 ok：   status='synced',  wikiSyncedAt=now, wikiSyncedHash=chapterContentHash
     有 failed： status='partial', wikiSyncedAt=now, wikiSyncedHash=chapterContentHash
   │
   ▼
[6] UI 反饋
   - Toast：「Wiki 已更新：新增 N 頁、修改 M 頁 [查看變更] [↩ 還原]」
     （若有 failed ops，toast 變橘：「N 個操作失敗 [重試剩餘] [還原]」）
   - 若 Plan 含 unrecorded_characters → 附加「N 個新登場角色未在角色庫 [檢視]」
```

> **無 transaction 的補償模式**：tauri-plugin-sql 沒有跨 execute 的 transaction（Phase 5b 已驗證）。我們以「log 先寫、page 後寫、用 op_status 記實際結果」的模式取代 atomicity。Log 永遠是 source of truth — 若 page 寫入失敗，下次可從 log 重放或還原；UI 從 log 計算「實際狀態」而非從 page 推測。

### 4.2 Plan JSON 格式

嚴格 JSON（無註解，無尾逗號）。範例：

```json
{
  "operations": [
    {
      "action": "create",
      "type": "entity",
      "slug": "li-ming",
      "title": "李明",
      "aliases": ["小李"],
      "description": "主角的徒弟，16 歲劍術天才，於第 5 章登場",
      "reason": "本章首次登場的主角徒弟",
      "content_brief": "16 歲少年，劍術天才，主角在第 5 章收為徒弟..."
    },
    {
      "action": "update",
      "type": "entity",
      "slug": "protagonist",
      "reason": "本章揭露主角真實名字為陳遠",
      "change_brief": "在 aliases 加入「陳遠」；在背景段補一句『真名於第 5 章揭曉』"
    }
  ],
  "log_entry": "ingest chapter=5 pages_created=1 pages_updated=1",
  "unrecorded_characters": [
    { "name": "王芳", "sourceExcerpt": "...走進來一位身著青衫的女子，王芳..." },
    { "name": "張三", "sourceExcerpt": "...只見張三一拳打在桌上..." }
  ]
}
```

欄位說明：

- `operations[].description`（create only，可選）：LLM 直接產出的 1-line index description；若缺漏，應用層 fallback 取 apply 輸出 markdown 第一段前 60 字
- `unrecorded_characters[]`：物件陣列。每個含 `name` + `sourceExcerpt`（原文片段，方便用戶判斷是否真要建為角色，避免誤建）
- `log_entry`：1-line 人類可讀摘要，寫入每條 wiki_log 的 `summary` 欄位（同 batch 內各 op 寫同一字串）

### 4.3 Apply 輸出格式

create / update 都輸出**完整 markdown 頁**，遵循 `skills/llm-wiki/reference/conventions.md` 的 page structure：

```markdown
# 李明

> **Type:** entity
> **Aliases:** 小李
> **Related:** [主角](../entity/protagonist.md)

## 概述

...

## 出處

- 第 5 章「拜師」
```

應用層解析該 markdown：
- 第一個 `## <section>` 之前的 `> ` blockquote 是 metadata → 同步寫入 aliases、related_slugs 欄位
- 第一行 `# <Title>` 寫入 title
- 全文寫入 content_md
- description 欄位：**優先採用** Plan JSON 中 `operations[].description`；若缺漏，fallback 取第一段 prose 的前 60 字（純文字，截 ellipsis）

### 4.4 校驗規則細節

| 規則 | 觸發 | 處理 |
|---|---|---|
| slug 非 ASCII kebab-case | LLM 出怪格式 | 自動正規化（lower + 非字母數字換 `-`）；若仍為空則 throw |
| create 的 (type, slug) 已存在 | LLM 沒讀 index | 自動降級為 update，change_brief = 「合併新資訊」+ content_brief |
| update 的 (type, slug) 不存在 | LLM 給錯 path | 自動降級為 create，content_brief = change_brief |
| 同一次 Plan 內重複 (type, slug) | LLM 自相矛盾 | 後者覆蓋前者，記錄 warning |
| Plan JSON 解析失敗 | LLM 回非 JSON | 重試 1 次；仍失敗 → throw，UI 紅 toast |

### 4.5 錯誤與恢復

| 階段 | 錯誤 | 處理 |
|---|---|---|
| Plan | LLM 連線失敗 | toast「網路錯誤，請重試」（整批未開始，無 log） |
| Plan | JSON 解析失敗 | 自動重試 1 次；仍失敗 → toast |
| 校驗 | 不可修復 | toast 紅色，顯示具體原因（無 log） |
| Apply | 某 op LLM 失敗 | 仍 INSERT wiki_log 該 op (op_status='failed', error_message=...)；不寫 wiki_pages；繼續下一 op |
| 寫 DB | wiki_log INSERT 失敗 | 該 op 完全跳過（記錄到記憶體錯誤列表）；繼續下一 op |
| 寫 DB | wiki_pages 寫失敗 | wiki_log 已寫；用 updateStatus(log.id, 'failed') 標記；繼續下一 op |
| 全部結束 | batch 有任何 failed | toast 橘色「N 個操作失敗 [重試剩餘] [還原]」；wikiSyncedAt 仍寫入（部分成功也算這次處理過了） |

「重試剩餘」= SELECT log WHERE batch_id=? AND op_status='failed' → 重跑 apply（同 brief，但既有 page 取目前 state 作 before）。

### 4.6 還原（Undo）

定義「最近一次 ingest」= 該章節最後一個 `batch_id`（從 `SELECT batch_id FROM wiki_log WHERE source='ingest:<chapterId>' ORDER BY applied_at DESC LIMIT 1`）。

還原 batch 操作（只處理 `op_status='ok'`；`failed` entries 留為歷史紀錄，**undo 不反向也不刪除**它們，若要重放走「重試剩餘」）：
1. SELECT * FROM wiki_log WHERE batch_id = ? AND op_status='ok' ORDER BY applied_at DESC
2. 逐條反向（用 pageSnapshotBefore / pageSnapshotAfter 而非單純 content）：
   - kind='create' → DELETE wiki_pages WHERE id = page_id
   - kind='update' → 用 pageSnapshotBefore 全欄位覆寫 wiki_pages（title/aliases/related_slugs/description/contentMd 都一起還原）
   - kind='delete' → 用 pageSnapshotBefore INSERT 回 wiki_pages
3. 將原 entries 的 op_status 更新為 'undone'
4. 為整個還原動作新增**一條** kind='undo' 紀錄（source='undo:<batchId>'，summary 描述「還原 N 個操作」）
5. UPDATE chapters SET wikiSyncStatus='unsynced', wikiSyncedAt=NULL, wikiSyncedHash=NULL WHERE id = currentChapterId

「批次存入」場景下每章自己一個 batchId；undo 是針對單一 batch，不會誤傷其他章節的 ingest。

### 4.7 Prompt 移植規則（從 filesystem 版改寫到 type+slug 版）

`skills/llm-wiki/prompts/` 的原版 prompt 以 filesystem path（`entity/transformer.md`）作為頁面標識。我們的 SQLite 版改用 `{ type, slug }` 二元組。改寫規則：

| 原 prompt 欄位 | 改寫後 | 備註 |
|---|---|---|
| `path: "entity/transformer.md"` | `type: "entity", slug: "transformer"` | Plan 的 update op 都這樣改 |
| Pass 1 input：「current index.md」 | Pass 1 input：「current index (JSON array of {type, slug, title, description, aliases})」 | 由應用層 SQL 即時組裝 |
| Pass 2 input：「previous file content of <path>」 | Pass 2 input：「previous page snapshot (JSON of WikiPage)」 | 應用層用 page_id 從 wiki_pages 撈 |
| Apply 輸出開頭 `> **Related:** [X](../entity/x.md)` | 同樣輸出 markdown link 形式（display 用） | DB 另存 `related_slugs[]` JSON，由應用層解析 markdown 後同步寫入；display markdown 中的 link 不檢查破連結（lint 是 Phase 2.5） |
| log.md 操作 | INSERT INTO wiki_log | 對應規則：filesystem 那邊「append a line」我們改成 SQL INSERT |
| 「regenerate index.md after apply」 | 不需要 | SQL 即時查 index，無快取需重整 |

**容錯**：若 LLM 不慎輸出 filesystem path 形式（例如 `path: "entity/transformer.md"`），應用層 normalize：split('/') → 第一段為 type、第二段去 `.md` 為 slug；非法則走 §4.4 校驗失敗。

---

## 5. Query 整合到 Context Budget

### 5.1 BudgetInputs 擴充

```ts
// src/lib/context-budget.ts
export interface BudgetInputs {
  // ...既有欄位...
  wikiSection?: string;   // 已組好的字串；空字串表示無 Wiki 內容
}
```

### 5.2 新模組 `src/lib/wiki-loader.ts`

```ts
export type WikiLoadStatus = 'ok' | 'warn-truncated' | 'red-truncated';

export interface WikiLoaderInput {
  bookId: string;
  contextWindowTokens: number;
  budgetRatio?: number;             // 來自偏好設定，預設 0.25
  // 用於 cheap relevance filter（不傳則跳過 filter，全套用優先級）
  chapterContext?: {
    title?: string;
    points?: string;
    beat?: string;
    referenceChapterContent?: string;
    characterNames?: string[];       // 出場角色（caller 從 characters 表或 chapter metadata 取）
    characterAliases?: string[];     // 角色的全部 alias 已 flatten
  };
}

export interface WikiLoadResult {
  text: string;                      // 已格式化好的 markdown 區塊（可空字串）
  loadedPages: number;
  totalPages: number;
  truncatedPages: number;
  status: WikiLoadStatus;
  relevanceHits: number;             // cheap filter 命中數，0 表示沒篩到（fallback 走優先級）
}

export async function loadWikiForGeneration(input: WikiLoaderInput): Promise<WikiLoadResult>;
```

### 5.2.5 Token 估算抽象 `src/lib/tokens.ts`

```ts
/** 字 → token 的保守估算。中文偏少（1 漢字 ≈ 1.2 token 起跳），混雜英文時偏多。 */
export function estimateTokens(text: string): number;
/** 反向用：給 token 預算回推可容納的字數上限。 */
export function tokensToChars(tokens: number): number;
/** 給 wiki-loader 用：每 token 平均字數（中文偏向 1/1.5 ≈ 0.67）。 */
export function estimateCharsPerToken(): number;
```

Phase 2 採用**保守值 `1.5 char/token`**（也就是 1 token ≈ 1.5 字）。先前 spec 的 `4 char/token` 過度樂觀，會讓 prompt 真的超 budget。  
未來（Phase 2.5+）可換成 `tiktoken-wasm` 或 provider-specific tokenizer，呼叫端不必改。

### 5.3 演算法（三段式：cheap filter → 優先級排序 → 預算截斷）

#### Step 1: Cheap relevance filter（Phase 2 簡單版，純字串、零依賴）

**Needle 集合構造規則**（明確定義，避免實作分歧）：

```
needles: Set<string> = {
  // (1) 來自 characters 表：每位角色的 name 與全部 aliases
  ...chapterContext.characterNames,
  ...chapterContext.characterAliases,    // caller 預先 flatten

  // (2) 章節標題：整串 + 標題切詞（中文以「連續 2-4 字」滑動窗，英文以空白切詞）
  chapterContext.title,
  ...sliding2to4(chapterContext.title),

  // (3) 章節要點：同樣的 2-4 字滑動窗
  ...sliding2to4(chapterContext.points ?? ''),

  // (4) 故事節拍：去掉括號注解，整串放入
  chapterContext.beat?.replace(/\(.+?\)/g, '').trim(),

  // (5) 參考章節：取尾段 1500 字，再做 2-4 字滑動窗，最多 top 50 個出現頻次最高的
  //     片段。不做詞性分析，純粹字頻
  ...topNByFrequency(sliding2to4(tail(chapterContext.referenceChapterContent ?? '', 1500)), 50),
}
// 去重、過濾長度 <2 與全標點、lowercase（英文）
```

> 不做中文分詞，只用 2-4 字滑動窗 + 字頻 — 沒有 jieba/zhconv 等依賴，純 JS 一個 reduce 即可。誤判率高但成本零；命中只是「加分」不是「排除」，所以誤判不會把對的頁排除掉。

**對每頁計算 `relevanceScore`**：

```
score(page) =
    (page.slug 命中 needles)         ? 10 : 0
  + (page.title 命中 needles)        ?  8 : 0
  + (page.aliases ∩ needles 數量)    ×  6     // 多別名命中累加
  + (page.contentMd 含 needle 個數，cap 5) × 1
```

`relevantPages = pages.filter(p => score(p) > 0)`

#### Step 2: 結合優先級

```
priority = relevanceScore * 100             // 命中相關性占絕對主導
         + TYPE_WEIGHT[type] * 10
         + recency_score

TYPE_WEIGHT = { entity: 5, concept: 4, synthesis: 3, summary: 2, compare: 1 }
recency_score = 1 / (days_since_updated + 1)
```

降序排序。

#### Step 3: 預算截斷

```
budgetChars = contextWindowTokens * budgetRatio * estimateCharsPerToken()
totalChars  = SUM(length(content_md)) over all pages

if totalChars <= budgetChars:
  載入所有頁（不論 relevanceScore），status = 'ok', relevanceHits = relevantPages.length
elif totalChars <= budgetChars * 1.5:
  按 priority 由高到低塞，直到下一頁會超出 budgetChars 為止；status = 'warn-truncated'
else:
  同樣按 priority 由高到低塞；status = 'red-truncated'

若 relevantPages.length === 0（cheap filter 完全未命中，例如本章是純風景描寫）：
  fallback：用「TYPE_WEIGHT * 10 + recency_score」作為排序鍵（無 relevance 加成）
```

> **設計意圖**：小 wiki 直接全載（cheap filter 計算還是會跑，但結果只影響統計）；中/大 wiki 透過 cheap filter 讓「真正相關的角色/概念頁」優先進場，避免被 type weight + recency 隨機踢掉。Filter 只用字串包含，無 LLM 呼叫、零額外成本。

### 5.4 輸出格式（注入 prompt 的 `{{wikiSection}}`）

```
### 相關 Wiki 條目
（以下為本書知識庫，撰寫時請保持一致）

#### 角色：李明（別名：小李）
[entity/li-ming.md 的 content_md 全文]

#### 概念：火屬性魔法
[concept/fire-magic.md 的 content_md 全文]

...
```

若 status 不為 'ok'，末尾追加：
```
> ⚠️ 本書 Wiki 規模超出載入預算，已截斷 N 頁。若一致性出問題，請至偏好設定啟用 pick-pages 模式。
```

### 5.5 預設 prompt 模板修改

`src/lib/prompt-defaults.ts` 的 `DEFAULT_CHAPTER_CONTENT_TEMPLATE` 新增 `{{wikiSection}}`：

```
## 背景資訊

### 世界觀
{{worldSetting}}{{mainPlotSection}}{{charactersSection}}{{wikiSection}}

## 本章要求
...
```

`buildGenerationPrompt()` 在組裝時，若 `wikiSection` 為空字串則不注入該區塊（既有 conditional pattern）。

### 5.6 警告累計

`appMeta.wikiOverflowCount`（每本書一個 counter）：
- status = 'warn-truncated' 或 'red-truncated' → ++
- status = 'ok' → 不變
- 連續 3 次 ≥ warn 觸發「強烈建議升級 pick-pages」CTA

---

## 6. UI 設計

### 6.1 左側 Wiki 分頁主畫面

`specs/UI-layout.md` 已預留「分頁四：Wiki」。實作其內容：

```
┌─────────────────────────────────────────────────┐
│ 📚 Wiki                            [+ 新增頁面] │
│ 全書 18 頁 / 約 12k tokens (預算 25%)           │
├──────────┬──────────────────────────────────────┤
│ 概念 (5)  │ # 火屬性魔法                        │
│ 實體 (8)  │ 概念 · aliases: 烈焰、火系          │
│ 摘要 (3)  │ ─────                               │
│ 對比 (1)  │ <content_md preview>                │
│ 綜述 (1)  │                                     │
│ [搜尋___]│ [✏️ 編輯]  [🗑 刪除]  [↩ 還原至 v2] │
├──────────┴──────────────────────────────────────┤
│ 操作記錄（最近 10 條）                           │
│ 2026-05-17 14:23 ingest ch5 +entity 李明        │
│ 2026-05-17 14:23 ingest ch5 ~entity 主角        │
└─────────────────────────────────────────────────┘
```

- 左欄：type 分組樹（折疊）+ 頁面清單；頂部 search box（filter by title/aliases/slug）
- 右欄：選中頁的內容檢視 / 編輯（既有 markdown editor 元件，「✏️ 編輯」/「👁 預覽」雙模式）
- 底部：操作記錄列表（讀 wiki_log）

### 6.2 章節編輯區底部動作列

從：
```
[💾 存入版本]   ←空白→   [💾 儲存]  [↩️ 重新生成]  [✨ 生成本章]
```
改為：
```
[💾 存入版本] [📚 存入 Wiki]   ←空白→   [💾 儲存]  [↩️ 重新生成]  [✨ 生成本章]
```

「📚 存入 Wiki」按鈕狀態（對應 chapters.wikiSyncStatus）：
| status | 顯示 | 點擊行為 |
|---|---|---|
| `unsynced` | `📚 存入 Wiki`（主按鈕） | 跑 ingest |
| `synced` | `✓ 已存入`（灰色禁用，hover tooltip 顯示時間） | 無 |
| `stale` | `⚠️ Wiki 已過時，重新存入`（橘色主按鈕） | 跑 ingest |
| `partial` | `⚠️ Wiki 部分失敗`（紅色，hover tooltip 顯示失敗數） | 開啟 modal：[重試剩餘] [還原] [完整重跑] |
| `partial_stale` | `⚠️ 部分失敗 + 已過時`（紅色） | 開啟 modal：[還原後重新 ingest] [僅還原] [完整重跑] —— 不提供「重試剩餘」因為章節內容已變，舊 failed brief 不再對應 |
| ingest 中 | spinner + `存入中...`（禁用） | 無 |

### 6.3 Toast

```
┌─────────────────────────────────────┐
│ ✓ Wiki 已更新                       │
│   新增 2 頁、修改 1 頁              │
│   [查看變更]  [↩ 還原]              │
└─────────────────────────────────────┘
```

- 「查看變更」開啟 modal，列出本次 ingest 的所有 ops + 各頁 before/after 簡單行級 diff
- 「還原」執行 §4.6 的還原流程
- 若 Plan 含 `unrecorded_characters`：toast 多一行「[新登場角色 N 人 → 一鍵加入角色庫]」

### 6.4 「未存入 Wiki」提醒（modules/04 既規）

- 章節列表項目右側徽章（依 `wikiSyncStatus`）：
  - `unsynced` → 橘色 `⚠️ 未存 Wiki`
  - `stale` → 橘色 `⚠️ Wiki 已過時`
  - `partial` → 紅色 `⚠️ Wiki 部分失敗`
  - `partial_stale` → 紅色 `⚠️ 部分失敗 + 已過時`
  - `synced` → 無徽章
- 章節列表頂部：所有非 `synced` 章節 ≥ 1 → banner「您有 N 個章節 Wiki 未完整同步 [批次處理]」
- 「批次處理」對每章串行，依 status 分派：
  - `unsynced` / `stale` → 跑 ingest（從頭）
  - `partial` → 跑「重試剩餘」（同 batch 的 failed ops）
  - `partial_stale` → 跑「還原後重新 ingest」（章節內容已變，舊 failed brief 已失效；先 undo 該 batch，再從頭 ingest 新內容）

  顯示進度條與當前章名，可隨時取消（取消後已完成的章節保留）
- 點擊「導出」前若有非 `synced` 章節 → confirm modal「N 章節 Wiki 未完整同步，仍要導出？[取消] [先批次處理] [略過]」

### 6.5 偏好設定新增區塊

```
⚙️ 偏好設定
├── 🔑 LLM API                  (既有)
├── ✨ 選取調整內容              (既有)
├── 📜 AI 提示詞                (既有，新增 4 個 wiki 模板)
└── 📚 Wiki 設定                (新增)
    ├── Wiki 區塊預算佔比         [25%]  (10%~50% slider)
    ├── 連續超預算警告閾值        [3]
    └── 啟用 pick-pages 模式      [☐] (Phase 2.5 後可用，此版本禁用)
```

### 6.6 Prompt 模板加入「📜 AI 提示詞」

| # | template key | 觸發 |
|---|---|---|
| 5 | `wikiIngestPlanTemplate` | Ingest §4 step 2 |
| 6 | `wikiIngestCreateTemplate` | Ingest §4 step 4 create op |
| 7 | `wikiIngestUpdateTemplate` | Ingest §4 step 4 update op |
| 8 | `wikiQueryAnswerTemplate` | 預留給 Phase 2.5「直接問 Wiki」UI |

所有模板從 `skills/llm-wiki/prompts/` 移植，把「filesystem path」改成「type+slug」、移除「regenerate index.md」（SQL 即時查）。

---

## 7. 範圍邊界

### Phase 2 做

1. wiki_pages / wiki_log 兩表（兩個 adapter 同步實作）
2. Bundle 匯出 / 匯入帶 wiki 資料
3. chapters 的 `wikiSyncedAt` / `wikiSyncedHash` / `wikiSyncStatus` 三欄位 + Migration
4. Ingest pipeline + 4 個 prompt 模板
5. 自動 apply + toast + 一鍵還原
6. Wiki Loader（cheap relevance filter + 優先級排序 + 黃/紅警報截斷）整合 Context Budget
7. Wiki 分頁 UI（index、頁面編輯、操作記錄）
8. 章節「📚 存入 Wiki」按鈕 + 四種狀態
9. 「未存入 Wiki」徽章 + 頂部 banner + 批次存入
10. 偏好設定「📚 Wiki 設定」

### Phase 2 **不**做（明確 YAGNI）

| 項目 | 為何不做 |
|---|---|
| Pick-pages 兩段式查詢 | Phase 2.5；連續 3 次黃線警告才升級 |
| Lint（矛盾 / 孤頁 / broken link） | roadmap Phase 2.5 已規格化 |
| 跨章呼應檢查 | 「只吃本章」的天生限制；等 lint 補 |
| 角色關係圖視覺化 | Phase 2 第 3 項，獨立 spec |
| SQLite FTS5 全文搜尋 | Phase 2 第 2 項（替代 RAG），獨立 spec |
| Wiki 自動寫 characters 表 | 設計選擇；只在 UI 提示「一鍵建立」 |
| AI 自動觸發 ingest（生成完自動跑） | 設計選擇；只手動觸發 |
| 跨書 Wiki 共享 | 違反 bookId 為根鍵原則 |
| Wiki 頁的版本歷史 | wiki_log 已提供 before/after 還原 |
| 「直接問 Wiki」自然語言問答 UI | 雖然 prompt #8 預留，但入口留到 Phase 2.5 隨 pick-pages 上線 |

### 與其他模組的影響

| 模組 | 影響 |
|---|---|
| `00-book.md` | 刪書 cascade 新增 wiki_pages + wiki_log 兩表 |
| `03-chapters.md` | chapters schema +wikiSyncedAt；章節列表 UI 增加徽章；底部動作列新增「📚 存入 Wiki」按鈕 |
| `04-knowledge.md` | 本 spec 即為其 Phase 2 部分的落地實作 |
| `07-context-budget.md` | BudgetInputs +wikiSection；buildGenerationPrompt 注入；DEFAULT_CHAPTER_CONTENT_TEMPLATE 加入 `{{wikiSection}}` |
| `08-llm-adapter.md` | 不變（走既有 complete()） |
| `05-versions.md` | 不變 |
| Bundle 匯入/匯出 | Bundle shape 升版，舊 backup 無 wiki 欄位視為空陣列 |

### 跨平台一致性

- Dexie 與 Tauri-SQLite 雙 adapter 都實作 `WikiOps` / `WikiLogOps`
- Schema 對齊（同樣的欄位、同樣的約束）
- Round-trip 驗證：瀏覽器版匯出 → 桌面版匯入 → 桌面版匯出 → bit-perfect 對等（與 Phase 5b 同等驗收標準）

---

## 8. 驗收標準

1. **基本 CRUD**：在 Wiki 分頁手動新增/編輯/刪除頁，重啟後仍存在（兩個平台都驗）
2. **Ingest 成功路徑**：對既有書的某章按「📚 存入 Wiki」，Plan + Apply 完成，wiki_pages 出現新頁、wiki_log 有對應記錄、章節徽章變灰
3. **Ingest 還原**：剛 ingest 完，按還原 → wiki 回到 ingest 前狀態，章節徽章回橘
4. **重複偵測**：對含「李明」的章節 ingest 後，再對含「小李」（aliases）的章節 ingest，應 update 既有 entity 而非 create 重複頁
5. **生成整合**：生成下一章時，prompt 中應包含 `### 相關 Wiki 條目` 區塊（temp/ 的 prompt debug log 可驗）
6. **預算警報**：人為造一個 50 頁 wiki + 4k context 模型，生成時應出現黃色 banner；100 頁時紅色 banner
7. **未存提醒**：未存章節徽章正確；批次存入完成後徽章全清
8. **匯入向後相容**：載入 Phase 5b 時代的舊 backup JSON（無 wikiPages / wikiLog 欄位），不報錯
9. **跨平台 round-trip**：瀏覽器版建立 wiki → 匯出 → 桌面版匯入 → 桌面版查 → 一致
10. **刪書級聯**：刪除書後查 wiki_pages、wiki_log 應為 0 條（該 bookId）
11. **Partial 狀態**：mock 一個 apply LLM 失敗（或 page 寫入失敗），章節 status 應變 `partial`，徽章紅色「Wiki 部分失敗」，tooltip 顯示失敗數
12. **Partial → 重試**：對 partial 章節點「重試剩餘」→ 全成功則章節變 `synced`；仍有失敗則維持 `partial`、失敗數可能變少
13. **Partial → 內容變更**：partial 章節編輯內容後 status 應變 `partial_stale`（不可被 stale 蓋掉失敗事實）
14. **Delete undo round-trip**：手動建頁 → 刪除（產生 delete log）→ undo → 頁面 id/bookId/createdAt 完整還原

---

## 9. 風險與假設

| 項目 | 風險 / 假設 |
|---|---|
| LLM Plan 品質 | 假設主流模型（Gemini 2.x / Claude / GPT-4o）對中文 ingest 任務可產出可用 Plan JSON；自定義小模型可能踩坑，prompts 可調 |
| Plan JSON 穩定性 | 假設 LLM 願意輸出嚴格 JSON。實際遇 markdown wrap 等情況需 `tryParseJsonLoose()`（與既有 outline/character ingest 共用） |
| Apply 串行延遲 | 假設使用者可接受「ingest 一章約 5–15 秒」（取決於 op 數量與模型速度）；UI 有 spinner |
| 中文 token 估算 | Phase 2 保守用 1.5 char/token（`estimateTokens()` 抽象，§5.2.5）；Phase 2.5+ 可換 tiktoken-wasm 不改 caller |
| 跨章呼應 | 已知限制：只吃本章 ingest 無法保證跨章一致性；Phase 2.5 lint 補 |
| wiki_log 體積 | 每章 ingest 可能產 2–5 條 log，含 before/after 全文。長期累積會占空間；Phase 2.5 可加「歸檔舊 log」功能 |

---

## 10. 後續工作（不在本 spec）

1. **角色關係圖視覺化**（Phase 2 第 3 項）— 獨立 spec
2. **SQLite FTS5 全文搜尋**（Phase 2 第 2 項，替代 RAG）— 獨立 spec
3. **Phase 2.5：Lint + Pick-pages + 跨章一致性**
4. **Phase 2.5：「直接問 Wiki」UI**（用到 prompt #8）
5. **Phase 2.5：wiki_log 歸檔 / 壓縮**（before/after snapshot 長期累積會佔空間）

---

## 11. Review 修訂紀錄

### Round 4（2026-05-17，codex 第四輪 review）

19. `page_snapshot_after` 註解釐清三種 null/保留情境：delete 為 null、Apply LLM 失敗為 null、page 寫入失敗仍保留 after（供重試）（§3.1）
20. §7 scope 清單補齊 chapters 三欄位（wikiSyncedAt / wikiSyncedHash / wikiSyncStatus）
21. §6.4 批次處理依 status 明確分派：unsynced/stale→ingest、partial→重試剩餘、partial_stale→還原後重新 ingest
22. §4.6 undo 明確說明只處理 `op_status='ok'`；failed entries 留為歷史，重放走「重試剩餘」

### Round 3（2026-05-17，codex 第三輪 review）

14. WikiPageSnapshot 改為等同完整 WikiPage（含 id/bookId/type/slug/時間戳），保證 delete undo 可 bit-perfect 還原（§3.3）
15. 新增 `partial_stale` 狀態，避免 partial 被章節修改誤蓋為 stale（§3.2、§4.1、§6.2、§6.4）
16. 新增 §4.7「Prompt 移植規則」，明確 filesystem path → type+slug 的改寫對照表 + 容錯
17. Cheap relevance filter 定義具體版（2-4 字滑動窗、字頻 top 50、純 JS 零依賴），避免實作分歧（§5.3 Step 1）
18. 驗收標準新增 4 條：partial 顯示、重試剩餘、partial → 內容變更、delete undo round-trip（§8）

### Round 2（2026-05-17，codex 第二輪 review）

12. D4 決策總覽改寫為「小 Wiki 全載；中/大走 cheap filter + 截斷」與 §5.3 一致（§2）
13. chapters 加 `wikiSyncStatus` 欄位（`unsynced`/`synced`/`stale`/`partial`），明示語意取代從 hash 推導；UI 徽章與按鈕狀態同步分四種；批次處理區分 ingest vs 重試（§3.2、§4.1、§4.6、§6.2、§6.4）

### Round 1（2026-05-17，codex 第一輪 review）

2026-05-17 接受 codex review（`docs/review-0517.md`）11 項建議：

1. wiki_log 加 `batch_id` 取代「同一秒內」啟發式（§3.1、§4.6）
2. wiki_log 加 `op_status` + 補償模式（tauri-plugin-sql 無 txn 的妥協方案；§4.5）
3. before/after 改存 `page_snapshot_*` JSON 含 metadata（§3.1、§4.6）
4. chapters 加 `wikiSyncedHash` 取代純 `updatedAt` 比對（§3.2）
5. Plan JSON 移除註解；`unrecorded_characters` 物件化加 `sourceExcerpt`（§4.2）
6. description 由 LLM 輸出優先，fallback 才取 prose 前 60 字（§4.2、§4.3）
7. Wiki Loader 加 cheap relevance filter（§5.3 Step 1）
8. Token 估算改保守 1.5 char/token + 抽象 `estimateTokens()`（§5.2.5、§9）
9. 匯入順序明定 pages → log（§3.4）
10. wiki_log 歸檔列為 Phase 2.5 後續工作（§10）
11. 補償模式明確說明取代 transaction（§4.1 流程末段）
