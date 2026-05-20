# Consistency Lint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2.5 #3 一致性 Lint — 偵測並（部分）修復 wiki / 章節間的結構性與語意性不一致。

**Architecture:** 主入口 `lintBook()` 串行跑 6 個 LintCheck（4 結構 + 1 hybrid + 2 LLM batch），結果進記憶體 `LintReport`，UI 走 `LintReportModal`。所有 fix 走 `wiki_log` 補償寫入（與 Phase 2 wiki-ingest 一致）。

**Spec:** `docs/superpowers/specs/2026-05-19-consistency-lint-design.md`

**Tech Stack:** React 19 + TypeScript strict + Zustand 5 + Dexie 4 / Tauri SQLite + 既有 `complete()` LLM 通道 + 新增 vitest（單元測試用，僅針對演算法熱區）

---

## File Structure

| 檔 | 責任 |
|----|------|
| `src/lib/lint/types.ts` | 所有介面：LintCheck / LintIssue / LintReport / AutoFix / IssueTarget / WikiLintDigest / LintPrefs |
| `src/lib/lint/digest.ts` | rule-based markdown → WikiLintDigest |
| `src/lib/lint/checks/broken-link.ts` | ① structural |
| `src/lib/lint/checks/orphan.ts` | ② structural, info-only |
| `src/lib/lint/checks/alias-dup.ts` | ③ structural |
| `src/lib/lint/checks/unrecorded.ts` | ④ hybrid (pre-filter + LLM verify) |
| `src/lib/lint/checks/wiki-contradict.ts` | ⑤ LLM batch (per type, 用 digest) |
| `src/lib/lint/checks/wiki-vs-chapter.ts` | ⑥ LLM batch (per character, 用 aliases) |
| `src/lib/lint/llm-fix.ts` | 對單一 issue 召喚 LLM 修改建議 + 寫 wiki_log + savePage 補償 |
| `src/lib/lint/index.ts` | `lintBook()` 主入口 + abort + unprocessed |
| `src/stores/lintStore.ts` | currentReport / isRunning / progress / runLint / cancel / applyAutoFix / applyLlmFix / dismiss |
| `src/components/lint/LintReportModal.tsx` | 主 modal（進行中 + 報告版） |
| `src/components/lint/LintIssueRow.tsx` | 單 issue row + inline 修改方向展開 |
| `src/components/lint/LintFixPreviewModal.tsx` | LLM diff preview |
| `src/lib/llm.ts` | （小改）`postToLLM` / `postToLLMWithRetry` 加可選 `signal: AbortSignal` |
| `src/stores/settingsStore.ts` | （改）AIPromptPrefs 加 4 個 lint 模板；新增 LintPrefs + setLintPrefs 用 deep merge |
| `src/lib/prompt-defaults.ts` | （改）加 4 個 lint 預設模板 |
| `src/components/Toolbar.tsx` 或 設定 Modal | （改）Wiki 設定加 Lint 區段；AI 提示詞加 sub-tabs |
| `src/components/wiki/WikiPanel.tsx` | （改）頂部加 🔍 執行 Lint 按鈕 |
| `vite.config.ts` | （改）加 test config |
| `package.json` | （改）加 vitest devDep |

---

## Task 1: Vitest setup + LLM signal pass-through

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/lib/llm.ts`
- Create: `src/lib/lint/__sanity__.test.ts`（首測，跑完即刪）

### Why

專案目前沒有 test infra。先裝 vitest，並把 `postToLLM` / `postToLLMWithRetry` 加上可選 `signal` 參數（lint cancel 會用）。

- [ ] **Step 1: 加 vitest devDep**

```bash
npm install -D vitest@^3.2.0 jsdom@^25.0.0 @vitest/coverage-v8@^3.2.0
```

- [ ] **Step 2: 加 test script 進 package.json**

修改 `package.json` 的 `scripts`，加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 在 vite.config.ts 加 test config**

`vite.config.ts` 頂部 `import { defineConfig } from 'vite'` 改為 `import { defineConfig } from 'vitest/config'`，然後在 `defineConfig({ ... })` 內加：

```ts
test: {
  environment: 'jsdom',
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  globals: false,
},
```

- [ ] **Step 4: 寫一個 sanity test 確認 vitest 跑得起來**

Create `src/lib/lint/__sanity__.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 跑 sanity test 確認通過**

```bash
npm test
```

Expected:
```
✓ src/lib/lint/__sanity__.test.ts (1)
  ✓ vitest sanity > runs
Test Files  1 passed (1)
```

- [ ] **Step 6: 刪除 sanity test**

```bash
rm src/lib/lint/__sanity__.test.ts
```

- [ ] **Step 7: `postToLLM` / `postToLLMWithRetry` 加 signal 參數**

修改 `src/lib/llm.ts`：

`postToLLM` 簽章改為：
```ts
async function postToLLM(
  targetUrl: string,
  apiKey: string,
  body: unknown,
  sendAuthorization: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sendAuthorization) headers['Authorization'] = `Bearer ${apiKey}`;

  if (isTauri()) {
    return fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
  }
  headers['x-proxy-target'] = targetUrl;
  return fetch('/llm-proxy', { method: 'POST', headers, body: JSON.stringify(body), signal });
}
```

`postToLLMWithRetry` 簽章加 `signal?: AbortSignal`，傳給內部 `postToLLM(... , signal)`，並在重試 sleep 前檢查 `signal?.aborted`：

```ts
async function postToLLMWithRetry(
  targetUrl: string, apiKey: string, body: unknown, sendAuthorization: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const resp = await postToLLM(targetUrl, apiKey, body, sendAuthorization, signal);
      if (resp.ok || !TRANSIENT_STATUSES.has(resp.status) || attempt === RETRY_DELAYS_MS.length) {
        return resp;
      }
      const errText = await resp.text();
      console.warn(`[llm] transient ${resp.status} on attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}: ${errText.slice(0, 200)}`);
      lastError = new Error(`LLM API error ${resp.status}: ${errText}`);
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') throw e;
      if (attempt === RETRY_DELAYS_MS.length) throw e;
      console.warn(`[llm] network error on attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}:`, e);
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  throw lastError ?? new Error('unreachable');
}
```

`complete()` 簽章加 `signal?: AbortSignal`，傳給 `completeOpenAICompat` / `completeGoogle`，這兩個 helper 也加 signal 參數傳給 `postToLLMWithRetry`：

```ts
export async function complete(prompt: string, options?: GenerationOptions, signal?: AbortSignal): Promise<string> {
  // ... 原邏輯，把 signal 往下傳
}
```

兩個 helper：
```ts
async function completeOpenAICompat(cfg, prompt, options, signal?: AbortSignal): Promise<string> {
  // ...
  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, { ... }, true, signal);
  // ...
}

async function completeGoogle(cfg, prompt, options, signal?: AbortSignal): Promise<string> {
  // ...
  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, body, false, signal);
  // ...
}
```

- [ ] **Step 8: build 跑得過**

```bash
npm run build
```

Expected: 無 type error。

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/lib/llm.ts
git commit -m "chore: 加 vitest + complete() 支援 AbortSignal

- 加 vitest + jsdom + @vitest/coverage-v8 devDeps
- vite.config.ts 加 test config (jsdom env)
- postToLLM / postToLLMWithRetry / complete() 加可選 signal 參數
  供 Phase 2.5 lint 取消用"
```

---

## Task 2: types + digest.ts + tests

**Files:**
- Create: `src/lib/lint/types.ts`
- Create: `src/lib/lint/digest.ts`
- Create: `src/lib/lint/digest.test.ts`

### Why

Lint 模組的型別與 markdown digest parser 是後續所有 check 的基礎。digest 是 rule-based 解析、純函式、好測，先建立可信的基底。

- [ ] **Step 1: 寫 types.ts**

Create `src/lib/lint/types.ts`:
```ts
import type { Chapter, Character, WikiPage, WikiPageType } from '../../types';
import type { AIPromptPrefs } from '../../stores/settingsStore';

export type LintCheckKind = 'structural' | 'hybrid' | 'llm';

export interface IssueTarget {
  kind: 'wikiPage' | 'chapter';
  id: string;
  /** 顯示用標籤，例如 "entity/wang-da" 或 "ch-3 王大入山" */
  label: string;
  /** 章節用：含關鍵詞前後 40 字節錄 */
  sourceExcerpt?: string;
}

export type AutoFix = {
  kind: 'removeRelatedSlug';
  pageId: string;
  target: { type: WikiPageType; slug: string };
};

export interface LlmFixHint {
  kind: 'llm';
}

export type IssueStatus = 'open' | 'dismissed' | 'applied';

export interface LintIssue {
  id: string;
  checkId: string;
  severity: 'error' | 'warn' | 'info';
  status: IssueStatus;
  title: string;
  detail: string;
  targets: IssueTarget[];
  fix?: AutoFix | LlmFixHint;
  /** LLM 類修改建議的原始 markdown（套用前留存供 diff） */
  fixOriginalMarkdown?: string;
}

export interface LintReport {
  bookId: string;
  ranAt: number;
  /** 共用 batch_id，所有 lint fix 的 wiki_log 條目共用，便於日後 undo 整批 */
  lintBatchId: string;
  issues: LintIssue[];
  failedChecks: Array<{ checkId: string; error: string }>;
  unprocessed: Array<{ checkId: string; reason: string }>;
  cancelled: boolean;
}

export interface LintPrefs {
  checks: {
    brokenLink: boolean;
    orphan: boolean;
    aliasDup: boolean;
    unrecorded: boolean;
    wikiContradict: boolean;
    wikiVsChapter: boolean;
  };
  maxPagesPerTypeContradict: number;
  maxCharactersVsChapter: number;
  maxChapterExcerptsPerChar: number;
  maxUnrecordedCandidates: number;
}

export const DEFAULT_LINT_PREFS: LintPrefs = {
  checks: {
    brokenLink: true,
    orphan: true,
    aliasDup: true,
    unrecorded: true,
    wikiContradict: true,
    wikiVsChapter: true,
  },
  maxPagesPerTypeContradict: 20,
  maxCharactersVsChapter: 10,
  maxChapterExcerptsPerChar: 3,
  maxUnrecordedCandidates: 30,
};

export interface LintContext {
  bookId: string;
  pages: WikiPage[];
  characters: Character[];
  chapters: Chapter[];
  prefs: LintPrefs;
  aiPrompts: AIPromptPrefs;
  lintBatchId: string;
  signal?: AbortSignal;
}

export interface LintCheck {
  id: string;
  label: string;
  kind: LintCheckKind;
  run(ctx: LintContext): Promise<{
    issues: LintIssue[];
    unprocessed?: Array<{ reason: string }>;
  }>;
}

export interface WikiLintDigest {
  pageId: string;
  type: WikiPageType;
  slug: string;
  title: string;
  aliases: string[];
  description: string;
  /** 含「年齡 / 武器 / 能力 / 限制 / 代價 ...」等關鍵詞的 bullet / 句 */
  facts: string[];
  /** 含「父親 / 師父 / → / 屬於 ...」等關係的句 */
  relations: string[];
  /** 含「第 N 章 / 之前 / 之後 / 最終 ...」等時間線的句 */
  timeline: string[];
  /** 含「不明 / 未知 / 之謎 / 是否 / 伏筆 ...」等未解的句 */
  openQuestions: string[];
}
```

- [ ] **Step 2: 寫 digest 測試（先紅）**

Create `src/lib/lint/digest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildDigest, DIGEST_KEYWORDS } from './digest';
import type { WikiPage } from '../../types';

const pageBase: WikiPage = {
  id: 'p1', bookId: 'b1', type: 'entity', slug: 'wang-da',
  title: '王大', aliases: ['老王'], relatedSlugs: [],
  description: '主角，劍客',
  contentMd: '',
  createdAt: 0, updatedAt: 0,
};

