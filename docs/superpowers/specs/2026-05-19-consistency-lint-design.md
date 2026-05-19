# 一致性 Lint 設計 (Phase 2.5 #3)

> 狀態：**設計完成，待實作**
> 日期：2026-05-19（codex review 後修訂）

---

## 決策摘要

| 議題 | 決策 |
|------|------|
| Lint 範圍 | 4 類 6 項，可在偏好設定逐一勾選：①Broken link、②孤頁、③別名重複、④未登錄角色（hybrid）、⑤Wiki 內部矛盾（LLM）、⑥Wiki vs 章節（LLM） |
| 觸發時機 | 手動「🔍 執行 Lint」按鈕（Wiki Panel 頂部） |
| UI 呈現 | 專用 LintReportModal；結果不持久化（下次跑重新生成） |
| Dismiss / Applied | 「維持現狀」/ fix 套用後 issue 標記 `dismissed`/`applied` 灰底保留在 list，session-only；零 schema 變動 |
| 修復幅度 | Broken-link → 一鍵修（寫 `wiki_log`）；孤頁 → 僅報告 + 跳轉（不提供刪除）；語意類 → inline 修改方向 textarea + LLM diff preview |
| Fix 寫入 | **所有 lint fix 都必須走 `wikiStore.savePage()` 並寫 `wiki_log`（`source='lint:<checkId>'`）**，與 Phase 2 Wiki ingest 一致；保留 undo 能力 |
| LLM 成本 | 分類型批檢查（≤5 calls）+ 分角色批檢查（≤10 calls）+ unrecorded hybrid（1 call）；fix 建議 1 call/click |
| 設定位置 | 📚 Wiki 設定分頁底部加 Lint 區段；📜 AI 提示詞加 3 個 sub-tab |

### Review 修訂重點（codex 2026-05-19）

- ✅ 所有 fix 寫 `wiki_log`（broken-link 也是）
- ✅ `removeRelatedSlug` 用 `{type, slug}` 而非單一 string
- ✅ 孤頁降級為 info-only（移除一鍵刪除按鈕）
- ✅ 未登錄角色改 hybrid：structural pre-filter 收候選 → 1 LLM call verify
- ✅ Wiki vs 章節輸入加 character aliases + entity aliases
- ✅ Issue applied/dismissed 不消失，標灰保留
- ✅ 未登錄角色 issue 帶 `sourceExcerpt` 便於跳轉定位
- ✅ Wiki 內部矛盾改用 `lintDigest`（rule-based markdown parser），非前 800 字
- ✅ `setLintPrefs` 用 deep merge

---

## §1 架構

### 流程

```
[Wiki Panel] ──點「🔍 執行 Lint」──> lintBook(bookId, prefs, signal)
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                ▼                         ▼                         ▼
      structural checks            llm-batch checks          (collect)
      ①broken-link                 ④unrecorded（hybrid）           │
      ②orphan                      ⑤wiki-contradict                 │
      ③alias-dup                   ⑥wiki-vs-chapter                 │
                └─────────────────────────┴─────────────────────────┘
                                          ▼
                                  LintReport (in-memory)
                                          ▼
                                  <LintReportModal />
```

### 核心 TypeScript 介面

