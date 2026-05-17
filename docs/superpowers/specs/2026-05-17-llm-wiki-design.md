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
| D4 | Query 策略 | 全載 + 黃/紅警報截斷 fallback；pick-pages 留待 Phase 2.5 |
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
  id              TEXT PRIMARY KEY,
  bookId          TEXT NOT NULL,
  applied_at      TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN
                    ('create','update','delete','undo')),
  page_id         TEXT,                            -- nullable 若頁已被刪
  page_type       TEXT NOT NULL,
  page_slug       TEXT NOT NULL,
  before_content  TEXT,                            -- null on create
  after_content   TEXT,                            -- null on delete
  source          TEXT NOT NULL,                   -- 'ingest:<chapterId>' | 'manual' | 'undo:<logId>'
  summary         TEXT NOT NULL                    -- 1-line 人類可讀
);
CREATE INDEX idx_wiki_log_book ON wiki_log (bookId, applied_at);
```

### 3.2 既有表新增欄位

```sql
ALTER TABLE chapters ADD COLUMN wikiSyncedAt TEXT;  -- ISO8601 或 NULL
```

判斷邏輯：
- `wikiSyncedAt = NULL` → 未存（橘色 `⚠️ 未存 Wiki`）
- `chapters.updatedAt > wikiSyncedAt` → 已過時（橘色 `⚠️ Wiki 已過時`）
- 否則 → 已同步（灰色「✓ 已存入」+ tooltip 顯示時間）

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

export interface WikiLogEntry {
  id: string;
  bookId: string;
  appliedAt: string;
  kind: 'create' | 'update' | 'delete' | 'undo';
  pageId: string | null;
  pageType: WikiPageType;
  pageSlug: string;
  beforeContent: string | null;
  afterContent: string | null;
  source: string;
  summary: string;
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
  listByIngestChapter(bookId: string, chapterId: string): Promise<WikiLogEntry[]>;
  add(entry: WikiLogEntry): Promise<void>;
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

`replaceAll()` 在兩個 adapter 都需擴充：delete wiki 兩表後依序 insert。順序：先 wiki_log（FK-free）再 wiki_pages 不重要，因兩表無 FK 約束，但匯入時遵循「先 pages 後 log」以便 UI 顯示 log 時 page_id 已可解析。

### 3.5 Cascade Delete

刪除書時級聯刪除 wiki_pages + wiki_log（與既有 chapters/versions/characters 同等處理）。

---

## 4. Ingest Pipeline

### 4.1 流程

```
按「📚 存入 Wiki」
   │
   ▼
[1] Pre-flight（純應用層，無 LLM）
   - 撈本章 content
   - SELECT index (type, slug, title, description, aliases) FROM wiki_pages
   - SELECT names + aliases FROM characters
   │
   ▼
[2] PLAN（1 LLM call）
   prompt: wikiIngestPlanTemplate
   input:  本章正文 + wiki index + characters names
   output: Plan JSON
   │
   ▼
[3] Plan 校驗（純應用層）
   - 所有 slug 為 ASCII kebab-case
   - create 的 (type, slug) 不可衝突 → 衝突則自動降級為 update
   - update 指定的 path 必須存在 → 否則自動降級為 create
   - 任何不可自動修復的問題 → throw
   │
   ▼
[4] APPLY（每 op 1 LLM call，串行）
   create → wikiIngestCreateTemplate
   update → wikiIngestUpdateTemplate
   │
   ▼
[5] 寫 DB（每 op 一對：先 wiki_log 再 wiki_pages）
   - INSERT INTO wiki_log（before=既有 content_md or NULL, after=新內容）
   - 若 wiki_log 寫入成功 → INSERT/UPDATE wiki_pages
   - 全部完成後：UPDATE chapters SET wikiSyncedAt = now() WHERE id = ?
   │
   ▼
[6] UI 反饋
   - Toast：「Wiki 已更新：新增 N 頁、修改 M 頁 [查看變更] [↩ 還原]」
   - 若 Plan 含「本章新出現的人名 X 不在角色庫」→ 附加「[一鍵加入角色庫]」