describe('buildDigest', () => {
  it('keeps title, aliases, description', () => {
    const d = buildDigest({ ...pageBase, contentMd: '隨意內容' });
    expect(d.title).toBe('王大');
    expect(d.aliases).toEqual(['老王']);
    expect(d.description).toBe('主角，劍客');
  });

  it('fills description from first sentence when page.description empty', () => {
    const d = buildDigest({ ...pageBase, description: '', contentMd: '王大是劍客。後來他下山。' });
    expect(d.description).toBe('王大是劍客');
  });

  it('extracts facts from bullets with fact keywords', () => {
    const md = `
## 基本資料

- 年齡：35 歲
- 武器：長劍
- 髮色：黑色
`.trim();
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.facts).toContain('年齡：35 歲');
    expect(d.facts).toContain('武器：長劍');
    // 髮色不在關鍵詞 → 不入 facts
    expect(d.facts.find((f) => f.includes('髮色'))).toBeUndefined();
  });

  it('extracts relations from sentences with relation keywords', () => {
    const md = `王大的師父是張三。\n王大與李四是朋友。`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.relations.length).toBeGreaterThanOrEqual(2);
    expect(d.relations.join('\n')).toMatch(/師父/);
    expect(d.relations.join('\n')).toMatch(/朋友/);
  });

  it('extracts timeline from sentences with chapter / time markers', () => {
    const md = `第 3 章拜師。多年後成為長老。`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.timeline.length).toBe(2);
  });

  it('extracts openQuestions from sentences with mystery markers', () => {
    const md = `他的真名不明。\n是否還活著仍是之謎。`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.openQuestions.length).toBe(2);
  });

  it('truncates in order: openQuestions → timeline → relations → facts', () => {
    // 構造一個會超 600 字的 digest
    const longBullets = Array.from({ length: 50 }).map((_, i) => `- 年齡相關事實 ${i}`).join('\n');
    const md = `## facts\n${longBullets}\n\n## relations\n${
      Array.from({ length: 20 }).map((_, i) => `他的師父是${i}號人物`).join('。')
    }`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    // openQuestions 應該先被截光
    expect(d.openQuestions.length).toBe(0);
    // facts 至少還保留一些
    expect(d.facts.length).toBeGreaterThan(0);
  });

  it('exposes DIGEST_KEYWORDS for transparency', () => {
    expect(DIGEST_KEYWORDS.facts).toContain('年齡');
    expect(DIGEST_KEYWORDS.relations).toContain('師父');
  });
});
```

- [ ] **Step 3: 跑測試確認 fail**

```bash
npm test -- digest.test.ts
```

Expected: FAIL — `Cannot find module './digest'`

- [ ] **Step 4: 實作 digest.ts**

Create `src/lib/lint/digest.ts`:
```ts
import type { WikiPage } from '../../types';
import type { WikiLintDigest } from './types';

export const DIGEST_KEYWORDS = {
  facts: [
    '年齡', '身份', '性別', '種族', '武器', '能力', '傷勢', '死亡', '失蹤',
    '真名', '秘密', '弱點', '限制', '代價', '規則', '出身', '身高', '體重',
  ],
  relations: [
    '父親', '母親', '師父', '徒弟', '兄弟', '姐妹', '朋友', '敵人',
    '屬於', '隸屬', '效忠', '→',
  ],
  timeline: [
    '之前', '之後', '最終', '當時', '隨後', '多年後', '從此', '日後',
  ],
  openQuestions: [
    '不明', '未知', '待解', '之謎', '為何', '是否', '留下伏筆', '暗示',
  ],
} as const;

const SENTENCE_DELIMITERS = /[。！？\n]+/;

/** 提取 bullet / 句子內容，去除前後空白與 markdown 標記 */
function extractItems(md: string): string[] {
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    // bullet
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }
    // 跳過 heading
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^>/.test(line)) continue;
    // 一般段落 → 切句
    for (const s of line.split(SENTENCE_DELIMITERS)) {
      const t = s.trim();
      if (t) items.push(t);
    }
  }
  return items;
}

/** 第 N 章 / chapter X 也算 timeline 關鍵詞 */
function isTimelineItem(item: string): boolean {
  if (/第\s*[一二三四五六七八九十百千0-9]+\s*章/.test(item)) return true;
  return DIGEST_KEYWORDS.timeline.some((k) => item.includes(k));
}

function categorizeItem(item: string): keyof Omit<WikiLintDigest, 'pageId' | 'type' | 'slug' | 'title' | 'aliases' | 'description'> | null {
  // openQuestions 優先，因為「為何」「是否」很容易其他也命中
  if (DIGEST_KEYWORDS.openQuestions.some((k) => item.includes(k))) return 'openQuestions';
  if (DIGEST_KEYWORDS.relations.some((k) => item.includes(k))) return 'relations';
  if (isTimelineItem(item)) return 'timeline';
  if (DIGEST_KEYWORDS.facts.some((k) => item.includes(k))) return 'facts';
  return null;
}

const DIGEST_BUDGET_CHARS = 600;

function totalLen(d: WikiLintDigest): number {
  return d.description.length
    + d.facts.join('').length
    + d.relations.join('').length
    + d.timeline.join('').length
    + d.openQuestions.join('').length;
}

/** 超預算時依 openQuestions → timeline → relations → facts 順序截尾 */
function truncate(d: WikiLintDigest): WikiLintDigest {
  const order: Array<keyof Pick<WikiLintDigest, 'openQuestions' | 'timeline' | 'relations' | 'facts'>> = [
    'openQuestions', 'timeline', 'relations', 'facts',
  ];
  for (const field of order) {
    while (totalLen(d) > DIGEST_BUDGET_CHARS && d[field].length > 0) {
      d[field].pop();
    }
    if (totalLen(d) <= DIGEST_BUDGET_CHARS) break;
  }
  return d;
}

export function buildDigest(page: WikiPage): WikiLintDigest {
  const items = extractItems(page.contentMd);
  const digest: WikiLintDigest = {
    pageId: page.id,
    type: page.type,
    slug: page.slug,
    title: page.title,
    aliases: [...page.aliases],
    description: page.description || '',
    facts: [],
    relations: [],
    timeline: [],
    openQuestions: [],
  };

  // 從第一句填 description（若 page.description 為空）
  if (!digest.description) {
    const firstSentence = items[0] ?? '';
    digest.description = firstSentence;
  }

  for (const item of items) {
    const cat = categorizeItem(item);
    if (!cat) continue;
    digest[cat].push(item);
  }

  return truncate(digest);
}
```

- [ ] **Step 5: 跑測試確認通過**

```bash
npm test -- digest.test.ts
```

Expected: PASS（所有 7 個 it 通過）。

- [ ] **Step 6: build 跑得過**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/lint/types.ts src/lib/lint/digest.ts src/lib/lint/digest.test.ts
git commit -m "feat(lint): 加 lint types + WikiLintDigest markdown parser

- src/lib/lint/types.ts：LintCheck / LintIssue / LintReport / LintPrefs / WikiLintDigest
- src/lib/lint/digest.ts：rule-based markdown → digest
  - 分類詞典：facts / relations / timeline / openQuestions
  - 超預算 (>600 字) 時依 openQuestions → timeline → relations → facts 順序截尾
- 完整 unit test (7 cases) cover 詞典命中、空 description fallback、截斷順序"
```

---

## Task 3: settingsStore + prompt-defaults 擴充

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/lib/prompt-defaults.ts`

### Why

LLM 類 check 需要從 settings 讀 prompt 模板；後面的 check 都依賴這層擴充。先一次到位，後續任務直接用。

- [ ] **Step 1: prompt-defaults.ts 加 4 個 lint 模板**

在 `src/lib/prompt-defaults.ts` 末尾加：
```ts
export const DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE = `你是小說的角色清點助手。下面是程式預先掃出的「可能未登錄角色」候選名單，連同章節節錄。

請判斷每個候選是否為「應該記錄」的角色（曾經有名有姓、有戲份或敘事相關）。普通虛詞、形容詞、地名、概念名請排除。

已登錄角色名：
{{knownNamesList}}

候選清單（JSON）：
{{candidatesJson}}

請只輸出嚴格 JSON：
{
  "newCharacters": [
    { "name": "<候選名>", "isMainEnough": true | false, "chapterRefs": ["<chapterId>"] }
  ],
  "rejected": ["<被排除的候選名>", ...]
}
`;

export const DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE = `你是小說資料一致性檢查員。下面是同一類 wiki 頁的精簡 digest，請找出彼此衝突的事實（例如角色年齡 / 武器 / 能力、概念規則 / 限制、時間線等）。

Page type：{{pageType}}

頁面 digest（JSON array）：
{{digestsJson}}

請只輸出嚴格 JSON：
{
  "conflicts": [
    {
      "pages": ["<type/slug>", "<type/slug>"],
      "field": "<衝突欄位名，例：年齡 / 武器 / 規則>",
      "detail": "<具體說明 A 頁說 X、B 頁說 Y>"
    }
  ]
}

若沒有任何衝突，輸出 {"conflicts": []}。
`;

export const DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE = `你是小說資料一致性檢查員。檢查 wiki 上的角色設定與小說章節敘述是否衝突。

角色：{{characterName}}
別名集合：{{aliasesList}}

Wiki 全文：
{{wikiContent}}

相關章節節錄（JSON array，每筆含 chapterId 與 excerpt）：
{{chapterExcerptsJson}}

請找出 wiki 與章節敘述事實衝突的地方（例如「wiki 寫精通劍術，但章節寫從未握劍」）。

請只輸出嚴格 JSON：
{
  "conflicts": [
    {
      "field": "<衝突欄位名>",
      "wikiSays": "<wiki 的說法>",
      "chapterSays": "<章節的說法>",
      "chapterRefs": ["<chapterId>"]
    }
  ]
}

若沒有任何衝突，輸出 {"conflicts": []}。
`;

