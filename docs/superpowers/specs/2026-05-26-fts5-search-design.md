# FTS5 全文檢索設計（Phase 2 收尾）

> 狀態：**設計完成，待實作**
> 日期：2026-05-26

---

## 決策摘要

| 議題 | 決策 |
|------|------|
| 範圍 | MVP（搜尋 chapters + wiki pages + Toolbar 🔎 UI）+ Wiki ingest Create 整合（情境 A） |
| 平台策略 | Tauri-only。Web 版（Dexie）`storage.search = undefined`，UI 隱藏 |
| Tokenizer | **SQLite FTS5 內建 `trigram`**（取代 roadmap 寫的 bigram） |
| 索引更新時機 | SQLite trigger 自動同步（chapters / wiki_pages INSERT/UPDATE/DELETE） |
| 搜尋 UI 進入點 | Toolbar 加 🔎 按鈕（快捷鍵後補） |
| 偏好設定擴充 | **無新增 pref**；Wiki 設定分頁加說明文字 |
| LLM call 影響 | Wiki ingest Create 階段補 ≤3 章 FTS 段落，Update **不整合** |

---

## §1 整體架構

### 流程

```
[Toolbar 🔎] ──點──> <GlobalSearchModal>
                          │ debounce 250ms
                          ▼
                  storage.search.search(bookId, query, {scope, limit})
                          │
                          ▼
                  fts-tauri.ts ── SQL ──> chapters_fts / wiki_pages_fts
                          │              (trigger 自動同步)
                          ▼
                  SearchHit[] → render with <mark>

[Wiki Panel 存入 Wiki] ──> wiki-ingest.applyOneOp (create)
                                ├─ if storage.search: 抓 ≤3 章相關段落
                                └─ 塞進 wikiIngestCreateTemplate 的 {{ftsExcerptsSection}}
```

### Tokenizer 選擇

| 選項 | 是否採用 | 原因 |
|------|---------|------|
| `unicode61`（FTS5 預設） | ❌ | 空格切詞，CJK 完全不能用 |
| 自製 bigram（應用層 preprocess） | ❌ | 索引較髒、實作量多 |
| **`trigram`（FTS5 內建，3.34+）** | ✅ | 中文友善、零外部依賴、誤判率比 bigram 低 |

tauri-plugin-sql 內附 SQLite ≥3.45，直接 `tokenize='trigram'` 即可用。

### 檔案佈局

```
src/lib/search/
  types.ts              # SearchHit / SearchScope / SearchOptions
  sanitize.ts           # 使用者 query → FTS 安全字串（+ unit test）
  highlight.ts          # <<<...>>> → React <mark>（+ unit test）
  fts-tauri.ts          # SQLite FTS5 實作（+ unit test mock db）

src/lib/storage/
  types.ts              # 加 SearchStore interface + optional storage.search
  tauri-sqlite-adapter.ts   # wire fts-tauri.ts
  dexie-adapter.ts      # 不實作（storage.search 不掛）

src/components/search/
  GlobalSearchModal.tsx  # 大 modal + debounce input + scope tabs + result list
  SearchResultRow.tsx    # 單筆 row（icon + title + snippet + 跳轉）

src/lib/wiki-ingest.ts        # （改）Create 前 storage.search?.()
src/lib/prompt-defaults.ts    # （改）wikiIngestCreateTemplate 加 {{ftsExcerptsSection}}
src/components/Toolbar.tsx    # （改）加 🔎 按鈕
src/components/Toolbar.tsx    # （改）📚 Wiki 設定底部加說明文字

src-tauri/migrations/003_fts.sql  # CREATE VIRTUAL TABLE × 2 + 6 個 trigger + 一次性回填
```

### Schema migration 003_fts.sql

> **重要：** `chapters` 表把整個 chapter 物件序列化進 `data TEXT` JSON 欄位，
> 沒有直接的 `title` / `content` 欄位。Trigger 與回填都要走 `json_extract(data, '$.field')`。
> SQLite json1 module 在 tauri-plugin-sql 內附，預設啟用。
> `wiki_pages` 表反之，有 native columns，直接用。