```ts
interface LintCheck {
  id: string;
  label: string;
  kind: 'structural' | 'llm' | 'hybrid';
  run(ctx: LintContext, signal?: AbortSignal): Promise<LintIssue[]>;
}

interface LintContext {
  bookId: string;
  pages: WikiPage[];           // 全書 wiki_pages
  characters: Character[];     // 全書 characters
  chapters: Chapter[];         // 全書 chapters（含 content）
  prefs: LintPrefs;
  aiPrompts: AIPromptPrefs;    // 給 LLM checks 用
}

type AutoFix =
  | {
      kind: 'removeRelatedSlug';
      pageId: string;
      target: { type: WikiPageType; slug: string };   // ⚠️ 不是單 slug
    };
// 孤頁不再提供 AutoFix（codex review 採納）
// 別名重複本來就沒 AutoFix

interface LlmFixHint {
  kind: 'llm';
  // 由 llm-fix.ts 召喚 complete()
}

interface IssueTarget {
  kind: 'wikiPage' | 'chapter';
  id: string;
  label: string;
  sourceExcerpt?: string;      // 章節用：含關鍵詞的前後文（80 字左右）
}

interface LintIssue {
  id: string;                   // uuid
  checkId: string;
  severity: 'error' | 'warn' | 'info';
  status: 'open' | 'dismissed' | 'applied';   // 預設 open
  title: string;
  detail: string;
  targets: IssueTarget[];
  fix?: AutoFix | LlmFixHint;
}

interface LintReport {
  bookId: string;
  ranAt: number;                // Date.now()
  issues: LintIssue[];
  failedChecks: Array<{ checkId: string; error: string }>;
  unprocessed: Array<{ checkId: string; reason: string }>;  // 超預算未檢查
  cancelled: boolean;
}
```

### 檔案佈局

```
src/lib/lint/
  index.ts                  # lintBook() 主入口
  types.ts                  # 所有介面
  digest.ts                 # WikiLintDigest + markdown parser（給⑤用）
  checks/
    broken-link.ts          # structural ①
    orphan.ts               # structural ②（info-only）
    alias-dup.ts            # structural ③
    unrecorded.ts           # hybrid ④（pre-filter + LLM verify）
    wiki-contradict.ts      # llm-batch ⑤（用 digest）
    wiki-vs-chapter.ts      # llm-batch ⑥（用 aliases）
  llm-fix.ts                # 召喚單一 issue 的修改建議 → 新 markdown

src/stores/lintStore.ts     # currentReport, isRunning, progress, runLint(), cancel()

src/components/lint/
  LintReportModal.tsx        # 主 modal（進行中 + 報告）
  LintIssueRow.tsx           # 含 inline 修改方向展開
  LintFixPreviewModal.tsx    # LLM 建議 diff 預覽
```

---

## §2 各檢查項細節

### ① Broken link（structural）

- 掃 `wiki_pages[].relatedSlugs`，每筆 `{type, slug}` 查 pages Map（key=`type/slug`）是否存在
- `severity: 'warn'`
- `fix: { kind: 'removeRelatedSlug', pageId, target: { type, slug } }`
- 套用：
  1. 取 page、過濾 `relatedSlugs` 移除 target
  2. 寫 `wiki_log` 條目：`kind='update'`、`source='lint:broken-link'`、`batch_id=lintBatchId`、`page_snapshot_before/after`
  3. `storage.wikiPages.update()` 寫頁
  4. 失敗時走 wiki-ingest 同款補償（log 失敗則中止；page 失敗則改 log 為 failed）

### ② 孤頁（structural，info-only）

- 孤頁條件（兩者皆滿足）：
  - (a) 不被任何 wiki 頁的 `relatedSlugs` 反向引用
  - (b) 不被任何章節 content 以 page.title 或任何 page.aliases 字串提及
- 反向引用 Map：掃 `allPages[].relatedSlugs` 一次建立
- 章節提及：`chapter.content.includes(needle)` for each title/alias
- `severity: 'info'`
- `fix: undefined`（**不提供刪除按鈕**）
- UI 只給「跳轉到頁面」chip；使用者真要刪請從 wiki 編輯器手動處理（會走 `wikiStore.deletePage()`，本來就不寫 log 是已知設計）

### ③ 別名重複（structural）

- 建 `Map<string, WikiPage[]>`：所有頁的 `title` + `aliases` 全進 map
- key 出現 ≥2 個不同頁 → issue
- `severity: 'error'`
- `fix: undefined`（純報告 + 跳轉）
- targets 列出所有衝突頁

### ④ 未登錄角色（hybrid：pre-filter + LLM verify）

**Pre-filter（structural pass）— 收窄候選名單**

掃全書章節 content，找出**符合以下任一語境**的「連續 2-4 中文字」候選：
- 引號 / 對話標籤附近：`「……」XX 說` / `XX 問道` / `XX 道` / `XX 喊`
- 稱呼語境：前綴 `叫做` / `名為` / `姓` / `叫` / `稱` / `這位`；後綴 `師兄` / `師姐` / `師父` / `姑娘` / `公子` / `長老` / `大人` / `先生`
- 字頻 ≥3（單章或全書）