export const DEFAULT_LINT_FIX_SUGGEST_TEMPLATE = `你是 wiki 維護助手。下面有一個一致性 issue，請修改原 wiki 頁 markdown 來解決。

Issue 標題：{{issueTitle}}
Issue 細節：{{issueDetail}}

使用者偏好的修改方向（可能為空，空則由你自行判斷）：
{{userDirection}}

原始 markdown：
---
{{originalMarkdown}}
---

請直接輸出修改後的完整 markdown（保留原檔結構：H1 標題、Aliases、Related blockquote、各 section）。不要包 \`\`\`markdown\` 圍欄，不要解釋。
`;
```

- [ ] **Step 2: settingsStore.ts 擴充 AIPromptPrefs + LintPrefs**

修改 `src/stores/settingsStore.ts`：

頂部 import 增加 4 個 lint 預設常數 + LintPrefs / DEFAULT_LINT_PREFS：
```ts
import {
  DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  // ... 既有 imports
  DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
} from '../lib/prompt-defaults';
import { DEFAULT_LINT_PREFS, type LintPrefs } from '../lib/lint/types';
```

把 `AIPromptPrefs` 加 4 個欄位：
```ts
export interface AIPromptPrefs {
  // ... 既有欄位
  wikiQueryAnswerTemplate: string;
  /** Lint #1 未登錄角色 verify */
  lintUnrecordedVerifyTemplate: string;
  /** Lint #2 wiki 內部矛盾 */
  lintWikiContradictTemplate: string;
  /** Lint #3 wiki vs 章節 */
  lintWikiVsChapterTemplate: string;
  /** Lint #4 修改建議 */
  lintFixSuggestTemplate: string;
}
```

`DEFAULT_AI_PROMPTS` 加對應 4 個：
```ts
const DEFAULT_AI_PROMPTS: AIPromptPrefs = {
  // ... 既有
  wikiQueryAnswerTemplate: DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  lintUnrecordedVerifyTemplate: DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  lintWikiContradictTemplate: DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  lintWikiVsChapterTemplate: DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  lintFixSuggestTemplate: DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
};
```

加 `LintPrefs` 與 `setLintPrefs` 到 `SettingsState`：
```ts
interface SettingsState {
  // ... 既有欄位
  wikiPrefs: WikiPrefs;
  lintPrefs: LintPrefs;
  // ... setters
  setWikiPrefs: (prefs: Partial<WikiPrefs>) => void;
  setLintPrefs: (prefs: DeepPartial<LintPrefs>) => void;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
```

加 deep merge helper 與 init / setter：
```ts
function deepMergeLintPrefs(base: LintPrefs, patch: DeepPartial<LintPrefs>): LintPrefs {
  return {
    checks: { ...base.checks, ...(patch.checks ?? {}) },
    maxPagesPerTypeContradict: patch.maxPagesPerTypeContradict ?? base.maxPagesPerTypeContradict,
    maxCharactersVsChapter: patch.maxCharactersVsChapter ?? base.maxCharactersVsChapter,
    maxChapterExcerptsPerChar: patch.maxChapterExcerptsPerChar ?? base.maxChapterExcerptsPerChar,
    maxUnrecordedCandidates: patch.maxUnrecordedCandidates ?? base.maxUnrecordedCandidates,
  };
}
```

在 `create()` 的 state 加：
```ts
lintPrefs: { ...DEFAULT_LINT_PREFS },
setLintPrefs: (patch) =>
  set((state) => ({ lintPrefs: deepMergeLintPrefs(state.lintPrefs, patch) })),
```

`persist.merge` 補：
```ts
merge: (persisted, current) => {
  const p = (persisted ?? {}) as Partial<SettingsState>;
  return {
    ...current,
    ...p,
    wikiPrefs: { ...DEFAULT_WIKI_PREFS, ...(p.wikiPrefs ?? {}) },
    lintPrefs: deepMergeLintPrefs(DEFAULT_LINT_PREFS, p.lintPrefs ?? {}),
    aiPrompts: { ...DEFAULT_AI_PROMPTS, ...(p.aiPrompts ?? {}) },
  };
},
```

- [ ] **Step 3: build 跑得過**

```bash
npm run build
```

Expected: 無 type error。

- [ ] **Step 4: Commit**

```bash
git add src/stores/settingsStore.ts src/lib/prompt-defaults.ts
git commit -m "feat(settings): 加 LintPrefs + 4 個 lint prompt 模板

- AIPromptPrefs 加 lintUnrecordedVerify / lintWikiContradict /
  lintWikiVsChapter / lintFixSuggest 4 個模板
- 新增 LintPrefs 介面與 setLintPrefs (用 deep merge 避免 nested
  checks 物件被覆蓋)
- persist.merge 補齊舊使用者預設值
- prompt-defaults.ts 補 4 個對應預設值"
```

---

## Task 4: checks/broken-link.ts

**Files:**
- Create: `src/lib/lint/checks/broken-link.ts`

### Why

最簡單的 structural check：掃 relatedSlugs 找指向不存在頁的 ref。需要 `removeRelatedSlug` AutoFix（fix 寫入邏輯在 Task 12 lintStore 統一寫，這裡只負責偵測）。

- [ ] **Step 1: 寫 broken-link.ts**

Create `src/lib/lint/checks/broken-link.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';

export const brokenLinkCheck: LintCheck = {
  id: 'broken-link',
  label: 'Broken link',
  kind: 'structural',
  async run(ctx: LintContext) {
    const pageMap = new Map<string, true>();
    for (const p of ctx.pages) pageMap.set(`${p.type}/${p.slug}`, true);

    const issues: LintIssue[] = [];
    for (const page of ctx.pages) {
      for (const rel of page.relatedSlugs) {
        const key = `${rel.type}/${rel.slug}`;
        if (pageMap.has(key)) continue;
        issues.push({
          id: uuid(),
          checkId: 'broken-link',
          severity: 'warn',
          status: 'open',
          title: `${page.type}/${page.slug} 的 relatedSlugs 指向不存在的 ${key}`,
          detail: `頁 ${page.type}/${page.slug}（${page.title}）的 relatedSlugs 引用了 ${key}，但該頁不存在。`,
          targets: [
            { kind: 'wikiPage', id: page.id, label: `${page.type}/${page.slug}` },
          ],
          fix: { kind: 'removeRelatedSlug', pageId: page.id, target: { type: rel.type, slug: rel.slug } },
        });
      }
    }
    return { issues };
  },
};
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/lint/checks/broken-link.ts
git commit -m "feat(lint): broken-link structural check

偵測 wiki_pages[].relatedSlugs 指向不存在頁的 ref；產生 AutoFix
removeRelatedSlug { pageId, target: {type, slug} } 供 lintStore 套用。"
```

---

## Task 5: checks/orphan.ts

**Files:**
- Create: `src/lib/lint/checks/orphan.ts`

### Why

孤頁是 info-only — 偵測沒有任何引用的頁，僅報告 + 跳轉，**不提供刪除**（codex review 採納）。

- [ ] **Step 1: 寫 orphan.ts**

Create `src/lib/lint/checks/orphan.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';

export const orphanCheck: LintCheck = {
  id: 'orphan',
  label: '孤頁',
  kind: 'structural',
  async run(ctx: LintContext) {
    // 反向引用集：所有 page 的 relatedSlugs 合集
    const reverseRef = new Set<string>();
    for (const p of ctx.pages) {
      for (const r of p.relatedSlugs) reverseRef.add(`${r.type}/${r.slug}`);
    }

    // 預先合併所有章節 content（一次性掃描，比每頁掃 N 次快）
    const allChapterContent = ctx.chapters.map((c) => c.content).join('\n---\n');

    const issues: LintIssue[] = [];
    for (const page of ctx.pages) {
      const key = `${page.type}/${page.slug}`;
      if (reverseRef.has(key)) continue;

      // 看 title 或任何 alias 是否在章節 content 出現
      const needles = [page.title, ...page.aliases].filter((n) => n && n.length >= 2);
      const mentionedInChapter = needles.some((n) => allChapterContent.includes(n));
      if (mentionedInChapter) continue;

      issues.push({
        id: uuid(),
        checkId: 'orphan',
        severity: 'info',
        status: 'open',
        title: `${key} 沒被任何頁或章節引用`,
        detail: `頁 ${key}（${page.title}）的 title 與 aliases 都未在其他 wiki 頁的 relatedSlugs、也未在任何章節正文中出現。可能是未登場的伏筆、也可能是廢頁；請人工判斷。`,
        targets: [
          { kind: 'wikiPage', id: page.id, label: key },
        ],
        // 無 fix（codex review：孤頁不一鍵刪）
      });
    }
    return { issues };
  },
};
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/lint/checks/orphan.ts
git commit -m "feat(lint): orphan structural check (info-only)

偵測沒有任何 wiki 反向引用、也未在任何章節 content 出現 (title /
alias) 的 wiki 頁；僅 info 嚴重度，不提供刪除 fix（codex review
採納：長篇小說常有未登場伏筆頁，刪除太激進）。"
```

---

## Task 6: checks/alias-dup.ts

**Files:**
- Create: `src/lib/lint/checks/alias-dup.ts`

### Why

純結構性檢查；多頁共用 alias 會造成 wiki-relevance / wiki-loader 比對結果不確定。

- [ ] **Step 1: 寫 alias-dup.ts**

Create `src/lib/lint/checks/alias-dup.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';

export const aliasDupCheck: LintCheck = {
  id: 'alias-dup',
  label: '別名重複',
  kind: 'structural',
  async run(ctx: LintContext) {
    // alias / title → 出現於哪些頁
    const map = new Map<string, Array<{ pageId: string; label: string }>>();
    for (const p of ctx.pages) {
      const keys = [p.title, ...p.aliases];
      for (const k of keys) {
        if (!k) continue;
        const list = map.get(k) ?? [];
        list.push({ pageId: p.id, label: `${p.type}/${p.slug}` });
        map.set(k, list);
      }
    }

    const issues: LintIssue[] = [];
    for (const [name, owners] of map.entries()) {
      // 排除同頁多 alias 撞自己 title 的情況：取不同 pageId
      const uniquePages = new Map<string, string>();
      for (const o of owners) uniquePages.set(o.pageId, o.label);
      if (uniquePages.size < 2) continue;
      const labels = [...uniquePages.values()];
      issues.push({
        id: uuid(),
        checkId: 'alias-dup',
        severity: 'error',
        status: 'open',
        title: `「${name}」同時是 ${labels.join('、')} 的別名或標題`,
        detail: `${labels.length} 個 wiki 頁共用名稱「${name}」。Wiki ingest 與 relevance filter 會無法正確區分；請人工合併或調整其中一頁的別名。`,
        targets: [...uniquePages.entries()].map(([pageId, label]) => ({
          kind: 'wikiPage' as const, id: pageId, label,
        })),
        // 無 fix（純報告）
      });
    }
    return { issues };
  },
};
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/lint/checks/alias-dup.ts
git commit -m "feat(lint): alias-dup structural check

偵測多頁共用 alias / title。輸出 error 嚴重度但不提供 fix
（純報告 + 跳轉，需人工合併）。"
```

---

## Task 7: checks/unrecorded.ts (hybrid) + pre-filter test

**Files:**
- Create: `src/lib/lint/checks/unrecorded.ts`
- Create: `src/lib/lint/checks/unrecorded.test.ts`

### Why

兩階段：(1) structural pre-filter 用上下文語境抓候選；(2) 1 個 LLM call 給 LLM 一張清單問「哪些真是漏記的角色」。pre-filter 部分有測試，避免「突然」「眼前」這類常見虛詞炸 issue。

- [ ] **Step 1: 寫 pre-filter 測試（先紅）**

Create `src/lib/lint/checks/unrecorded.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findCandidates } from './unrecorded';
import type { WikiPage, Character } from '../../../types';

const emptyPages: WikiPage[] = [];
const emptyChars: Character[] = [];

function ch(id: string, content: string) {
  return {
    id, projectId: 'b1', order: 0, title: '',
    targetWords: null, beat: '', points: '', content,
    referenceChapterId: null,
    wikiSyncedAt: null, wikiSyncedHash: null, wikiSyncStatus: 'unsynced' as const,
    createdAt: 0, updatedAt: 0,
  };
}

