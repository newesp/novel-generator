# 模組 07｜Context Budget Manager（上下文預算管理器）

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)（基礎版 Phase 1，動態版 Phase 2.5）

## 核心概念

負責智慧分配每次生成呼叫的 token 預算，決定「要餵給 AI 哪些內容、以什麼形式、總量是多少」。總上限依所選模型的 context window 動態調整。

---

## 預算分配策略

| 優先級 | 內容 | 預估比例 |
|--------|------|----------|
| 1（必填） | 世界觀設定 + 故事節拍 + 章節要點 | ~10% |
| 2（必填） | 相關 Wiki 條目（已篩選） | ~25% |
| 3（高優先） | FTS5 全文檢索結果（關鍵字命中段落） | ~15% |
| 4（高優先） | 上一章 / 指定參考章節（摘要或全文） | ~20% |
| 5（可選） | 更早期章節的壓縮摘要 | ~15% |
| 6（保留） | 輸出緩衝區 | ~15% |

---

## 摘要壓縮策略（Phase 2.5）

- 距離當前章節較遠的章節，自動以 AI 壓縮摘要取代全文（摘要長度約為原文 10-15%）
- 摘要在章節「存入 Wiki」時同步生成並快取，避免每次生成時重複呼叫
- 摘要存儲於章節資料結構的 `summary` 欄位

---

## 動態調整機制

- 系統根據所選模型的 context window 大小自動調整各區塊上限
- 若 Wiki 條目總量超出預算，優先保留與本章角色/地點相關的條目
- 用戶可在生成設置面板手動調整「參考深度」（淺層/標準/深度）

---

## 運作流程

```
用戶點擊生成
    ↓
計算可用 token 上限（依模型 context window）
    ↓
依優先級填入各內容區塊
    ↓
超出上限的區塊 → 壓縮摘要或截斷
    ↓
組裝最終 Prompt → 送出 LLM 請求
```

---

## Phase 1 實作狀況

> Phase 1 不含 Wiki / RAG，以固定比例分配。

### BudgetInputs 介面（`src/lib/context-budget.ts`）

| 欄位 | 說明 |
|------|------|
| `worldSetting` | 世界觀設定 |
| `mainPlot` | 主線劇情架構（Phase 1 新增） |
| `characters` | 格式化角色字串，由 `formatCharacters()` 產出 |
| `beat` | 故事節拍 |
| `chapterPoints` | 章節要點 |
| `referenceChapterTitle` | 參考章節標題 |
| `referenceChapterContent` | 參考章節正文（`referenceDepth` 控制截斷）|
| `olderChapterSummary` | 更早章節摘要（Phase 2 由摘要引擎填入；Phase 1 傳空字串）|

### formatCharacters()

將角色列表壓縮為多行字串：
```
- 角色名 (性別/年齡/種族)：性格：…；背景：…；外貌：…；能力：…；關係：…
```
每個角色一行，送入 prompt 的「主要角色」區塊。

### buildGenerationPrompt() Prompt 結構

依 `modules/03-chapters.md` 的預設提示詞模板實作，實際段落順序：

```
## 背景資訊
### 世界觀
### 主線劇情
### 主要角色

## 本章要求
- 章節標題 / 故事節拍 / 章節要點 / 目標字數

## 前文（參考章節：{title}）
{referenceChapterContent}

## 更早章節摘要（可選）

## ⚠️ 用戶調整指令（最高優先級，必須遵守）
{adjustInstruction}

---
請開始撰寫本章正文（4 條規則）
```

**調整指令設計原則**：置於 prompt 最末段，並以「最高優先級，必須遵守」標示。確保 LLM 的注意力集中在用戶的修改要求上（如「加強主角戲份」、「加快節奏」）。

### Phase 1 預算分配（實際）

| 優先級 | 內容 | 備註 |
|--------|------|------|
| 1（固定） | 世界觀 + 主線劇情 + 角色 + 節拍 + 要點 | 全量放入 |
| 2（高） | 參考章節正文 | `shallow` 模式截至 1000 字 |
| 3（可選） | 更早章節摘要 | 剩餘 token 填入 |
| 4（保留） | 輸出緩衝區 | 佔 context window 15% |

## Phase 2 — wikiSection 整合（已實作 2026-05-18）

`BudgetInputs` 新增 `wikiSection: string` 欄位。`buildGenerationPrompt()` 將其注入 `DEFAULT_CHAPTER_CONTENT_TEMPLATE` 的 `{{wikiSection}}`。

實作：`src/lib/wiki-loader.ts`（cheap relevance filter + 優先級 + 預算截斷）→ `src/lib/wiki-section.ts`（格式化）。

詳見：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md` §5。