過濾：
- 已在 `pages` 的 entity slug/title/aliases 中 → 排除
- 已在 `characters[].name` 或 `characters[].aliases` 中 → 排除
- 黑名單常見虛詞（`但是` / `突然` / `這時` / `眼前` / `不能` / `師父` / `主人公` 等通用詞 30 個左右）→ 排除

輸出候選清單 `Array<{name, occurrences: Array<{chapterId, excerpt: string}>}>`

**LLM verify（1 call）**

把整個候選清單 + 已登錄角色名 + 每個候選的 2 個章節節錄丟給 LLM，輸出 strict JSON：
```json
{
  "newCharacters": [
    { "name": "趙六", "isMainEnough": true, "chapterRefs": ["ch-id-x"] }
  ],
  "rejected": ["突然", "這時"]
}
```

- 超預算保護：候選 > `maxUnrecordedCandidates`（預設 30）時取字頻最高的前 N，其餘進 `report.unprocessed`
- 每 issue：`severity: 'warn'`、`fix: LlmFixHint`（提示「+建 entity / +加 character / —維持現狀」）
- targets 含 `sourceExcerpt`（含關鍵詞前後 40 字）

### ⑤ Wiki 內部矛盾（LLM batch，per page type，用 lintDigest）

**lintDigest 抽取（deterministic markdown parser，see §2.7）**

每個 page 預先抽成：
```ts
interface WikiLintDigest {
  pageId: string;
  type: WikiPageType;
  slug: string;
  title: string;
  aliases: string[];
  description: string;
  facts: string[];        // 含關鍵詞的 bullet / 句子
  relations: string[];    // 「→」「父親」「師父」等關係描述
  timeline: string[];     // 「第 X 章」「之後」「最終」相關句
  openQuestions: string[]; // 未解之謎、伏筆
}
```

**分組**：5 個 page type 各一次 call

**每次 call 輸入**：該 type 全部頁的 digest（JSON array）

若超出 `maxPagesPerTypeContradict`（預設 20）→ 依 `updatedAt` 降冪取前 N，其餘進 `report.unprocessed`

**Prompt 模板 key**：`lintWikiContradictTemplate`
**變數**：`{{pageType}}` / `{{digestsJson}}`

**LLM 輸出（strict JSON）**：
```json
{
  "conflicts": [
    {
      "pages": ["entity/wang-da", "entity/wang-da-shadow"],
      "field": "年齡",
      "detail": "wang-da 寫 35 歲，wang-da-shadow 寫 28 歲"
    }
  ]
}
```

- 解析失敗 → 補 `\n\n（重要：請只輸出嚴格 JSON）` 重試 1 次
- `severity: 'error'`，`fix: LlmFixHint`

### ⑥ Wiki vs 章節事實衝突（LLM batch，per character，用 aliases）

**篩選對象**：有對應 entity page 的主要角色（`characters[]` 中 `name` 能在 wiki entity slug/title/aliases 找到對應者），最多 `maxCharactersVsChapter`（預設 10）個

**搜尋 aliases 集合**：
```
aliasSet = union(
  character.name, character.aliases,
  entityPage.title, entityPage.aliases
)
```

**章節 excerpt**：搜尋章節 content，匹配 aliasSet 任一字串，取含關鍵詞段落前後 500 字，最多 `maxChapterExcerptsPerChar`（預設 3）章

**Prompt 模板 key**：`lintWikiVsChapterTemplate`
**變數**：`{{characterName}}` / `{{aliasesList}}` / `{{wikiContent}}` / `{{chapterExcerptsJson}}`

**LLM 輸出（strict JSON）**：
```json
{
  "conflicts": [
    {
      "field": "武器",
      "wikiSays": "精通劍術",
      "chapterSays": "李四從未握劍",
      "chapterRefs": ["chapter-id-xxx"]
    }
  ]
}
```