describe('findCandidates (unrecorded pre-filter)', () => {
  it('catches names in dialogue tags', () => {
    const c = ch('c1', '「滾開！」趙六說。然後王大笑了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).toContain('趙六');
    expect(names).toContain('王大');
  });

  it('catches names with honorific context', () => {
    const c = ch('c1', '一位姓孫的長老走進來。叫做林七的弟子站起身。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    // 「孫」單字不夠 2 字，預期不抓；「林七」應抓
    expect(names).toContain('林七');
  });

  it('excludes common stopwords', () => {
    const c = ch('c1', '突然眼前一黑。這時他想起了。突然他又站起來。眼前那一刻。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).not.toContain('突然');
    expect(names).not.toContain('眼前');
    expect(names).not.toContain('這時');
  });

  it('excludes names already in characters table', () => {
    const c = ch('c1', '「滾開！」趙六說。');
    const chars: Character[] = [{
      id: 'ch1', projectId: 'b1', name: '趙六', gender: '', age: '', race: '',
      personality: '', background: '', appearance: '', abilities: '',
      relations: '', arc: '', createdAt: 0,
    }];
    const out = findCandidates([c], emptyPages, chars);
    expect(out.find((o) => o.name === '趙六')).toBeUndefined();
  });

  it('excludes names already in wiki entity pages', () => {
    const c = ch('c1', '「滾開！」趙六說。');
    const pages: WikiPage[] = [{
      id: 'p1', bookId: 'b1', type: 'entity', slug: 'zhao-liu',
      title: '趙六', aliases: [], relatedSlugs: [], description: '',
      contentMd: '', createdAt: 0, updatedAt: 0,
    }];
    const out = findCandidates([c], pages, emptyChars);
    expect(out.find((o) => o.name === '趙六')).toBeUndefined();
  });

  it('requires freq ≥3 when only dialogue context匹配一次', () => {
    // 「林七」只出現一次、沒在對話標籤附近 → 應被頻率門檻排除
    const c = ch('c1', '某天林七出門了。沒人知道他去哪。');
    const out = findCandidates([c], emptyPages, emptyChars);
    expect(out.find((o) => o.name === '林七')).toBeUndefined();
  });

  it('returns excerpts containing the name', () => {
    const c = ch('c1', '「滾開！」趙六說。後來趙六又回來了。最後趙六走了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const zhao = out.find((o) => o.name === '趙六');
    expect(zhao).toBeDefined();
    expect(zhao!.occurrences[0].chapterId).toBe('c1');
    expect(zhao!.occurrences[0].excerpt).toContain('趙六');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm test -- unrecorded.test.ts
```

Expected: FAIL — `Cannot find module './unrecorded'`

- [ ] **Step 3: 實作 unrecorded.ts**

Create `src/lib/lint/checks/unrecorded.ts`:
```ts
import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import type { Chapter, Character, WikiPage } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';

/** 黑名單：常見虛詞 / 通用詞，避免假陽性炸 */
const STOPWORDS = new Set<string>([
  '突然', '這時', '此時', '當下', '眼前', '不能', '不行', '不要', '可以',
  '可能', '應該', '已經', '依然', '仍然', '繼續', '主人', '師父', '主公',
  '師兄', '師姐', '師妹', '師弟', '長老', '弟子', '前輩', '晚輩',
  '一個', '兩個', '三個', '幾個', '所有', '其中', '其他', '所謂',
]);

/** 對話標籤動詞 / 稱呼語境 */
const DIALOGUE_VERBS = ['說', '問', '答', '道', '喊', '叫', '吼', '笑', '哭', '怒', '呼', '罵'];
const NAME_PREFIX = ['叫做', '名為', '叫', '稱', '這位'];
const HONORIFICS = ['師兄', '師姐', '師妹', '師弟', '師父', '師娘', '姑娘', '公子', '長老', '大人', '先生', '夫人'];

const CHINESE_NAME_RE = /[一-龥]{2,4}/g;

export interface UnrecordedCandidate {
  name: string;
  occurrences: Array<{ chapterId: string; excerpt: string }>;
  freq: number;
}

interface MatchHit {
  chapterId: string;
  index: number;
  inContext: boolean;
}

function isInContext(content: string, name: string, index: number): boolean {
  const before = content.slice(Math.max(0, index - 8), index);
  const after = content.slice(index + name.length, index + name.length + 8);
  // 對話標籤：後面接動詞
  if (DIALOGUE_VERBS.some((v) => after.startsWith(v))) return true;
  // 對話標籤：「」+ 名字
  if (before.endsWith('」')) return true;
  // 稱呼語境：前綴
  if (NAME_PREFIX.some((p) => before.endsWith(p))) return true;
  // 稱呼語境：後綴
  if (HONORIFICS.some((h) => after.startsWith(h))) return true;
  return false;
}

export function findCandidates(
  chapters: Chapter[],
  pages: WikiPage[],
  characters: Character[],
): UnrecordedCandidate[] {
  // 已知名稱集合
  const known = new Set<string>();
  for (const c of characters) {
    if (c.name) known.add(c.name);
  }
  for (const p of pages) {
    if (p.type !== 'entity') continue;
    if (p.title) known.add(p.title);
    for (const a of p.aliases) known.add(a);
  }

  // name → hits
  const hitsByName = new Map<string, MatchHit[]>();
  for (const chapter of chapters) {
    const content = chapter.content;
    // 對每個 2-4 字長度都掃一遍
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= content.length - len; i++) {
        const name = content.slice(i, i + len);
        if (!/^[一-龥]+$/.test(name)) continue;
        if (STOPWORDS.has(name)) continue;
        if (known.has(name)) continue;
        const list = hitsByName.get(name) ?? [];
        list.push({ chapterId: chapter.id, index: i, inContext: isInContext(content, name, i) });
        hitsByName.set(name, list);
      }
    }
  }

  // 篩選：(a) 在語境中出現 ≥1 次  或  (b) 字頻 ≥3
  const candidates: UnrecordedCandidate[] = [];
  for (const [name, hits] of hitsByName.entries()) {
    const inContextCount = hits.filter((h) => h.inContext).length;
    const freq = hits.length;
    if (inContextCount === 0 && freq < 3) continue;

    // 額外保險：若名字是更長已知名稱的子字串就略過（e.g.「王大」是「王大山」子字串）
    let isSubstringOfKnown = false;
    for (const k of known) {
      if (k.length > name.length && k.includes(name)) { isSubstringOfKnown = true; break; }
    }
    if (isSubstringOfKnown) continue;

    // 收 occurrences（每章只取一個 excerpt，最多 2 章）
    const seenChapters = new Set<string>();
    const occurrences: UnrecordedCandidate['occurrences'] = [];
    for (const hit of hits) {
      if (seenChapters.has(hit.chapterId)) continue;
      seenChapters.add(hit.chapterId);
      const chapter = chapters.find((c) => c.id === hit.chapterId)!;
      const start = Math.max(0, hit.index - 40);
      const end = Math.min(chapter.content.length, hit.index + name.length + 40);
      occurrences.push({ chapterId: chapter.id, excerpt: chapter.content.slice(start, end) });
      if (occurrences.length >= 2) break;
    }
    candidates.push({ name, occurrences, freq });
  }

  // 排字頻降冪
  candidates.sort((a, b) => b.freq - a.freq);
  return candidates;
}

interface LlmVerifyResult {
  newCharacters: Array<{ name: string; isMainEnough: boolean; chapterRefs: string[] }>;
  rejected: string[];
}

function parseVerifyJson(raw: string): LlmVerifyResult {
  // 與 wiki-plan extractJson 同樣邏輯：去 fence、找 { ... }
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('LLM 回應不含 JSON');
  const json = JSON.parse(s.slice(start, end + 1));
  return {
    newCharacters: Array.isArray(json.newCharacters) ? json.newCharacters : [],
    rejected: Array.isArray(json.rejected) ? json.rejected : [],
  };
}

export const unrecordedCheck: LintCheck = {
  id: 'unrecorded',
  label: '未登錄角色',
  kind: 'hybrid',
  async run(ctx: LintContext) {
    const allCandidates = findCandidates(ctx.chapters, ctx.pages, ctx.characters);
    const cap = ctx.prefs.maxUnrecordedCandidates;
    const candidates = allCandidates.slice(0, cap);
    const unprocessed = allCandidates.length > cap
      ? [{ reason: `候選 ${allCandidates.length} 個，超出上限 ${cap}，未送 LLM 驗證的：${allCandidates.slice(cap).map((c) => c.name).join('、')}` }]
      : [];

    if (candidates.length === 0) return { issues: [], unprocessed };

    const knownNames = [
      ...ctx.characters.map((c) => c.name),
      ...ctx.pages.filter((p) => p.type === 'entity').map((p) => p.title),
    ].filter(Boolean);

    const prompt = renderTemplate(ctx.aiPrompts.lintUnrecordedVerifyTemplate, {
      knownNamesList: knownNames.join('、') || '(無)',
      candidatesJson: JSON.stringify(candidates, null, 2),
    });

    let raw: string;
    try {
      raw = await complete(prompt, { maxTokens: 2048 }, ctx.signal);
    } catch (e) {
      throw new Error(`未登錄角色 LLM verify 失敗：${(e as Error).message}`);
    }

    let parsed: LlmVerifyResult;
    try {
      parsed = parseVerifyJson(raw);
    } catch {
      // 重試 1 次
      raw = await complete(prompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 }, ctx.signal);
      parsed = parseVerifyJson(raw);
    }

    const issues: LintIssue[] = [];
    for (const nc of parsed.newCharacters) {
      const cand = candidates.find((c) => c.name === nc.name);
      if (!cand) continue;
      const targets: IssueTarget[] = cand.occurrences.map((o) => ({
        kind: 'chapter' as const,
        id: o.chapterId,
        label: `章節 ${ctx.chapters.find((c) => c.id === o.chapterId)?.title ?? o.chapterId.slice(0, 6)}`,
        sourceExcerpt: o.excerpt,
      }));
      issues.push({
        id: uuid(),
        checkId: 'unrecorded',
        severity: 'warn',
        status: 'open',
        title: `未登錄角色「${nc.name}」${nc.isMainEnough ? '（建議加入）' : '（次要）'}`,
        detail: `候選名稱「${nc.name}」出現 ${cand.freq} 次，未在 wiki entity 或 characters 表登錄。`,
        targets,
        fix: { kind: 'llm' },
      });
    }
    return { issues, unprocessed };
  },
};
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test -- unrecorded.test.ts
```

Expected: PASS（7 個 case 通過）。

- [ ] **Step 5: build 跑得過**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/checks/unrecorded.ts src/lib/lint/checks/unrecorded.test.ts
git commit -m "feat(lint): unrecorded hybrid check (pre-filter + LLM verify)

Pre-filter 階段（已測）：
- 2-4 中文字滑動窗
- 黑名單 30+ 個常見虛詞（突然/眼前/這時/...）
- 已知名稱排除（characters + entity titles/aliases）
- 篩選條件：(a) 在對話標籤/稱呼語境中 ≥1 次 或 (b) 字頻 ≥3
- 額外排除已知名稱的子字串

LLM verify 階段：
- 候選清單塞進 lintUnrecordedVerifyTemplate
- 期望 strict JSON：newCharacters + rejected
- JSON 解析失敗時補「請只輸出嚴格 JSON」重試 1 次
- 超 maxUnrecordedCandidates (預設 30) 時切尾，其餘進 unprocessed

7 個 unit test 涵蓋對話標籤、稱呼語境、stopwords、已登錄排除、
頻率門檻、excerpt 提取。"
```

---

## Task 8: checks/wiki-contradict.ts + JSON parser test

**Files:**
- Create: `src/lib/lint/checks/wiki-contradict.ts`
- Create: `src/lib/lint/checks/wiki-contradict.test.ts`

### Why

LLM batch check — 每個 page type 一次 call、輸入 digest 清單。要測 JSON parser 與超 budget 截尾。

- [ ] **Step 1: 寫 wiki-contradict test（先紅）**

Create `src/lib/lint/checks/wiki-contradict.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseContradictJson, wikiContradictCheck } from './wiki-contradict';
import type { LintContext } from '../types';
import { DEFAULT_LINT_PREFS } from '../types';
import {
  DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
} from '../../prompt-defaults';

// Mock LLM
vi.mock('../../llm', () => ({
  complete: vi.fn(),
}));
import { complete } from '../../llm';

describe('parseContradictJson', () => {
  it('parses straight JSON', () => {
    const raw = '{"conflicts":[{"pages":["entity/a","entity/b"],"field":"年齡","detail":"x"}]}';
    const out = parseContradictJson(raw);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].field).toBe('年齡');
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"conflicts":[]}\n```';
    expect(parseContradictJson(raw).conflicts).toEqual([]);
  });

  it('throws on garbage', () => {
    expect(() => parseContradictJson('no json here')).toThrow();
  });
});

function makeCtx(overrides?: Partial<LintContext>): LintContext {
  return {
    bookId: 'b1',
    pages: [],
    characters: [],
    chapters: [],
    prefs: { ...DEFAULT_LINT_PREFS },
    aiPrompts: {
      // 只填會用到的欄位；其餘走 cast
      lintWikiContradictTemplate: DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
    } as LintContext['aiPrompts'],
    lintBatchId: 'batch1',
    ...overrides,
  };
}

describe('wikiContradictCheck', () => {
  beforeEach(() => {
    (complete as ReturnType<typeof vi.fn>).mockReset();
  });

  it('returns no issues when 0 pages', async () => {
    const out = await wikiContradictCheck.run(makeCtx());
    expect(out.issues).toEqual([]);
  });

  it('truncates pages over maxPagesPerTypeContradict and tracks unprocessed', async () => {
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue('{"conflicts":[]}');
    const pages = Array.from({ length: 25 }).map((_, i) => ({
      id: `p${i}`, bookId: 'b1', type: 'entity' as const, slug: `s${i}`,
      title: `T${i}`, aliases: [], relatedSlugs: [], description: '',
      contentMd: '', createdAt: 0, updatedAt: i,
    }));
    const ctx = makeCtx({
      pages,
      prefs: { ...DEFAULT_LINT_PREFS, maxPagesPerTypeContradict: 10 },
    });
    const out = await wikiContradictCheck.run(ctx);
    expect(out.unprocessed?.some((u) => u.reason.includes('15'))).toBe(true);
  });

  it('produces issues from LLM conflicts', async () => {
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
      conflicts: [{
        pages: ['entity/a', 'entity/b'],
        field: '年齡',
        detail: 'a 35、b 28',
      }],
    }));
    const pages = [
      { id: 'pa', bookId: 'b1', type: 'entity' as const, slug: 'a', title: 'A', aliases: [], relatedSlugs: [], description: '', contentMd: '', createdAt: 0, updatedAt: 0 },
      { id: 'pb', bookId: 'b1', type: 'entity' as const, slug: 'b', title: 'B', aliases: [], relatedSlugs: [], description: '', contentMd: '', createdAt: 0, updatedAt: 0 },
    ];
    const out = await wikiContradictCheck.run(makeCtx({ pages }));
    expect(out.issues).toHaveLength(1);
    expect(out.issues[0].targets).toHaveLength(2);
    expect(out.issues[0].title).toContain('年齡');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm test -- wiki-contradict.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 實作 wiki-contradict.ts**

Create `src/lib/lint/checks/wiki-contradict.ts`:
```ts
import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import { buildDigest } from '../digest';
import type { WikiPage, WikiPageType } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';

export interface ContradictResult {
  conflicts: Array<{
    pages: string[];   // ["type/slug", ...]
    field: string;
    detail: string;
  }>;
}

export function parseContradictJson(raw: string): ContradictResult {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('LLM 回應不含 JSON');
  const j = JSON.parse(s.slice(start, end + 1));
  return { conflicts: Array.isArray(j.conflicts) ? j.conflicts : [] };
}

const ALL_TYPES: WikiPageType[] = ['entity', 'concept', 'summary', 'compare', 'synthesis'];

export const wikiContradictCheck: LintCheck = {
  id: 'wikiContradict',
  label: 'Wiki 內部矛盾',
  kind: 'llm',
  async run(ctx: LintContext) {
    const issues: LintIssue[] = [];
    const unprocessed: Array<{ reason: string }> = [];

    for (const type of ALL_TYPES) {
      const pagesOfType = ctx.pages.filter((p) => p.type === type);
      if (pagesOfType.length < 2) continue;   // <2 頁就沒矛盾可言

      const cap = ctx.prefs.maxPagesPerTypeContradict;
      const sorted = [...pagesOfType].sort((a, b) => b.updatedAt - a.updatedAt);
      const subset = sorted.slice(0, cap);
      if (sorted.length > cap) {
        unprocessed.push({
          reason: `${type}：共 ${sorted.length} 頁，僅檢查最近更新的 ${cap} 頁；剩 ${sorted.length - cap} 頁未檢查`,
        });
      }

      const digests = subset.map((p) => buildDigest(p));

      const prompt = renderTemplate(ctx.aiPrompts.lintWikiContradictTemplate, {
        pageType: type,
        digestsJson: JSON.stringify(digests, null, 2),
      });

      let raw: string;
      try {
        raw = await complete(prompt, { maxTokens: 2048 }, ctx.signal);
      } catch (e) {
        throw new Error(`Wiki 內部矛盾 LLM (${type}) 失敗：${(e as Error).message}`);
      }

      let parsed: ContradictResult;
      try {
        parsed = parseContradictJson(raw);
      } catch {
        raw = await complete(prompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 }, ctx.signal);
        parsed = parseContradictJson(raw);
      }

      const pageBySlug = new Map<string, WikiPage>();
      for (const p of subset) pageBySlug.set(`${p.type}/${p.slug}`, p);

      for (const c of parsed.conflicts) {
        const targets: IssueTarget[] = [];
        for (const ref of c.pages) {
          const p = pageBySlug.get(ref);
          if (!p) continue;
          targets.push({ kind: 'wikiPage', id: p.id, label: ref });
        }
        if (targets.length === 0) continue;
        issues.push({
          id: uuid(),
          checkId: 'wikiContradict',
          severity: 'error',
          status: 'open',
          title: `${targets.map((t) => t.label).join(' 與 ')} 的「${c.field}」欄位衝突`,
          detail: c.detail,
          targets,
          fix: { kind: 'llm' },
        });
      }
    }
    return { issues, unprocessed };
  },
};
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test -- wiki-contradict.test.ts
```

Expected: PASS

- [ ] **Step 5: build 跑得過**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/lint/checks/wiki-contradict.ts src/lib/lint/checks/wiki-contradict.test.ts
git commit -m "feat(lint): wiki-contradict LLM batch check (per page type)

- 每個 page type 一次 LLM call，輸入該 type 全部頁的 digest
- 超 maxPagesPerTypeContradict 時依 updatedAt 取最新 N 頁，其餘進
  report.unprocessed
- JSON 解析失敗補嚴格指示重試 1 次
- 解析 helper parseContradictJson 獨立 export 供測試
- Unit test 涵蓋：parseContradictJson 三種輸入、空頁短路、超 budget
  截尾追蹤、LLM 結果轉 LintIssue"
```

---

## Task 9: checks/wiki-vs-chapter.ts

**Files:**
- Create: `src/lib/lint/checks/wiki-vs-chapter.ts`

### Why

LLM batch check：每個主要角色一次 LLM call，輸入 wiki 全文 + 章節 aliases 搜尋節錄。沒有額外算法熱區（搜尋是字串 includes），不寫新 unit test，但 JSON 解析複用 Task 8 的 helper 形狀。

- [ ] **Step 1: 寫 wiki-vs-chapter.ts**

Create `src/lib/lint/checks/wiki-vs-chapter.ts`:
```ts
import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import type { Chapter, Character, WikiPage } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';

interface VsChapterResult {
  conflicts: Array<{
    field: string;
    wikiSays: string;
    chapterSays: string;
    chapterRefs: string[];
  }>;
}

function parseVsChapterJson(raw: string): VsChapterResult {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('LLM 回應不含 JSON');
  const j = JSON.parse(s.slice(start, end + 1));
  return { conflicts: Array.isArray(j.conflicts) ? j.conflicts : [] };
}

interface ChapterExcerpt {
  chapterId: string;
  excerpt: string;
}

function collectChapterExcerpts(
  chapters: Chapter[],
  aliases: string[],
  maxChapters: number,
): ChapterExcerpt[] {
  const out: ChapterExcerpt[] = [];
  for (const chapter of chapters) {
    if (out.length >= maxChapters) break;
    for (const alias of aliases) {
      const idx = chapter.content.indexOf(alias);
      if (idx < 0) continue;
      const start = Math.max(0, idx - 250);
      const end = Math.min(chapter.content.length, idx + alias.length + 250);
      out.push({ chapterId: chapter.id, excerpt: chapter.content.slice(start, end) });
      break;   // 每章只取第一個命中
    }
  }
  return out;
}

interface CharacterToCheck {
  character: Character;
  entityPage: WikiPage;
  aliases: string[];   // union of character + entity aliases
}

function selectCharactersToCheck(
  pages: WikiPage[],
  characters: Character[],
  cap: number,
): CharacterToCheck[] {
  const entityPages = pages.filter((p) => p.type === 'entity');
  const out: CharacterToCheck[] = [];
  for (const ch of characters) {
    if (!ch.name) continue;
    const entity = entityPages.find((p) =>
      p.title === ch.name || p.aliases.includes(ch.name) || p.slug === ch.name,
    );
    if (!entity) continue;

    const charAliasField = ch as unknown as { aliases?: string[] };
    const characterAliases = Array.isArray(charAliasField.aliases) ? charAliasField.aliases : [];

    const set = new Set<string>([
      ch.name, ...characterAliases, entity.title, ...entity.aliases,
    ]);
    out.push({
      character: ch,
      entityPage: entity,
      aliases: [...set].filter(Boolean),
    });
    if (out.length >= cap) break;
  }
  return out;
}

export const wikiVsChapterCheck: LintCheck = {
  id: 'wikiVsChapter',
  label: 'Wiki vs 章節事實衝突',
  kind: 'llm',
  async run(ctx: LintContext) {
    const issues: LintIssue[] = [];
    const unprocessed: Array<{ reason: string }> = [];

    const cap = ctx.prefs.maxCharactersVsChapter;
    const selected = selectCharactersToCheck(ctx.pages, ctx.characters, cap);
    const allEligible = ctx.characters.filter((c) =>
      ctx.pages.some((p) => p.type === 'entity' &&
        (p.title === c.name || p.aliases.includes(c.name) || p.slug === c.name)),
    );
    if (allEligible.length > cap) {
      unprocessed.push({
        reason: `符合條件角色 ${allEligible.length} 個，僅檢查前 ${cap} 個；剩 ${allEligible.length - cap} 個未檢查`,
      });
    }

    for (const item of selected) {
      const excerpts = collectChapterExcerpts(
        ctx.chapters, item.aliases, ctx.prefs.maxChapterExcerptsPerChar,
      );
      if (excerpts.length === 0) continue;

      const prompt = renderTemplate(ctx.aiPrompts.lintWikiVsChapterTemplate, {
        characterName: item.character.name,
        aliasesList: item.aliases.join('、'),
        wikiContent: item.entityPage.contentMd,
        chapterExcerptsJson: JSON.stringify(excerpts, null, 2),
      });

      let raw: string;
      try {
        raw = await complete(prompt, { maxTokens: 2048 }, ctx.signal);
      } catch (e) {
        throw new Error(`Wiki vs 章節 LLM (${item.character.name}) 失敗：${(e as Error).message}`);
      }

      let parsed: VsChapterResult;
      try {
        parsed = parseVsChapterJson(raw);
      } catch {
        raw = await complete(prompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 }, ctx.signal);
        parsed = parseVsChapterJson(raw);
      }

      for (const c of parsed.conflicts) {
        const targets: IssueTarget[] = [
          {
            kind: 'wikiPage', id: item.entityPage.id,
            label: `${item.entityPage.type}/${item.entityPage.slug}`,
          },
        ];
        for (const chapterId of c.chapterRefs) {
          const chapter = ctx.chapters.find((ch) => ch.id === chapterId);
          if (!chapter) continue;
          const excerpt = excerpts.find((e) => e.chapterId === chapterId)?.excerpt;
          targets.push({
            kind: 'chapter', id: chapter.id,
            label: `章節 ${chapter.title || chapter.id.slice(0, 6)}`,
            sourceExcerpt: excerpt,
          });
        }
        issues.push({
          id: uuid(),
          checkId: 'wikiVsChapter',
          severity: 'error',
          status: 'open',
          title: `${item.entityPage.type}/${item.entityPage.slug} 寫「${c.wikiSays}」，但章節寫「${c.chapterSays}」`,
          detail: `欄位「${c.field}」衝突。Wiki: ${c.wikiSays} ｜ 章節: ${c.chapterSays}`,
          targets,
          fix: { kind: 'llm' },
        });
      }
    }
    return { issues, unprocessed };
  },
};
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/lint/checks/wiki-vs-chapter.ts
git commit -m "feat(lint): wiki-vs-chapter LLM batch check (per character, aliases-based)

- 對每個有對應 entity page 的角色一次 LLM call
- 別名集合：character.name + character.aliases (若有) + entity.title + entity.aliases
- 章節 excerpt 用整個 aliases 集合搜，每章取第一個命中 ±250 字
- 最多 maxCharactersVsChapter 個角色，其餘進 unprocessed
- JSON 解析失敗補嚴格指示重試 1 次
- targets 同時含 wikiPage + chapter，章節含 sourceExcerpt"
```

---

## Task 10: llm-fix.ts

**Files:**
- Create: `src/lib/lint/llm-fix.ts`

### Why

對單一 LintIssue 召喚 LLM 生成修改建議。fix 套用走 wiki_log 補償（與 wiki-ingest 同款雙寫）。

- [ ] **Step 1: 寫 llm-fix.ts**

Create `src/lib/lint/llm-fix.ts`:
```ts
import { v4 as uuid } from 'uuid';
import { complete } from '../llm';
import { renderTemplate } from '../prompt-template';
import { storage } from '../storage';
import type { WikiPage, WikiLogEntry, WikiPageSnapshot } from '../../types';
import type { AIPromptPrefs } from '../../stores/settingsStore';
import type { LintIssue } from './types';

export interface LlmFixSuggestion {
  /** LLM 產出的完整新 markdown */
  newMarkdown: string;
  /** 給 preview modal 用：原 markdown */
  originalMarkdown: string;
  /** 被修改的頁 id */
  targetPageId: string;
}

/** 對單一 issue 召喚 LLM 修改建議。失敗時拋例外。 */
export async function generateFixSuggestion(
  issue: LintIssue,
  pages: WikiPage[],
  aiPrompts: AIPromptPrefs,
  userDirection: string,
  signal?: AbortSignal,
): Promise<LlmFixSuggestion> {
  // 找出第一個 wikiPage target 作為主要要修改的頁
  const wikiTarget = issue.targets.find((t) => t.kind === 'wikiPage');
  if (!wikiTarget) throw new Error('Issue 沒有 wikiPage target，無法產生修改建議');
  const page = pages.find((p) => p.id === wikiTarget.id);
  if (!page) throw new Error(`找不到對應 wiki page id=${wikiTarget.id}`);

  const prompt = renderTemplate(aiPrompts.lintFixSuggestTemplate, {
    issueTitle: issue.title,
    issueDetail: issue.detail,
    originalMarkdown: page.contentMd,
    userDirection: userDirection || '(留白：請依 issue 內容自行判斷)',
  });

  const raw = await complete(prompt, { maxTokens: 4096 }, signal);
  const newMarkdown = raw.trim().replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '');

  return {
    newMarkdown,
    originalMarkdown: page.contentMd,
    targetPageId: page.id,
  };
}