```sql
-- chapters FTS（走 json_extract 因為 chapter 內容在 data JSON 欄位）
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

-- wiki_pages FTS（含 aliases JSON 串接後當文字索引）
CREATE VIRTUAL TABLE wiki_pages_fts USING fts5(
  page_id UNINDEXED,
  book_id UNINDEXED,
  title,
  aliases,        -- JSON array 串接成 "alias1 alias2 ..." 索引
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

-- 一次性回填現有資料
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
```

> aliases 欄位是 JSON `["alias1","alias2"]`，用 `replace(...)` 三層拆成 `alias1, alias2` 給 FTS 切詞。簡陋但有效；不另做 JSON parse。

---

## §2 Search API + 資料流

### TypeScript 介面

```ts
// src/lib/search/types.ts
export interface SearchHit {
  scope: 'chapter' | 'wikiPage';
  id: string;
  title: string;
  /** FTS snippet() 結果，含 <<<...>>> 標記 */
  snippet: string;
  /** bm25() 排序分數，越小越相關 */
  score: number;
  /** 章節 only：order，方便顯示「第 N 章」 */
  chapterOrder?: number;
}

export interface SearchOptions {
  scope?: 'chapter' | 'wikiPage' | 'both';   // 預設 'both'
  limit?: number;                              // 預設 50
}

// src/lib/storage/types.ts
export interface SearchStore {
  search(bookId: string, query: string, opts?: SearchOptions): Promise<SearchHit[]>;
}

export interface StorageAdapter {
  // ... 既有
  search?: SearchStore;     // Tauri-only；Dexie 不掛
}
```

### Query sanitize

`sanitizeFtsQuery(input: string): string`

| 使用者輸入 | 內部轉成 | 說明 |
|------------|---------|------|
| `老王` | `"老王"` | 短語精確匹配（quoted） |
| `老王 劍術` | `"老王" "劍術"` | 空格 = AND |
| `老王 OR 趙六` | `"老王" OR "趙六"` | 保留 OR 操作符（大寫） |
| 含 `"` `'` `*` `(` `)` 等 | 過濾掉 | 防 FTS5 query 語法注入 |
| 空字串 / 只有空白 | 回 `''` | 上層短路、不查 |

純 string 處理，不引入 query parser library。

### fts-tauri.ts 查詢實作

```ts
async search(bookId, query, opts) {
  const q = sanitizeFtsQuery(query);
  if (!q) return [];

  const scope = opts?.scope ?? 'both';
  const limit = opts?.limit ?? 50;
  const hits: SearchHit[] = [];
  const db = await getDb();

  if (scope === 'chapter' || scope === 'both') {
    // chapters 主表只有 id/project_id/ord/updated_at/data；title 從 FTS 拿、order 從主表
    const rows = await db.select<ChapterFtsRow[]>(`
      SELECT
        c.id, c.ord as chapter_order,
        chapters_fts.title as title,
        snippet(chapters_fts, 3, '<<<', '>>>', '…', 16) as snippet,
        bm25(chapters_fts) as score
      FROM chapters_fts
      JOIN chapters c ON c.id = chapters_fts.chapter_id
      WHERE chapters_fts MATCH ? AND chapters_fts.book_id = ?
      ORDER BY score LIMIT ?
    `, [q, bookId, limit]);
    hits.push(...rows.map(r => ({
      scope: 'chapter' as const,
      id: r.id, title: r.title,
      snippet: r.snippet, score: r.score,
      chapterOrder: r.chapter_order,
    })));
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
    hits.push(...rows.map(r => ({
      scope: 'wikiPage' as const,
      id: r.id,
      title: `${r.type}/${r.slug} — ${r.title}`,
      snippet: r.snippet, score: r.score,
    })));
  }

  // 混合排序：bm25 score 同 query 共用 scale
  return hits.sort((a, b) => a.score - b.score).slice(0, limit);
}
```