- `severity: 'error'`，targets 同時指向 wikiPage + chapter（含 sourceExcerpt），`fix: LlmFixHint`

### LLM fix 召喚（`llm-fix.ts`）

- 觸發：LintIssueRow 的「修改方向」textarea 輸入（可空）後點「✨ 生成建議修改」
- `lintFixSuggestTemplate` 變數：`{{issueTitle}}` / `{{issueDetail}}` / `{{originalMarkdown}}` / `{{userDirection}}`（空字串時 LLM 自行判斷）
- 輸出：完整新 markdown
- 套用流程（同 broken-link，走 wiki_log）：
  1. 寫 `wiki_log`：`kind='update'`、`source='lint:<checkId>'`、`batch_id=lintBatchId`、`page_snapshot_before/after`
  2. `wikiStore.savePage()` 寫頁
  3. 失敗時補償（log 失敗中止 / page 失敗改 log 為 failed）
- 套用後：issue.status = `'applied'`，row 變灰底但留在 list

### §2.7 lintDigest markdown parser

**位置**：`src/lib/lint/digest.ts`

**演算法（rule-based、零 LLM）**：

1. 解析 markdown：
   - H1 → 不用（已從 page.title 取）
   - H2 / H3 標題 → section 邊界
   - bullet (`- `) / numbered 句子 → 候選 item
   - 一般段落 → 切句（依 `。！？\n`）

2. **關鍵詞詞典**（依 page type 微調權重，但詞典共用）：

   | 類別 | 關鍵詞 |
   |------|--------|
   | facts | 年齡 / 身份 / 性別 / 種族 / 武器 / 能力 / 傷勢 / 死亡 / 失蹤 / 真名 / 秘密 / 弱點 / 限制 / 代價 / 規則 / 出身 |
   | relations | 父親 / 母親 / 師父 / 徒弟 / 兄弟 / 姐妹 / 朋友 / 敵人 / 「→」/ 屬於 / 隸屬 / 效忠 |
   | timeline | 第N章 / 之前 / 之後 / 最終 / 當時 / 隨後 / 多年後 / 從此 |
   | openQuestions | 不明 / 未知 / 待解 / 之謎 / 為何 / 是否 / 留下伏筆 / 暗示 |

3. 每個 bullet / 句子掃詞典命中分類 → 進對應 digest 欄位；無命中則跳過

4. **per-type 簡化規則**（Phase 2.5 MVP 共用詞典；future 再分）：
   - entity / concept / summary / compare / synthesis 都用同一詞典
   - description = page.description（若空則取 contentMd 第一句）

5. **超預算截斷順序**（單頁 digest 超出 `~600 字` 時）：
   ```
   保留 title + aliases + description（必留）
   → facts（截尾）
   → relations
   → timeline
   → openQuestions（最先丟）
   ```

---

## §3 UI 流程

### 進入點

`WikiPanel.tsx` 左欄上方：
```
[+ 新增]  [🔍 執行 Lint]  [🔎 搜尋...]
```

### 進行中

開 `<LintReportModal>`（blocking modal），顯示進度列：
```
🔍 Lint 進行中
  ✓ Broken link          12 ms
  ✓ 孤頁                  8 ms
  ✓ 別名重複              3 ms
  ⏳ 未登錄角色（hybrid）  pre-filter → LLM…
  ⌛ Wiki 內部矛盾       等待中
  ⌛ Wiki vs 章節        等待中

                  [ 取消 ]
```
- Structural 3 項串行，通常 < 100 ms
- Hybrid 與 LLM checks 串行
- 「取消」呼叫 `controller.abort()` → 已完成 issues 仍展示

### 報告版面