/**
 * 套用 LLM fix：先寫 wiki_log 再 update page（補償模式，仿 wiki-ingest）。
 * 回傳 ok / failed；失敗時 logEntry 標 `op_status='failed'`。
 */
export async function applyLlmFix(args: {
  bookId: string;
  page: WikiPage;
  newMarkdown: string;
  checkId: string;
  lintBatchId: string;
}): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  const { bookId, page, newMarkdown, checkId, lintBatchId } = args;
  const now = Date.now();
  const logId = uuid();

  const afterPage: WikiPage = {
    ...page,
    contentMd: newMarkdown,
    updatedAt: now,
  };

  const okLog: WikiLogEntry = {
    id: logId, bookId, batchId: lintBatchId, appliedAt: now,
    kind: 'update',
    opStatus: 'ok',
    pageId: page.id,
    pageType: page.type, pageSlug: page.slug,
    pageSnapshotBefore: page as WikiPageSnapshot,
    pageSnapshotAfter: afterPage as WikiPageSnapshot,
    source: `lint:${checkId}`,
    summary: `~${page.type}/${page.slug} (lint:${checkId})`,
  };

  try {
    await storage.wikiLog.add(okLog);
  } catch (e) {
    return { status: 'failed', error: `wiki_log insert 失敗：${(e as Error).message}` };
  }

  try {
    await storage.wikiPages.update(afterPage);
    return { status: 'ok' };
  } catch (e) {
    await storage.wikiLog.updateStatus(okLog.id, 'failed', (e as Error).message);
    return { status: 'failed', error: (e as Error).message };
  }
}

/**
 * 套用 AutoFix(removeRelatedSlug)：移除一筆 relatedSlug。
 * 寫 wiki_log + savePage 補償，同 applyLlmFix。
 */
export async function applyRemoveRelatedSlug(args: {
  bookId: string;
  page: WikiPage;
  removeTarget: { type: WikiPage['type']; slug: string };
  lintBatchId: string;
}): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  const { bookId, page, removeTarget, lintBatchId } = args;
  const now = Date.now();
  const logId = uuid();

  const afterPage: WikiPage = {
    ...page,
    relatedSlugs: page.relatedSlugs.filter(
      (r) => !(r.type === removeTarget.type && r.slug === removeTarget.slug),
    ),
    updatedAt: now,
  };

  const okLog: WikiLogEntry = {
    id: logId, bookId, batchId: lintBatchId, appliedAt: now,
    kind: 'update',
    opStatus: 'ok',
    pageId: page.id,
    pageType: page.type, pageSlug: page.slug,
    pageSnapshotBefore: page as WikiPageSnapshot,
    pageSnapshotAfter: afterPage as WikiPageSnapshot,
    source: `lint:broken-link`,
    summary: `~${page.type}/${page.slug} 移除 broken ref ${removeTarget.type}/${removeTarget.slug}`,
  };

  try {
    await storage.wikiLog.add(okLog);
  } catch (e) {
    return { status: 'failed', error: `wiki_log insert 失敗：${(e as Error).message}` };
  }

  try {
    await storage.wikiPages.update(afterPage);
    return { status: 'ok' };
  } catch (e) {
    await storage.wikiLog.updateStatus(okLog.id, 'failed', (e as Error).message);
    return { status: 'failed', error: (e as Error).message };
  }
}
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/lint/llm-fix.ts
git commit -m "feat(lint): llm-fix - 召喚修改建議 + 補償寫入 wiki_log

- generateFixSuggestion(issue, pages, prompts, userDirection, signal)
  → { newMarkdown, originalMarkdown, targetPageId }
- applyLlmFix({bookId, page, newMarkdown, checkId, lintBatchId})
  - 寫 wiki_log (source='lint:<checkId>'，共用 lintBatchId)
  - update wiki page
  - log 失敗中止；page 失敗則改 log 為 failed (與 wiki-ingest 一致)