`snippet(table, colIdx, prefix, suffix, ellipsis, maxTokens)` 是 FTS5 內建函式，SQLite 直接回傳含命中標記的片段，前端無需 highlight 邏輯。

### Wiki ingest Create 整合（情境 A）

修改 `src/lib/wiki-ingest.ts` 的 `applyOneOp` 在 create 分支：

```ts
if (op.action === 'create') {
  let extraExcerpts = '';
  if (storage.search) {
    const q = [op.title, op.slug.replace(/-/g, ' ')].join(' ');
    try {
      const hits = await storage.search.search(bookId, q, {
        scope: 'chapter', limit: 3,
      });
      const others = hits.filter(h => h.id !== chapter.id);
      if (others.length > 0) {
        extraExcerpts = '\n\n## 全書其他章節中提及的相關段落\n' +
          others.map(h => `### 第 ${(h.chapterOrder ?? 0) + 1} 章「${h.title}」\n${h.snippet}`).join('\n\n');
      }
    } catch (e) {
      console.warn('[wiki-ingest] FTS lookup 失敗，跳過：', e);
    }
  }

  const prompt = renderTemplate(aiPrompts.wikiIngestCreateTemplate, {
    type: op.type, slug: op.slug, title: op.title,
    aliasesList: op.aliases.join('、') || '(無)',
    reason: op.reason, contentBrief: op.content_brief,
    chapterExcerpt,
    ftsExcerptsSection: extraExcerpts,
  });
  afterContent = await complete(prompt, { maxTokens: 2048 });
}
```

`update` 分支不整合（避免 prompt 爆 token；既有頁本身已含累積資訊）。

### Prompt 模板新變數

`DEFAULT_WIKI_INGEST_CREATE_TEMPLATE` 末段加 `{{ftsExcerptsSection}}`（空字串時佔位字元為空，不影響排版）。對應 `PROMPT_TEMPLATE_VARS.wikiIngestCreateTemplate` 加說明：

```ts
{ var: 'ftsExcerptsSection', desc: 'FTS 抓到的全書相關段落 (Tauri-only；空字串若無命中)' },
```

---

## §3 UI + 錯誤處理

### Toolbar 進入點

`src/components/Toolbar.tsx`：

```tsx
import { storage } from '../lib/storage';
// 在 editor view 的 button 區
{view === 'editor' && storage.search && (
  <Button variant="secondary" onClick={() => setShowSearch(true)}>🔎 搜尋</Button>
)}
```

- 只有 editor view 且 `storage.search != null` 才顯示
- 沒專案時 disabled

### GlobalSearchModal

```
┌─ 🔎 全書搜尋 ─────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────┐│
│ │ 老王 劍術                                  ⌨ Esc││
│ └──────────────────────────────────────────────────┘│
│ [全部 24] [章節 18] [Wiki 6]              已搜尋 23 ms│
├──────────────────────────────────────────────────────┤
│ 📖 第 3 章「王大入山」                       第 3 章│
│    …青年[老王]抬起頭，眼中有著[劍術]大師…             │
│                                                      │
│ 📚 entity/wang-da — 王大                        Wiki│
│    …[老王]是城東有名的[劍術]師父…                    │
└──────────────────────────────────────────────────────┘
```

- Input debounce 250ms（避免每按一鍵發 query）
- Top tabs 切換 scope（all / chapter / wikiPage）— filter 本地 hits 不重新 query
- Result row 點下 → 關 modal → 跳到對應 chapter（`useUIStore.setSelectedChapterId` + `setActiveTab('chapters')`）/ wiki page（`useWikiStore.selectPage` + `setActiveTab('wiki')`）
- snippet 用 regex 把 `<<<...>>>` 換成 `<mark>...</mark>` React node
- 空查詢提示「輸入關鍵字…」；無結果提示「沒有命中」
- 顯示「已搜尋 N ms」當 perf 指示

### 設定區域說明

不加偏好設定欄位 — FTS 行為對使用者無感。

`📚 Wiki 設定` 分頁底部加灰字說明：

```
🔎 全書搜尋：本機桌面版自動啟用（SQLite FTS5 + trigram 分詞）；瀏覽器版不可用。
Wiki ingest「存入」階段建立新頁時，會自動引用 ≤3 章相關段落以提升首次建立品質。
```

### 錯誤處理

| 情境 | 行為 |
|------|------|
| FTS query 語法錯誤 | sanitize 已過濾；殘留 case catch 後在 modal 顯示「查詢語法錯誤：xxx」 |
| Migration 003 跑失敗 | tauri-plugin-sql 啟動報錯 → 應用顯示載入錯誤（既有錯誤路徑） |
| Wiki ingest 中 `storage.search` 失敗 | catch + log + extraExcerpts 留空，不阻斷 ingest |
| Web 版誤觸（不該發生） | adapter 不掛 search → 上層 `if (storage.search)` 守衛、UI 隱藏 |
| 大本書搜尋慢 | FTS5 本身 ms 級；超大書（>1MB 內容）首次查可能 50–100ms — 仍可接受，不做 spinner |

---

## §4 測試規劃

### Unit tests（vitest）

| 測試檔 | 重點 case |
|--------|-----------|
| `lib/search/sanitize.test.ts` | 空字串、單詞、多詞 AND、OR 操作符、含 `"` `*` `(` 過濾 |
| `lib/search/highlight.test.ts` | 無標記 → 純文字、含單 `<<<x>>>` → `<mark>x</mark>`、含多標記、`<` `>` 跳脫 |
| `lib/search/fts-tauri.test.ts` | mock db.select 回 row → SearchHit 形狀正確；scope='chapter' 只走 chapters_fts；scope='both' 排序混合 |