```
🔍 Lint 報告 ─ 24 個 open / 3 已處理
[全部] [錯誤 8] [警告 13] [資訊 3] [已處理 3]    [⚙ 設定] [✕]
─────────────────────────────────────────────────────────
▼ 別名重複 (3)  ❌
  ❌「老王」同時是 entity/wang-da、entity/wang-er 的別名
     [entity/wang-da]  [entity/wang-er]

▼ Broken link (5)  ⚠️
  ⚠️ entity/li-si.relatedSlugs 指向不存在的 concept/qi
     [entity/li-si]                    [🔧 一鍵移除]
  ✓ ［已修復］entity/wang.relatedSlugs 移除 concept/foo    （灰底）

▼ 孤頁 (4)  ℹ️
  ℹ️ summary/ch-7 沒被任何頁或章節引用
     [summary/ch-7]
     （無刪除按鈕；要刪請開 wiki 編輯器）

▼ Wiki 內部矛盾 (2)  ❌
  ❌ entity/wang-da 與 entity/wang-da-shadow 的「年齡」欄位衝突
     [entity/wang-da]  [entity/wang-da-shadow]    [✏️ 修改 ▾]
     ┌──────────────────────────────────────────────────┐
     │ 修改方向（可留白，留白則由 AI 自行判斷）：         │
     │ ┌────────────────────────────────────────────┐   │
     │ │ 依 ch-3「王大三十五」為準                  │   │
     │ └────────────────────────────────────────────┘   │
     │                      [取消]  [✨ 生成建議修改]    │
     └──────────────────────────────────────────────────┘

▼ Wiki vs 章節 (6)  ❌
  ❌ entity/li-si 寫「精通劍術」，但第 5 章「李四從未握劍」
     [entity/li-si]  [ch-5 「李四握不住劍…」]   [✏️ 修改 ▾]

▼ 未登錄角色 (4)  ⚠️
  ⚠️ 第 8 章出現「趙六」，未在 wiki/characters 登錄
     [ch-8 「…趙六走進客棧…」]
     [+ 建 entity]  [+ 建 character]  [— 維持現狀]
  ─ ［已忽略］「孫七」                                 （灰底）
```

**互動規則**：
- Header 篩選按 severity / 已處理 過濾
- target chip 點下 → 關 modal → 跳到對應頁 / 章節；章節 chip 顯示 sourceExcerpt 摘要
- 🔧 一鍵移除 → 彈確認框 → 寫 wiki_log + savePage → issue.status='applied'，灰底保留
- ✏️ 修改 → inline 展開（row 撐高）；再點收起
- — 維持現狀 → issue.status='dismissed'，灰底保留
- ⚙ 設定 → 跳偏好設定 Wiki 設定分頁 Lint 區段

### LintFixPreviewModal

```
✨ 建議修改：entity/wang-da 年齡欄位

修改原因：與 entity/wang-da-shadow 矛盾，依 ch-3「王大三十五」應為 35

┌─ Before ──────────────┬─ After ──────────────────┐
│ ## 基本資料            │ ## 基本資料               │
│ - 年齡：28            │ - 年齡：35  ◀ 變動        │
│ - 身高：178           │ - 身高：178               │
└───────────────────────┴──────────────────────────┘

         [✗ 取消]    [🔄 重新生成]    [✓ 套用]
```

- Diff：左右兩欄純文字，變動行加底色（不引入 diff library）
- 🔄 重新生成：回 LintIssueRow 的 inline 區（保留修改方向輸入）
- 套用後：寫 wiki_log → savePage → issue.status='applied' → 回 LintReportModal

### 空狀態

```
✅ 沒有發現問題
   ( N 個檢查全部通過 )
        [ 關閉 ]
```

---

## §4 設定擴充

### `LintPrefs` 介面

```ts
interface LintPrefs {
  checks: {
    brokenLink: boolean;           // 預設 true
    orphan: boolean;               // 預設 true
    aliasDup: boolean;             // 預設 true
    unrecorded: boolean;           // 預設 true（hybrid）
    wikiContradict: boolean;       // 預設 true（LLM）
    wikiVsChapter: boolean;        // 預設 true（LLM）
  };
  maxPagesPerTypeContradict: number;     // 預設 20
  maxCharactersVsChapter: number;        // 預設 10
  maxChapterExcerptsPerChar: number;     // 預設 3
  maxUnrecordedCandidates: number;       // 預設 30
}
```

### `setLintPrefs` 用 deep merge