- applyRemoveRelatedSlug({bookId, page, removeTarget, lintBatchId})
  - 同款補償寫入，source='lint:broken-link'"
```

---

## Task 11: lint/index.ts (lintBook 主入口)

**Files:**
- Create: `src/lib/lint/index.ts`

### Why

主入口串接所有 check、abort signal、unprocessed 收集。

- [ ] **Step 1: 寫 index.ts**

Create `src/lib/lint/index.ts`:
```ts
import { v4 as uuid } from 'uuid';
import { storage } from '../storage';
import { useSettingsStore } from '../../stores/settingsStore';
import type { LintCheck, LintContext, LintIssue, LintReport, LintPrefs } from './types';

import { brokenLinkCheck } from './checks/broken-link';
import { orphanCheck } from './checks/orphan';
import { aliasDupCheck } from './checks/alias-dup';
import { unrecordedCheck } from './checks/unrecorded';
import { wikiContradictCheck } from './checks/wiki-contradict';
import { wikiVsChapterCheck } from './checks/wiki-vs-chapter';

export type LintProgress = {
  checkId: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
};

export interface LintCallbacks {
  onProgress?: (progress: LintProgress[]) => void;
}

/** 順序固定，UI 也按這個順序顯示進度 */
const ALL_CHECKS: Array<{ check: LintCheck; prefKey: keyof LintPrefs['checks'] }> = [
  { check: brokenLinkCheck,     prefKey: 'brokenLink' },
  { check: orphanCheck,         prefKey: 'orphan' },
  { check: aliasDupCheck,       prefKey: 'aliasDup' },
  { check: unrecordedCheck,     prefKey: 'unrecorded' },
  { check: wikiContradictCheck, prefKey: 'wikiContradict' },
  { check: wikiVsChapterCheck,  prefKey: 'wikiVsChapter' },
];