### 手動驗收清單

1. Tauri 桌面版 → Toolbar 看到 🔎；`npm run dev` 瀏覽器版打開不見
2. 輸入「老王」→ 章節 + wiki 都列出，snippet 含 `<mark>老王</mark>`
3. 輸入「老王 劍術」→ 兩詞都命中的段落才出現
4. 點章節結果 → 跳到該章；點 wiki 結果 → 跳到該 wiki 頁
5. 改章節 content 後立即重搜，新內容反映（trigger 生效）
6. 刪章節 → 重搜，該章不再出現
7. 改 wiki page contentMd → 重搜，新內容反映
8. 新建 wiki entity，看 `temp/chapter-gen-*.txt` log（如有 wiki ingest log 機制）→ Create prompt 應含「全書其他章節中提及」section
9. 第一本書沒有相關段落 → ftsExcerptsSection 為空字串、prompt 不顯示空 header
10. Migration 003 在乾淨 DB 與既有 DB（已有 chapters / wiki_pages）都跑得過、回填正確
11. （回歸）lint / wiki ingest / 章節生成現有功能不受影響

---

## 預估工作量

| 模組 | tasks |
|------|-------|
| Migration 003 + schema | 1 |
| sanitize + types + fts-tauri + 3 unit test | 2 |
| Storage adapter wire-up + capability flag | 1 |
| highlight 函式 + test | 1 |
| GlobalSearchModal + SearchResultRow | 2 |
| Toolbar 按鈕整合 | 1 |
| Wiki ingest Create 整合 + 模板更新 | 2 |
| 手動驗收 sweep + CHANGELOG | 1 |
| **合計** | **~11 tasks** |

---

## 不在本 spec 範圍（YAGNI）

- 快捷鍵 Ctrl+K（後補）
- 搜尋歷史 / 最近搜尋
- 進階查詢語法 UI（regex / 全字 / 大小寫切換）
- 跨書全域搜尋
- Lint unrecorded 整合 FTS（情境 C）
- Context Budget 章節生成時注入「前文回顧」（情境 C）
- Lint wiki-vs-chapter 用 FTS 搜尋（情境 D）
- Web 版 (Dexie) JS substring fallback
- 自製 bigram tokenizer