```ts
setLintPrefs: (partial: DeepPartial<LintPrefs>) => void
// 實作：set((state) => ({ lintPrefs: deepMerge(state.lintPrefs, partial) }))
```

避免只改一個 checkbox 時整個 `checks` 物件被覆蓋。

### 新增 Prompt 模板

加入現有 `AIPromptPrefs`（`src/stores/settingsStore.ts`）：

| key | 用途 | 主要變數 |
|-----|------|---------|
| `lintUnrecordedVerifyTemplate` | ④ 未登錄角色 verify | `{{candidatesJson}}` `{{knownNamesList}}` |
| `lintWikiContradictTemplate` | ⑤ Wiki 內部矛盾 | `{{pageType}}` `{{digestsJson}}` |
| `lintWikiVsChapterTemplate` | ⑥ Wiki vs 章節 | `{{characterName}}` `{{aliasesList}}` `{{wikiContent}}` `{{chapterExcerptsJson}}` |
| `lintFixSuggestTemplate` | ✨ 單 issue 修改建議 | `{{issueTitle}}` `{{issueDetail}}` `{{originalMarkdown}}` `{{userDirection}}` |

預設值加進 `src/lib/prompt-defaults.ts`。

### Settings Modal 整合

**不新增頂層分頁，兩處插入：**

1. **`📚 Wiki 設定` 底部加 Lint 區段**
   ```
   ─── Lint ───────────────────────────────
   啟用的檢查：
   [✓] Broken link
   [✓] 孤頁
   [✓] 別名重複
   [✓] 未登錄角色（hybrid）
   [✓] Wiki 內部矛盾（LLM）
   [✓] Wiki vs 章節（LLM）

   LLM 上限：
   單類型最多頁數：[20]
   最多角色數：    [10]
   每角色章節數：   [3]
   未登錄候選上限： [30]
   ```

2. **`📜 AI 提示詞` sub-tabs 末段新增**
   ```
   ... [Wiki #4 Query Answer]
   [Lint #1 Unrecorded] [Lint #2 矛盾] [Lint #3 vs章節] [Lint #4 修改建議]
   ```

### Store 變更

`src/stores/settingsStore.ts`：
- 加 `lintPrefs: LintPrefs`、`setLintPrefs(partial: DeepPartial<LintPrefs>)`（deep merge）
- `AIPromptPrefs` 加 4 個 string 欄位
- `persist.merge`：舊使用者缺少欄位時用 defaults 補齊（沿用既有 pattern）
- **零 SQLite/Dexie schema 變動**（走 localStorage persist）

---

## §5 錯誤處理

| 情境 | 行為 |
|------|------|
| Structural check 例外 | 該 check 標 `❌ 失敗`，其他繼續；report header 顯示失敗數 |
| Hybrid pre-filter 失敗 | 同 structural；LLM verify 不跑 |
| LLM call 全失敗（3 次重試後） | 該 check 整批標失敗，不阻斷其他；已收集 issues 仍展示 |
| LLM JSON 解析失敗 | 補 `\n\n（重要：請只輸出嚴格 JSON）` 重試 1 次；仍失敗則整批失敗 |
| LLM fix 建議失敗 | preview modal 顯示錯誤 + 🔄 重新生成 |
| Fix 套用 — 寫 wiki_log 失敗 | abort，preview modal alert；issue 留 report 可重試 |
| Fix 套用 — savePage 失敗 | 把 log 標 `op_status='failed'`（用 `storage.wikiLog.updateStatus`）；preview modal alert |
| 取消 | 中斷後續 check；標題改「(部分) Lint 報告 — 中途取消」 |

### Wiki log 寫入規格

所有 lint fix（broken-link auto + LLM fix）共用同一 batch_id（lintBatchId, uuid generated at runLint start）：
- `kind`: `'update'`（broken-link 移 ref / LLM 改頁都是 update）
- `op_status`: `'ok'` / `'failed'`
- `source`: `'lint:broken-link'` / `'lint:wikiContradict'` / `'lint:wikiVsChapter'` / `'lint:unrecorded'`
- `batch_id`: lintBatchId（同一次 lint run 共用，方便日後 undo 整批 lint 修改）
- `page_snapshot_before` / `page_snapshot_after`: 完整 WikiPage