```

### 4.2 Plan JSON 格式

```json
{
  "operations": [
    {
      "action": "create",
      "type": "entity",
      "slug": "li-ming",
      "title": "李明",
      "aliases": ["小李"],
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
  "unrecorded_characters": ["王芳", "張三"]   // 出現在本章但不在 wiki 也不在 characters 表
}
```

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
- description 欄位：取第一段 prose 的前 60 字（純文字，截 ellipsis）

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
| Plan | LLM 連線失敗 | toast「網路錯誤，請重試」 |
| Plan | JSON 解析失敗 | 自動重試 1 次 |
| 校驗 | 不可修復 | toast 紅色，顯示具體原因 |
| Apply | 中途某 op LLM 失敗 | 保留已完成 ops（已寫入 DB）；UI 提示「N 個操作未完成，[重試剩餘] [還原已完成]」 |
| 寫 DB | wiki_log 寫失敗 | 跳過該 op 的 wiki_pages 寫入；繼續下一個 |
| 寫 DB | wiki_pages 寫失敗 | wiki_log 已存（before/after 都在）；UI 顯示「N 個操作部分完成，[還原]」 |

### 4.6 還原（Undo）

定義「最近一次 ingest」= source = `ingest:<currentChapterId>` 的最新一批 wiki_log entries（同一秒內）。

還原操作：
1. SELECT wiki_log entries WHERE source = ? ORDER BY applied_at DESC
2. 逐條反向：
   - kind='create' → DELETE wiki_pages WHERE id = page_id
   - kind='update' → UPDATE wiki_pages SET content_md = before_content WHERE id = page_id（同時還原 aliases / related_slugs / description，從 before_content 重新解析）
   - kind='delete' → INSERT wiki_pages 用 before_content
3. 為每個反向操作新增一條 kind='undo'、source='undo:<logId>' 的記錄
4. UPDATE chapters SET wikiSyncedAt = NULL WHERE id = currentChapterId

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

export interface WikiLoadResult {
  text: string;                  // 已格式化好的 markdown 區塊（可空字串）
  loadedPages: number;
  totalPages: number;
  truncatedPages: number;
  status: WikiLoadStatus;
}

export async function loadWikiForGeneration(
  bookId: string,
  contextWindowTokens: number,
  budgetRatio: number = 0.25,    // 來自偏好設定
): Promise<WikiLoadResult>;
```

### 5.3 演算法

```
budgetChars = contextWindowTokens * budgetRatio * 4   // 中文 ~4 char/token 粗估
totalChars  = SUM(length(content_md)) for all pages in bookId

if totalChars <= budgetChars:
  載入所有頁，status = 'ok'
elif totalChars <= budgetChars * 1.5:
  按優先級排序，截斷至 budgetChars，status = 'warn-truncated'
else:
  按優先級權重排序，從高到低依序加入，直到下一頁會超出 budgetChars 為止；status = 'red-truncated'
  （等同於黃色路徑的截斷邏輯，差別僅在 status 標籤與 UI 警告強度）
```

優先級權重：

```
priority = TYPE_WEIGHT[type] * 10 + recency_score
TYPE_WEIGHT = { entity: 5, concept: 4, synthesis: 3, summary: 2, compare: 1 }
recency_score = 1 / (days_since_updated + 1)
```

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

「📚 存入 Wiki」四種狀態：
| 狀態 | 顯示 | 點擊行為 |
|---|---|---|
| 未存 | `📚 存入 Wiki`（主按鈕） | 跑 ingest |
| 已同步 | `✓ 已存入`（灰色禁用，hover tooltip 顯示時間） | 無 |
| 已過時 | `⚠️ Wiki 已過時，重新存入`（橘色主按鈕） | 跑 ingest |
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

- 章節列表項目右側徽章：未存 → `⚠️ 未存 Wiki` 橘色；過時 → `⚠️ Wiki 已過時` 橘色；已同步 → 無徽章
- 章節列表頂部：未存 / 過時章節 ≥ 1 → banner「您有 N 個章節 Wiki 未同步 [批次存入]」
- 「批次存入」對每章串行跑 ingest，顯示進度條與當前章名，可隨時取消（取消後已完成的章節保留）
- 點擊「導出」前若有未存章節 → confirm modal「N 章節 Wiki 未同步，仍要導出？[取消] [先批次存入] [略過]」

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
3. chapters.wikiSyncedAt 欄位 + Migration
4. Ingest pipeline + 4 個 prompt 模板
5. 自動 apply + toast + 一鍵還原
6. Wiki Loader（全載 + 黃/紅警報截斷）整合 Context Budget
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

---

## 9. 風險與假設

| 項目 | 風險 / 假設 |
|---|---|
| LLM Plan 品質 | 假設主流模型（Gemini 2.x / Claude / GPT-4o）對中文 ingest 任務可產出可用 Plan JSON；自定義小模型可能踩坑，prompts 可調 |
| Plan JSON 穩定性 | 假設 LLM 願意輸出嚴格 JSON。實際遇 markdown wrap 等情況需 `tryParseJsonLoose()`（與既有 outline/character ingest 共用） |
| Apply 串行延遲 | 假設使用者可接受「ingest 一章約 5–15 秒」（取決於 op 數量與模型速度）；UI 有 spinner |
| 中文 token 估算 | 4 char/token 是粗估；對英文混雜的 wiki 偏低，影響預算計算精度。Phase 2.5 可換 tiktoken-wasm |
| 跨章呼應 | 已知限制：只吃本章 ingest 無法保證跨章一致性；Phase 2.5 lint 補 |
| wiki_log 體積 | 每章 ingest 可能產 2–5 條 log，含 before/after 全文。長期累積會占空間；Phase 2.5 可加「歸檔舊 log」功能 |

---

## 10. 後續工作（不在本 spec）

1. **角色關係圖視覺化**（Phase 2 第 3 項）— 獨立 spec
2. **SQLite FTS5 全文搜尋**（Phase 2 第 2 項，替代 RAG）— 獨立 spec
3. **Phase 2.5：Lint + Pick-pages + 跨章一致性**
4. **Phase 2.5：「直接問 Wiki」UI**（用到 prompt #8）