export async function lintBook(
  bookId: string,
  signal?: AbortSignal,
  callbacks?: LintCallbacks,
): Promise<LintReport> {
  const settings = useSettingsStore.getState();
  const prefs = settings.lintPrefs;
  const aiPrompts = settings.aiPrompts;

  const [pages, chapters, characters] = await Promise.all([
    storage.wikiPages.list(bookId),
    storage.chapters.listByProject(bookId),
    storage.characters.listByProject(bookId),
  ]);

  const lintBatchId = uuid();
  const ctx: LintContext = {
    bookId, pages, chapters, characters, prefs, aiPrompts, lintBatchId, signal,
  };

  const progress: LintProgress[] = ALL_CHECKS.map(({ check, prefKey }) => ({
    checkId: check.id,
    status: prefs.checks[prefKey] ? 'pending' : 'skipped',
  }));
  callbacks?.onProgress?.(progress);

  const issues: LintIssue[] = [];
  const failedChecks: Array<{ checkId: string; error: string }> = [];
  const unprocessed: Array<{ checkId: string; reason: string }> = [];
  let cancelled = false;

  for (let i = 0; i < ALL_CHECKS.length; i++) {
    if (signal?.aborted) { cancelled = true; break; }
    const { check, prefKey } = ALL_CHECKS[i];
    if (!prefs.checks[prefKey]) continue;

    progress[i].status = 'running';
    callbacks?.onProgress?.([...progress]);

    const t0 = performance.now();
    try {
      const out = await check.run(ctx);
      progress[i].status = 'done';
      progress[i].durationMs = Math.round(performance.now() - t0);
      issues.push(...out.issues);
      if (out.unprocessed) {
        for (const u of out.unprocessed) unprocessed.push({ checkId: check.id, reason: u.reason });
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const isAbort = (e as { name?: string }).name === 'AbortError';
      if (isAbort) {
        progress[i].status = 'skipped';
        cancelled = true;
        callbacks?.onProgress?.([...progress]);
        break;
      }
      progress[i].status = 'failed';
      progress[i].error = msg;
      progress[i].durationMs = Math.round(performance.now() - t0);
      failedChecks.push({ checkId: check.id, error: msg });
    }
    callbacks?.onProgress?.([...progress]);
  }

  return {
    bookId,
    ranAt: Date.now(),
    lintBatchId,
    issues,
    failedChecks,
    unprocessed,
    cancelled,
  };
}
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/lint/index.ts
git commit -m "feat(lint): lintBook() 主入口

- 串行跑 6 個 check (順序：broken-link → orphan → alias-dup →
  unrecorded → wiki-contradict → wiki-vs-chapter)
- 每個 check 依 prefs.checks[<key>] 決定 skip
- 收集 issues / failedChecks / unprocessed 三層結果
- 支援 AbortSignal 中途取消
- onProgress callback 即時回報每 check 的 pending/running/done/failed/skipped
- 共用 lintBatchId (uuid)，所有 fix 寫 wiki_log 時用同一 batch_id"
```

---

## Task 12: lintStore.ts

**Files:**
- Create: `src/stores/lintStore.ts`

### Why

把 lintBook 包成 React-friendly store；提供 runLint / cancel / applyAutoFix / applyLlmFix / dismiss / setUserDirection 等 actions。

- [ ] **Step 1: 寫 lintStore.ts**

Create `src/stores/lintStore.ts`:
```ts
import { create } from 'zustand';
import { storage } from '../lib/storage';
import { lintBook, type LintProgress } from '../lib/lint';
import {
  applyLlmFix as applyLlmFixCore,
  applyRemoveRelatedSlug,
  generateFixSuggestion,
  type LlmFixSuggestion,
} from '../lib/lint/llm-fix';
import { useSettingsStore } from './settingsStore';
import type { LintIssue, LintReport, AutoFix } from '../lib/lint/types';

interface LintState {
  isRunning: boolean;
  progress: LintProgress[];
  report: LintReport | null;
  controller: AbortController | null;
  /** issueId → 使用者輸入的修改方向 */
  userDirections: Record<string, string>;
  /** issueId → 已產生的 LLM fix 建議（套用前留存） */
  fixSuggestions: Record<string, LlmFixSuggestion>;
  /** issueId → 正在生成建議 / 套用中 flag */
  busyIssueIds: Set<string>;

  runLint: (bookId: string) => Promise<void>;
  cancel: () => void;
  setUserDirection: (issueId: string, value: string) => void;

  /** broken-link 一鍵移除：寫 wiki_log + savePage */
  applyAutoFix: (issue: LintIssue) => Promise<void>;
  /** 召喚 LLM 修改建議 */
  generateFix: (issue: LintIssue) => Promise<void>;
  /** 套用 LLM 修改建議 */
  applyLlmFix: (issue: LintIssue) => Promise<void>;
  /** 維持現狀 — session-only */
  dismiss: (issueId: string) => void;
  /** 關掉 fix preview，清除暫存建議 */
  discardSuggestion: (issueId: string) => void;
}

export const useLintStore = create<LintState>((set, get) => ({
  isRunning: false,
  progress: [],
  report: null,
  controller: null,
  userDirections: {},
  fixSuggestions: {},
  busyIssueIds: new Set(),

  runLint: async (bookId) => {
    const controller = new AbortController();
    set({
      isRunning: true,
      progress: [],
      report: null,
      controller,
      userDirections: {},
      fixSuggestions: {},
      busyIssueIds: new Set(),
    });
    try {
      const report = await lintBook(bookId, controller.signal, {
        onProgress: (p) => set({ progress: p }),
      });
      set({ report, isRunning: false, controller: null });
    } catch (e) {
      console.error('[lint] runLint failed', e);
      set({ isRunning: false, controller: null });
    }
  },

  cancel: () => {
    const c = get().controller;
    if (c) c.abort();
  },

  setUserDirection: (issueId, value) => {
    set((s) => ({ userDirections: { ...s.userDirections, [issueId]: value } }));
  },

  applyAutoFix: async (issue) => {
    const report = get().report;
    if (!report) return;
    if (issue.fix?.kind !== 'removeRelatedSlug') return;
    const fix: AutoFix = issue.fix;

    const busy = new Set(get().busyIssueIds); busy.add(issue.id);
    set({ busyIssueIds: busy });

    const pages = await storage.wikiPages.list(report.bookId);
    const page = pages.find((p) => p.id === fix.pageId);
    if (!page) {
      alert(`找不到頁 id=${fix.pageId}`);
      busy.delete(issue.id);
      set({ busyIssueIds: new Set(busy) });
      return;
    }

    const result = await applyRemoveRelatedSlug({
      bookId: report.bookId,
      page,
      removeTarget: fix.target,
      lintBatchId: report.lintBatchId,
    });

    busy.delete(issue.id);
    if (result.status === 'failed') {
      alert(`移除失敗：${result.error}`);
      set({ busyIssueIds: new Set(busy) });
      return;
    }

    // 標 applied
    const updated = report.issues.map((i) =>
      i.id === issue.id ? { ...i, status: 'applied' as const } : i,
    );
    set({
      report: { ...report, issues: updated },
      busyIssueIds: new Set(busy),
    });
  },

  generateFix: async (issue) => {
    const report = get().report;
    if (!report) return;
    if (issue.fix?.kind !== 'llm') return;

    const busy = new Set(get().busyIssueIds); busy.add(issue.id);
    set({ busyIssueIds: busy });

    try {
      const pages = await storage.wikiPages.list(report.bookId);
      const direction = get().userDirections[issue.id] ?? '';
      const aiPrompts = useSettingsStore.getState().aiPrompts;
      const suggestion = await generateFixSuggestion(issue, pages, aiPrompts, direction);
      set((s) => ({ fixSuggestions: { ...s.fixSuggestions, [issue.id]: suggestion } }));
    } catch (e) {
      alert(`生成建議失敗：${(e as Error).message}`);
    } finally {
      const busy2 = new Set(get().busyIssueIds); busy2.delete(issue.id);
      set({ busyIssueIds: busy2 });
    }
  },

  applyLlmFix: async (issue) => {
    const report = get().report;
    if (!report) return;
    const suggestion = get().fixSuggestions[issue.id];
    if (!suggestion) return;

    const busy = new Set(get().busyIssueIds); busy.add(issue.id);
    set({ busyIssueIds: busy });

    const pages = await storage.wikiPages.list(report.bookId);
    const page = pages.find((p) => p.id === suggestion.targetPageId);
    if (!page) {
      alert('找不到要修改的 wiki page');
      const busy2 = new Set(busy); busy2.delete(issue.id);
      set({ busyIssueIds: busy2 });
      return;
    }

    const result = await applyLlmFixCore({
      bookId: report.bookId,
      page,
      newMarkdown: suggestion.newMarkdown,
      checkId: issue.checkId,
      lintBatchId: report.lintBatchId,
    });

    const busy2 = new Set(busy); busy2.delete(issue.id);

    if (result.status === 'failed') {
      alert(`套用失敗：${result.error}`);
      set({ busyIssueIds: busy2 });
      return;
    }

    // 標 applied + 清除 suggestion + direction
    const updated = report.issues.map((i) =>
      i.id === issue.id ? {
        ...i, status: 'applied' as const,
        fixOriginalMarkdown: suggestion.originalMarkdown,
      } : i,
    );
    const newSuggestions = { ...get().fixSuggestions };
    delete newSuggestions[issue.id];
    const newDirections = { ...get().userDirections };
    delete newDirections[issue.id];

    set({
      report: { ...report, issues: updated },
      fixSuggestions: newSuggestions,
      userDirections: newDirections,
      busyIssueIds: busy2,
    });
  },

  dismiss: (issueId) => {
    const report = get().report;
    if (!report) return;
    const updated = report.issues.map((i) =>
      i.id === issueId ? { ...i, status: 'dismissed' as const } : i,
    );
    set({ report: { ...report, issues: updated } });
  },

  discardSuggestion: (issueId) => {
    const newSuggestions = { ...get().fixSuggestions };
    delete newSuggestions[issueId];
    set({ fixSuggestions: newSuggestions });
  },
}));
```

- [ ] **Step 2: build 跑得過**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/lintStore.ts
git commit -m "feat(lint): lintStore - React-friendly state + actions

- isRunning / progress / report / controller / userDirections /
  fixSuggestions / busyIssueIds
- runLint(bookId) / cancel()
- setUserDirection(issueId, value)
- applyAutoFix(issue) — broken-link 一鍵移除
- generateFix(issue) — 召喚 LLM 修改建議
- applyLlmFix(issue) — 套用 LLM 建議到 wiki page + 寫 wiki_log
- dismiss(issueId) — 維持現狀 session-only
- discardSuggestion(issueId)
- 套用後 issue.status='applied'，row 灰底保留在 list"
```

---

## Task 13: LintReportModal + WikiPanel 按鈕

**Files:**
- Create: `src/components/lint/LintReportModal.tsx`
- Modify: `src/components/wiki/WikiPanel.tsx`

### Why

UI 主軸 modal — 進行中與報告兩種狀態合一。需要 WikiPanel 加按鈕觸發。

- [ ] **Step 1: 看現有 Modal 元件 / WikiPanel 結構**

```bash
ls src/components/common/
```

確認有 `Modal.tsx`、`Button.tsx`，閱讀 `src/components/wiki/WikiPanel.tsx` 的 header 區塊以對齊樣式。

- [ ] **Step 2: 寫 LintReportModal.tsx**

Create `src/components/lint/LintReportModal.tsx`:
```tsx
import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import { LintIssueRow } from './LintIssueRow';
import type { LintIssue } from '../../lib/lint/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CHECK_LABELS: Record<string, string> = {
  'broken-link': 'Broken link',
  'orphan': '孤頁',
  'alias-dup': '別名重複',
  'unrecorded': '未登錄角色',
  'wikiContradict': 'Wiki 內部矛盾',
  'wikiVsChapter': 'Wiki vs 章節',
};

const STATUS_ICON: Record<string, string> = {
  pending: '⌛',
  running: '⏳',
  done: '✓',
  failed: '❌',
  skipped: '—',
};

export function LintReportModal({ open, onClose }: Props) {
  const { isRunning, progress, report, cancel } = useLintStore();

  const groupedIssues = useMemo(() => {
    if (!report) return {};
    const out: Record<string, LintIssue[]> = {};
    for (const issue of report.issues) {
      (out[issue.checkId] ??= []).push(issue);
    }
    return out;
  }, [report]);

  const openCount = report?.issues.filter((i) => i.status === 'open').length ?? 0;
  const processedCount = report?.issues.filter((i) => i.status !== 'open').length ?? 0;

  return (
    <Modal open={open} onClose={onClose} title={
      isRunning ? '🔍 Lint 進行中'
        : report?.cancelled ? '(部分) Lint 報告 — 中途取消'
        : `🔍 Lint 報告 — ${openCount} 個 open / ${processedCount} 已處理`
    } width={780}>

      {/* 進度列 */}
      <div style={{ marginBottom: 12 }}>
        {progress.map((p) => (
          <div key={p.checkId} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 0',
            color: p.status === 'failed' ? 'var(--danger, #c33)' :
                   p.status === 'skipped' ? 'var(--text-tertiary, #888)' :
                   'var(--text-primary)',
          }}>
            <span style={{ width: 18 }}>{STATUS_ICON[p.status]}</span>
            <span style={{ flex: 1 }}>{CHECK_LABELS[p.checkId] ?? p.checkId}</span>
            {p.durationMs != null && <span style={{ fontSize: 11, opacity: 0.6 }}>{p.durationMs} ms</span>}
            {p.error && <span style={{ fontSize: 11, color: 'var(--danger, #c33)' }} title={p.error}>失敗</span>}
          </div>
        ))}
      </div>

      {isRunning && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Button variant="secondary" onClick={cancel}>取消</Button>
        </div>
      )}

      {!isRunning && report && (
        <>
          {report.failedChecks.length > 0 && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: 'var(--bg-warn, #fff3cd)',
              border: '1px solid var(--border-warn, #ffe69c)',
              fontSize: 13,
            }}>
              ⚠️ {report.failedChecks.length} 個檢查失敗：
              {report.failedChecks.map((f) => `${CHECK_LABELS[f.checkId] ?? f.checkId}（${f.error.slice(0, 60)}）`).join('；')}
            </div>
          )}

          {report.unprocessed.length > 0 && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: 'var(--bg-info, #e8f4f8)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              ℹ️ 超出檢查上限未處理：
              <ul style={{ margin: '4px 0 0 16px' }}>
                {report.unprocessed.map((u, i) => (
                  <li key={i}>{CHECK_LABELS[u.checkId] ?? u.checkId}：{u.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {report.issues.length === 0 && report.failedChecks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 32 }}>✅</div>
              <div style={{ marginTop: 8 }}>沒有發現問題</div>
            </div>
          )}

          {Object.entries(groupedIssues).map(([checkId, issues]) => (
            <div key={checkId} style={{ marginBottom: 16 }}>
              <div style={{
                fontWeight: 600, fontSize: 13,
                padding: '6px 0', borderBottom: '1px solid var(--border)',
                marginBottom: 6,
              }}>
                ▼ {CHECK_LABELS[checkId] ?? checkId} ({issues.length})
              </div>
              {issues.map((issue) => (
                <LintIssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: 修改 WikiPanel.tsx 加按鈕 + mount modal**

打開 `src/components/wiki/WikiPanel.tsx`，在 header 區塊（左欄上方）加按鈕；body 末尾 mount LintReportModal。

具體：
1. 頂部加 `import { useState } from 'react';`（若沒有）
2. import `LintReportModal` from `'../lint/LintReportModal'`
3. import `useLintStore` from `'../../stores/lintStore'`
4. component 內加 state：
   ```tsx
   const [lintOpen, setLintOpen] = useState(false);
   const { runLint, isRunning } = useLintStore();
   const projectId = /* 從現有 prop / context 取，看現有寫法 */;
   ```
5. 既有「+ 新增 / 🔎 搜尋」工具列附近加按鈕：
   ```tsx
   <Button
     variant="secondary"
     onClick={() => { setLintOpen(true); runLint(projectId); }}
     disabled={isRunning}
   >🔍 執行 Lint</Button>
   ```
6. component return 末尾（最外層 div 內）mount：
   ```tsx
   <LintReportModal open={lintOpen} onClose={() => setLintOpen(false)} />
   ```

（具體 projectId 取得方式參照同檔現有 `useProjectStore` 用法。）

- [ ] **Step 4: build 跑得過（LintIssueRow 此時還沒，預期 ts error）**

預期 LintIssueRow 還沒實作 → 留到 Task 14。本步驟若 ts error 是 LintIssueRow，OK。

```bash
npm run build
```

若僅錯在 `'../lint/LintIssueRow'` 找不到模組，可暫時用 stub：
```tsx
// 暫時 stub，Task 14 取代
export function LintIssueRow({ issue }: { issue: LintIssue }) {
  return <div>{issue.title}</div>;
}
```
放在 `src/components/lint/LintIssueRow.tsx`，下個 task 覆寫。

- [ ] **Step 5: Commit**

```bash
git add src/components/lint/LintReportModal.tsx src/components/wiki/WikiPanel.tsx src/components/lint/LintIssueRow.tsx
git commit -m "feat(lint): LintReportModal + WikiPanel 加 🔍 執行 Lint 按鈕

- LintReportModal：進行中（進度列 + 取消）/ 報告版（分組 issues +
  failed + unprocessed banner + 空狀態）合一
- WikiPanel header 加 🔍 執行 Lint 按鈕，觸發 runLint(projectId)
- LintIssueRow 暫用 stub，下個 task 替換"
```

---

## Task 14: LintIssueRow + LintFixPreviewModal

**Files:**
- Create: `src/components/lint/LintIssueRow.tsx`（覆寫 stub）
- Create: `src/components/lint/LintFixPreviewModal.tsx`

### Why

每個 issue row 含：severity icon、title、targets chips、依 fix 類型顯示不同按鈕（一鍵修 / 修改 inline 展開 / dismiss）。Preview modal 用兩欄純文字 diff，變動行 highlight。

- [ ] **Step 1: 寫 LintFixPreviewModal.tsx**

Create `src/components/lint/LintFixPreviewModal.tsx`:
```tsx
import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import type { LintIssue } from '../../lib/lint/types';

interface Props {
  issue: LintIssue;
  onClose: () => void;
}

interface DiffLine {
  before: string | null;
  after: string | null;
  changed: boolean;
}

/** 簡易行對行 diff：相同行不標、不同行兩邊都標 changed。不引入 lib。 */
function naiveDiff(before: string, after: string): DiffLine[] {
  const bs = before.split('\n');
  const as_ = after.split('\n');
  const maxLen = Math.max(bs.length, as_.length);
  const out: DiffLine[] = [];
  for (let i = 0; i < maxLen; i++) {
    const b = bs[i] ?? null;
    const a = as_[i] ?? null;
    out.push({ before: b, after: a, changed: b !== a });
  }
  return out;
}

export function LintFixPreviewModal({ issue, onClose }: Props) {
  const { fixSuggestions, busyIssueIds, applyLlmFix, generateFix, discardSuggestion } = useLintStore();
  const suggestion = fixSuggestions[issue.id];
  const busy = busyIssueIds.has(issue.id);

  const diff = useMemo(() => {
    if (!suggestion) return [];
    return naiveDiff(suggestion.originalMarkdown, suggestion.newMarkdown);
  }, [suggestion]);

  if (!suggestion) return null;

  return (
    <Modal open={true} onClose={onClose} title={`✨ 建議修改：${issue.title}`} width={900}>
      <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-secondary)' }}>
        {issue.detail}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8,
        border: '1px solid var(--border)',
        maxHeight: '50vh', overflow: 'auto',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
      }}>
        <div style={{ borderRight: '1px solid var(--border)', padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Before</div>
          {diff.map((d, i) => (
            <pre key={i} style={{
              margin: 0, whiteSpace: 'pre-wrap',
              background: d.changed && d.before != null ? 'rgba(220, 53, 69, 0.12)' : 'transparent',
              minHeight: '1em',
            }}>{d.before ?? ''}</pre>
          ))}
        </div>
        <div style={{ padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>After</div>
          {diff.map((d, i) => (
            <pre key={i} style={{
              margin: 0, whiteSpace: 'pre-wrap',
              background: d.changed && d.after != null ? 'rgba(40, 167, 69, 0.12)' : 'transparent',
              minHeight: '1em',
            }}>{d.after ?? ''}</pre>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={() => { discardSuggestion(issue.id); onClose(); }} disabled={busy}>
          ✗ 取消
        </Button>
        <Button variant="secondary" onClick={() => generateFix(issue)} disabled={busy}>
          🔄 重新生成
        </Button>
        <Button variant="primary" onClick={async () => { await applyLlmFix(issue); onClose(); }} disabled={busy}>
          ✓ 套用
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 覆寫 LintIssueRow.tsx**

Replace `src/components/lint/LintIssueRow.tsx`:
```tsx
import { useState } from 'react';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import { useWikiStore } from '../../stores/wikiStore';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { LintFixPreviewModal } from './LintFixPreviewModal';
import type { LintIssue, IssueTarget } from '../../lib/lint/types';

const SEVERITY_ICON = { error: '❌', warn: '⚠️', info: 'ℹ️' };

interface Props {
  issue: LintIssue;
}

export function LintIssueRow({ issue }: Props) {
  const {
    userDirections, setUserDirection,
    busyIssueIds, fixSuggestions,
    applyAutoFix, generateFix, dismiss,
  } = useLintStore();

  const [expanded, setExpanded] = useState(false);

  const busy = busyIssueIds.has(issue.id);
  const direction = userDirections[issue.id] ?? '';
  const previewOpen = !!fixSuggestions[issue.id];

  const isApplied = issue.status === 'applied';
  const isDismissed = issue.status === 'dismissed';
  const isStruck = isApplied || isDismissed;

  return (
    <div style={{
      padding: '8px 4px',
      borderBottom: '1px solid var(--border-subtle, #eee)',
      opacity: isStruck ? 0.5 : 1,
      background: isStruck ? 'var(--bg-secondary, #fafafa)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ width: 20 }}>{SEVERITY_ICON[issue.severity]}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {isApplied && '[已修復] '}{isDismissed && '[已忽略] '}{issue.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {issue.detail}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {issue.targets.map((t, i) => (
              <TargetChip key={i} target={t} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!isStruck && issue.fix?.kind === 'removeRelatedSlug' && (
            <Button variant="secondary" onClick={() => applyAutoFix(issue)} disabled={busy}>
              🔧 一鍵移除
            </Button>
          )}
          {!isStruck && issue.fix?.kind === 'llm' && (
            <Button variant="secondary" onClick={() => setExpanded((v) => !v)}>
              ✏️ 修改 {expanded ? '▴' : '▾'}
            </Button>
          )}
          {!isStruck && issue.checkId === 'unrecorded' && (
            <Button variant="secondary" onClick={() => dismiss(issue.id)}>
              — 維持現狀
            </Button>
          )}
        </div>
      </div>

      {expanded && !isStruck && issue.fix?.kind === 'llm' && (
        <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            修改方向（可留白，留白則由 AI 自行判斷）：
          </div>
          <textarea
            className="form-textarea"
            value={direction}
            onChange={(e) => setUserDirection(issue.id, e.target.value)}
            placeholder="例如：依 ch-3「王大三十五」為準"
            style={{
              width: '100%', minHeight: 60,
              padding: 6, fontFamily: 'inherit', fontSize: 12,
              border: '1px solid var(--border)', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
            <Button variant="secondary" onClick={() => setExpanded(false)} disabled={busy}>取消</Button>
            <Button variant="primary" onClick={() => generateFix(issue)} disabled={busy}>
              {busy ? '生成中…' : '✨ 生成建議修改'}
            </Button>
          </div>
        </div>
      )}

      {previewOpen && (
        <LintFixPreviewModal issue={issue} onClose={() => { /* preview store 自管 */ }} />
      )}
    </div>
  );
}

function TargetChip({ target }: { target: IssueTarget }) {
  const { selectPage } = useWikiStore();
  const setSelectedChapterId = useUiStore((s) => s.setSelectedChapterId);
  const setTab = useUiStore((s) => s.setTab);
  // 提供章節跳轉時切到「章節」分頁

  const onClick = () => {
    if (target.kind === 'wikiPage') {
      selectPage(target.id);
    } else {
      setSelectedChapterId(target.id);
      setTab('chapters');
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={target.sourceExcerpt}
      style={{
        background: 'var(--bg-tertiary, #f0f0f0)',
        border: '1px solid var(--border)',
        padding: '2px 8px',
        fontSize: 11, cursor: 'pointer',
        borderRadius: 3,
      }}
    >
      {target.label}{target.sourceExcerpt ? ' 📄' : ''}
    </button>
  );
}
```

注意：本檔依賴 `useWikiStore.selectPage` / `useUiStore.setSelectedChapterId` / `useUiStore.setTab` 都已存在於既有 stores。若 method 名不同，依實際命名調整（執行任務的 subagent 應先 `grep` 確認）。

- [ ] **Step 3: 跑 build 確認**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/lint/LintIssueRow.tsx src/components/lint/LintFixPreviewModal.tsx
git commit -m "feat(lint): LintIssueRow + LintFixPreviewModal

LintIssueRow:
- severity icon + title + detail + targets chips
- 不同 fix 類型顯示不同按鈕：一鍵移除 (broken-link) /
  ✏️ 修改 ▾ (LLM) / — 維持現狀 (unrecorded)
- ✏️ 修改 ▾ 展開 inline 區：textarea 修改方向 + 生成建議按鈕
- applied / dismissed 灰底保留在 list
- TargetChip 點 wikiPage 跳 wiki 頁；點 chapter 切到章節分頁

LintFixPreviewModal:
- 兩欄純文字 diff，行對行 highlight
- 取消 / 重新生成 / 套用 按鈕"
```

---

## Task 15: Settings UI 擴充

**Files:**
- Modify: settings modal 相關元件（路徑依現有 codebase，預估在 `src/components/Toolbar.tsx` 或專門的 settings modal）

### Why

把 LintPrefs checkboxes + 數字輸入塞進 📚 Wiki 設定分頁；4 個 lint prompt template 進 📜 AI 提示詞 sub-tabs。

- [ ] **Step 1: 找到現有 Wiki 設定分頁 + AI 提示詞 sub-tabs 的程式碼**

```bash
grep -rn "Wiki 設定\|wikiPrefs\|budgetRatio" src/components/ --include="*.tsx"
grep -rn "AI 提示詞\|aiPrompts\|wikiIngestPlanTemplate" src/components/ --include="*.tsx"
```

讀出 settings modal 的檔案（通常是 `src/components/Toolbar.tsx` 內的子元件或獨立 `SettingsModal.tsx`）。

- [ ] **Step 2: 在 Wiki 設定分頁底部加 Lint 區段**

加 import：
```tsx
import { useSettingsStore } from '../stores/settingsStore';
```

在 Wiki 設定區段（既有 `budgetRatio` slider 等）下方加：
```tsx
const { lintPrefs, setLintPrefs } = useSettingsStore();

<hr style={{ margin: '16px 0' }} />
<h4>Lint</h4>
<div>
  啟用的檢查：
  <label style={{ display: 'block' }}>
    <input type="checkbox" checked={lintPrefs.checks.brokenLink}
      onChange={(e) => setLintPrefs({ checks: { brokenLink: e.target.checked } })} />
    Broken link
  </label>
  <label style={{ display: 'block' }}>
    <input type="checkbox" checked={lintPrefs.checks.orphan}
      onChange={(e) => setLintPrefs({ checks: { orphan: e.target.checked } })} />
    孤頁
  </label>
  <label style={{ display: 'block' }}>
    <input type="checkbox" checked={lintPrefs.checks.aliasDup}
      onChange={(e) => setLintPrefs({ checks: { aliasDup: e.target.checked } })} />
    別名重複
  </label>
  <label style={{ display: 'block' }}>
    <input type="checkbox" checked={lintPrefs.checks.unrecorded}
      onChange={(e) => setLintPrefs({ checks: { unrecorded: e.target.checked } })} />
    未登錄角色（hybrid）
  </label>
  <label style={{ display: 'block' }}>
    <input type="checkbox" checked={lintPrefs.checks.wikiContradict}
      onChange={(e) => setLintPrefs({ checks: { wikiContradict: e.target.checked } })} />
    Wiki 內部矛盾（LLM）
  </label>
  <label style={{ display: 'block' }}>
    <input type="checkbox" checked={lintPrefs.checks.wikiVsChapter}
      onChange={(e) => setLintPrefs({ checks: { wikiVsChapter: e.target.checked } })} />
    Wiki vs 章節（LLM）
  </label>
</div>

<div style={{ marginTop: 12 }}>
  LLM 上限：
  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
    <label>單類型最多頁數：
      <input type="number" min={1} max={100} value={lintPrefs.maxPagesPerTypeContradict}
        onChange={(e) => setLintPrefs({ maxPagesPerTypeContradict: Number(e.target.value) })}
        style={{ width: 60, marginLeft: 4 }} />
    </label>
    <label>最多角色數：
      <input type="number" min={1} max={50} value={lintPrefs.maxCharactersVsChapter}
        onChange={(e) => setLintPrefs({ maxCharactersVsChapter: Number(e.target.value) })}
        style={{ width: 60, marginLeft: 4 }} />
    </label>
    <label>每角色章節數：
      <input type="number" min={1} max={10} value={lintPrefs.maxChapterExcerptsPerChar}
        onChange={(e) => setLintPrefs({ maxChapterExcerptsPerChar: Number(e.target.value) })}
        style={{ width: 60, marginLeft: 4 }} />
    </label>
    <label>未登錄候選上限：
      <input type="number" min={1} max={100} value={lintPrefs.maxUnrecordedCandidates}
        onChange={(e) => setLintPrefs({ maxUnrecordedCandidates: Number(e.target.value) })}
        style={{ width: 60, marginLeft: 4 }} />
    </label>
  </div>
</div>
```

- [ ] **Step 3: 在 AI 提示詞 sub-tabs 加 4 個新 tab**

定位既有 sub-tab 列表（會是個 array 或一連串 `<button>`），加 4 個對應 lint template 的：

```tsx
// 範例（依現有寫法調整）
const SUB_TABS = [
  // ... 既有
  { id: 'wikiQueryAnswer', label: 'Wiki #4 Query', key: 'wikiQueryAnswerTemplate' },
  { id: 'lintUnrecorded', label: 'Lint #1 Unrecorded', key: 'lintUnrecordedVerifyTemplate' },
  { id: 'lintContradict', label: 'Lint #2 矛盾', key: 'lintWikiContradictTemplate' },
  { id: 'lintVsChapter', label: 'Lint #3 vs章節', key: 'lintWikiVsChapterTemplate' },
  { id: 'lintFix',       label: 'Lint #4 修改建議', key: 'lintFixSuggestTemplate' },
];
```

預覽資料來源若有 `prompt-preview.ts` 的 SAMPLES 表，補對應 4 個範例值（candidatesJson、digestsJson、wikiContent 等）。

- [ ] **Step 4: build 跑得過**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -p src/components/   # 視實際變更檔挑入
git commit -m "feat(settings): Lint 區段 + 4 個 lint prompt 模板 sub-tabs

Wiki 設定分頁底部加 Lint：
- 6 個 check enable/disable checkbox（lintPrefs.checks.*）
- 4 個 LLM 上限 number input（maxPagesPerType / maxCharsVsChapter
  / maxExcerptsPerChar / maxUnrecordedCandidates）

AI 提示詞 sub-tabs 加 4 個：
- Lint #1 Unrecorded → lintUnrecordedVerifyTemplate
- Lint #2 矛盾 → lintWikiContradictTemplate
- Lint #3 vs章節 → lintWikiVsChapterTemplate
- Lint #4 修改建議 → lintFixSuggestTemplate"
```

---

## Task 16: 手動驗收 sweep

**Files:** （無新增；只跑驗收）

### Why

對照 spec §6 的 10 條手動驗收清單，跑完一遍確認 end-to-end。

- [ ] **Step 1: `npm run tauri dev` 開桌面版（或 `npm run dev` web 版均可）**

- [ ] **Step 2: 跑驗收清單 10 條（spec §6 完整版）**

對 spec §6「手動驗收清單」的 10 條 case 逐一跑過，記錄通過 / 失敗。

關鍵 case 提示：
1. 乾淨書 → 0 issue
2. 壞 relatedSlug 含跨 type 同 slug 測試 → 修後重 lint 為 0；`wiki_log` 有 `source='lint:broken-link'`
3. 兩頁共用 alias → error 無 fix 按鈕
4. 純孤頁 → info 無刪除按鈕
5. 角色年齡矛盾 → wiki-vs-chapter issue → 修改方向留白 → apply → wiki_log 有 `source='lint:wikiVsChapter'`
6. 未登錄「趙六」+ 對話標籤 → unrecorded warn；「突然」「眼前」不出
7. Lint 中途取消 → progress 已完成項顯示
8. NVIDIA 連 3 次 502 → 該 check 失敗，其他結果仍展示
9. 取消勾「Wiki 內部矛盾」→ 該 check skip
10. 超 maxPagesPerTypeContradict → 進 unprocessed banner

- [ ] **Step 3: 跑 `npm test` 確認單元測試全綠**

```bash
npm test
```

Expected: digest.test.ts、unrecorded.test.ts、wiki-contradict.test.ts 全綠。

- [ ] **Step 4: 跑 `npm run build` 確認無 warning / error**

```bash
npm run build
```

- [ ] **Step 5: 若全部通過，補 CHANGELOG**

修改 `docs/CHANGELOG.md` 頂部加：

```markdown
## 2026-05-XX — Phase 2.5 Part 1: 一致性 Lint

完整實作 Phase 2.5 #3（spec：`docs/superpowers/specs/2026-05-19-consistency-lint-design.md`；plan：`docs/superpowers/plans/2026-05-19-consistency-lint.md`）。

**新增功能**
- Wiki 分頁加「🔍 執行 Lint」按鈕
- 6 個 check：①Broken link ②孤頁(info) ③別名重複 ④未登錄角色(hybrid) ⑤Wiki 內部矛盾(LLM/digest) ⑥Wiki vs 章節(LLM/aliases)
- Lint Report Modal：分組 issues、severity 篩選、unprocessed banner、空狀態
- 一鍵修 broken-link、LLM 建議修改 preview（兩欄純文字 diff）
- 所有 fix 寫 `wiki_log`（`source='lint:<checkId>'`），保留 undo 能力
- 偏好設定加 LintPrefs（6 checkbox + 4 LLM 上限）+ 4 個 lint prompt 模板

**Schema**
- 零 SQLite / Dexie schema 變動（lint 結果不持久化、prefs 走 localStorage）

**已知限制**
- 「維持現狀」session-only，重 lint 會再出現
- 孤頁不提供刪除（需從 wiki 編輯器手動刪）
- Phase 2.5 未實作 lint 整批 undo（保留 wiki_log batch_id 共用設計，可後續補）
```

- [ ] **Step 6: Commit + 完成**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: CHANGELOG 補 Phase 2.5 一致性 Lint 條目"
```

---

## Spec Coverage 自審

| Spec § | Plan task |
|--------|-----------|
| §1 LintCheck/Issue/Report/Context | Task 2 (types.ts) |
| §1 LintPrefs | Task 2 (types.ts DEFAULT_LINT_PREFS) + Task 3 (settingsStore) |
| §1 檔案佈局 | Task 2-15 全覆蓋 |
| §2 ① broken-link | Task 4 |
| §2 ② orphan info-only | Task 5 |
| §2 ③ alias-dup | Task 6 |
| §2 ④ unrecorded hybrid | Task 7 |
| §2 ⑤ wiki-contradict + digest | Task 2 (digest.ts) + Task 8 |
| §2 ⑥ wiki-vs-chapter + aliases | Task 9 |
| §2 LLM fix (含 wiki_log 雙寫) | Task 10 (llm-fix.ts) + Task 12 (lintStore.applyLlmFix) |
| §2.7 digest 詞典 / 截斷順序 | Task 2 |
| §3 UI（按鈕、進度、報告、inline 修改方向、diff modal） | Task 13 + 14 |
| §3 跳轉到 wikiPage / chapter | Task 14 (TargetChip) |
| §3 issue applied/dismissed 灰底保留 | Task 14 |
| §4 LintPrefs deep merge | Task 3 |
| §4 4 個 prompt 模板 | Task 3 |
| §4 Settings UI 整合 | Task 15 |
| §5 AbortSignal 一路傳到 fetch | Task 1 (postToLLM/postToLLMWithRetry) + Task 11 (lintBook) |
| §5 fix 補償寫入 | Task 10 (applyLlmFix / applyRemoveRelatedSlug) |
| §5 LLM JSON parse 失敗重試 1 次 | Task 7, 8, 9 each |
| §6 unit tests | Task 2 (digest) + Task 7 (unrecorded pre-filter) + Task 8 (wiki-contradict JSON parser) |
| §6 手動驗收 10 條 | Task 16 |