→ 未來可擴充「undo 整批 lint 修改」功能（同 wiki ingest 的 undoBatch）。

### AbortSignal 傳遞

```ts
lintBook(bookId, prefs, signal?: AbortSignal)
```
- Structural / hybrid pre-filter：每 check 完後 `if (signal?.aborted) break`
- LLM call：把 signal 一路傳到 `postToLLM`（補可選 signal 參數傳給 fetch）

---

## §6 測試規劃

### Unit tests（vitest）

| 測試檔 | 重點 case |
|--------|-----------|
| `digest.test.ts` | H2/H3 section 切分；含關鍵詞 bullet 歸 facts/relations/timeline/openQuestions；超預算截斷順序正確 |
| `checks/broken-link.test.ts` | 1 壞 ref → 1 issue；多 type 同 slug 不誤刪；fix 寫 wiki_log 條目正確（kind/source/batch_id/snapshots） |
| `checks/orphan.test.ts` | 被頁引用 / 被章節引用 / 完全孤；title 與 alias 都命中；fix 為 undefined |
| `checks/alias-dup.test.ts` | 兩頁共用 alias → error；title 撞 alias → error；單頁多 alias 不算 |
| `checks/unrecorded.test.ts` | pre-filter 抓對話 / 稱呼語境；黑名單虛詞排除；已登錄名排除；mock LLM verify 回應 |
| `checks/wiki-contradict.test.ts` | digest-based input 結構；mock complete() → parse issues；超 budget 截頁進 unprocessed |
| `checks/wiki-vs-chapter.test.ts` | aliases 集合搜尋；最多 N 角色限制；excerpt 含 sourceExcerpt |
| `llm-fix.test.ts` | userDirection 空 vs 有填都能組 prompt；fix 套用寫 wiki_log + savePage 雙寫補償 |
| `lint/index.test.ts` | enabled flag 過濾；AbortSignal 中途取消；report.unprocessed 累積 |

### 手動驗收清單（整合）

1. 乾淨書 → Lint → 0 issue
2. 壞 relatedSlug（含跨 type 同 slug 測試）→ Lint → broken-link issue → 一鍵修 → 重 lint → 0；`wiki_log` 有 `source='lint:broken-link'` 條目
3. 兩頁共用 alias → Lint → alias-dup error（無 fix 按鈕）
4. 純孤頁 → Lint → info issue（無刪除按鈕）；點 chip 跳到該頁
5. entity 與章節年齡矛盾 → Lint → wiki-vs-chapter issue → 修改方向留白 → 生成建議 → apply → wiki_log 有 `source='lint:wikiVsChapter'` 條目；row 變灰；重 lint → 0
6. 未登錄人名「趙六」+ 對話標籤 → Lint → unrecorded warn；常見虛詞「突然」「眼前」不被抓出
7. Lint 中途取消 → 已完成項顯示、後續灰、標中途取消
8. LLM 返回 3 次 502 → 該 check 標失敗，其他結果仍展示
9. 取消勾「Wiki 內部矛盾」→ Lint 跳過該 check
10. 超 maxPagesPerTypeContradict → 超出頁進 `report.unprocessed` 顯示在 header

---

## 預估工作量

| 模組 | 預估 |
|------|------|
| `src/lib/lint/types.ts` + `digest.ts`（含 unit test） | ~2 tasks |
| `src/lib/lint/checks/` 4 structural + 1 hybrid + 2 LLM | ~4 tasks |
| `src/lib/lint/llm-fix.ts`（含 wiki_log 寫入補償） | ~1 task |
| `src/lib/lint/index.ts`（含 abort、unprocessed 收集） | ~1 task |
| `src/stores/lintStore.ts` | ~1 task |
| `src/components/lint/` (3 components) | ~3 tasks |
| Settings 擴充（LintPrefs deep-merge + 4 prompts + UI） | ~2 tasks |
| 手動驗收 | 1 sweep |
| **合計** | **~14 tasks** |
