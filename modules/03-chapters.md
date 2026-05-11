# 模組 03｜章節管理器

**Phase**：1　**依賴**：00-book、07-context-budget、04-knowledge、05-versions

---

## 運作流程

```
用戶點擊'AI 生成章節' → 生成章節
或用戶自行新增/刪除/編輯章節

設定標題/目標字數/故事節拍/章節要點 → 用戶點擊'生成' → AI 生成正文
```

---

## 核心功能

- 新增章節
- 刪除章節（單章 / 多選批次刪除）
- 修改章節
- **拖曳排序**：HTML5 原生 DnD，上/下半部插入位置判斷，排序後批次更新 DB
- **多選刪除**：Checkbox 多選、全選（含 indeterminate）、bulk-actions 動作列
- AI 生成章節
	- 可以設定要生成幾章節，由 AI 生成：標題/故事節拍/章節要點
	- **接續模式**：若已有章節，傳入最後 8 章的標題/節拍/要點 + 角色清單，AI 從第 N+1 章接續生成（prompt 明確說明接續語境）
	- 接續模式 BEAT 選項排除「引入」；附加「接續硬性規則」防止 AI 重啟故事 / 自編人名
	- 若無既有章節，則從頭規劃
- **章節要點重新生成**（章節要點 Modal 內 ✨ 重新生成）
	- 依當前章節的故事節拍 + 參考章節（取尾段 1500 字）+ 角色清單，由 AI 寫出 2-4 句要點
	- 不滿意可重複生成；按「儲存」才寫入 DB

---

## 章節欄位

| 欄位     | 說明                              |
| ------ | ------------------------------- |
| 標題     | 章節標題                            |
| 目標字數   | 預設空白，可留空讓 AI 自行發揮               |
| 故事節拍   | 引入/衝突/轉折/高潮/結局/自定義              |
| 章節要點   | 給 AI 生成內容用的額外提示詞（可編輯）           |
| 參考章節   | 生成本章時要參考的另一章節（持久化至 DB，null = 不參考）|
| 正文     | AI 生成的內容（可編輯）                   |

---

## 故事節拍機制

| 節拍類型 | 說明 |
|----------|------|
| 引入 (Inciting Incident) | 故事起因，角色面臨轉折點 |
| 衝突升級 (Rising Action) | 矛盾加深，困難加劇 |
| 中點轉折 (Midpoint Twist) | 重大變化，方向逆轉 |
| 高潮 (Climax) | 最高衝突點，決定性時刻 |
| 結局 (Resolution) | 問題解決，塵埃落定 |
| 鋪墊/過渡 | 連接章節的過渡內容 |
| 自定義 | 用戶手動輸入節拍描述 |

**運作方式：**
1. AI 根據上一章或選定章節的內容，建議下一章的故事節拍
2. 用戶可選擇接受建議、選擇預設類型、或手動輸入自定義節拍
3. 生成內容時，故事節拍作為系統提示詞的一環引導 AI

---

## 生成上下文自定義

| 項目         | 說明                            |
| ---------- | ----------------------------- |
| 參考章節選擇     | 預設「無」，可從下拉列出所有其他章節（含無正文的章節）    |
| 參考 Wiki 內容 | Phase 2 實作                    |
| 章節要點       | 對整章的風格/方向補充指引，可在 Modal 中自由編輯  |
| 參考深度       | 淺層/標準/深度，控制 Context Budget 策略（Phase 2） |

> **注意**：「調整方向」按鈕已移除。對整章的風格或方向調整，請寫入「章節要點」後重新生成。局部文字調整請使用**右鍵選取 → 調整內容**功能（見下方）。

**預設提示詞模板（可在偏好設定 → AI 提示詞 編輯）：**

完整模板存於 `src/lib/prompt-defaults.ts` 的 `DEFAULT_CHAPTER_CONTENT_TEMPLATE`，由 `buildGenerationPrompt()` 透過 `renderTemplate()` 注入 `{{var}}` 後送給 LLM。預設結構：

```
## 背景資訊

### 世界觀
{{worldSetting}}{{mainPlotSection}}{{charactersSection}}

## 本章要求
- 章節標題：{{chapterTitle}}
- 故事節拍：{{beat}}
- 章節要點：{{points}}
- 目標字數：{{targetWords}}{{referenceSection}}{{olderSummarySection}}{{adjustInstructionSection}}

---
請開始撰寫本章正文。要求：
1. 嚴格遵守上述「本章要求」{{adjustInstructionRule}}
2. ...
```

> conditional 區段（如 `{{referenceSection}}`）由 caller 預先組成完整字串再注入；無內容則為空字串。
> 可用變數完整列表見「偏好設定 → AI 提示詞 → #2 章節正文 → 可用變數」。

**頂部工具列 UI（Phase 1 實作）：**

```
[參考章節 ▼] | [故事節拍 輸入] | [目標字數 輸入] | [📝 章節要點]
```

**底部動作列 UI（Phase 1 實作）：**

```
[💾 存入版本]   ←空白→   [💾 儲存]  [↩️ 重新生成]  [✨ 生成本章]
```

---

## 局部調整（Inline Edit）

選取正文中的任意片段後，按**滑鼠右鍵**，可選擇「✨ 調整內容」，開啟 **AdjustContentModal**。

### 流程

```
選取文字 → 右鍵 → 「✨ 調整內容」
  └─ AdjustContentModal 開啟
       ├── 顯示原段落（唯讀預覽）
       ├── 選擇上下文範圍（window / full）
       ├── 輸入調整方向（最高優先級指令）
       ├── 點擊「✨ 生成」→ AI 僅改寫選取段落
       ├── 預覽生成結果（替換後）
       ├── 可點「↻ 重新生成」重試（同一指令或修改指令）
       └── 點擊「✅ 接受寫入」→ saveVersion(kind='inline') → 更新章節正文
```

### 上下文範圍（Context Mode）

| 模式 | 說明 | 預設 |
|------|------|------|
| `window` | 選取段落前後各 N 字（N 可在偏好設定調整，預設 500） | ✅ |
| `full`   | 傳遞整章正文 | — |

> 偏好設定（⚙️ 偏好設定 → 選取調整內容）可設定預設模式與 window 字數。Modal 內可即時切換。

### 觸發條件

- 有選取文字（`selectionStart !== selectionEnd`）且選取內容含非空白字元
- 空白選取或空選取 → 不顯示「調整內容」選單項

### 版本快照

每次「✅ 接受寫入」前，自動呼叫 `saveVersion(kind='inline')`，在版本歷史中以「局部」標籤區別（詳見 05-versions）。


---

## 章節列表 UI 功能

| 功能 | 說明 |
|------|------|
| 編號徽章 | 每個章節左側顯示 `01`/`02` 數字徽章，依 array index 自動計算，排序後即時更新 |
| 拖曳排序 | 滑鼠拖曳章節項目可調整順序；上半部插入在目標前、下半部插入在目標後；放手後以 `reorderChapters()` 批次更新 DB |
| 多選刪除 | 每個章節項目左側有 Checkbox；全選有 indeterminate 狀態；選取後顯示 bulk-actions 動作列 |

---

## AI 提示詞系統（Prompt Templates）

本模組相關的 AI 任務共有 4+1 條 prompt，全部可在 **偏好設定 → 📜 AI 提示詞** 編輯：

| # | 模板 key | 觸發 |
|---|---------|------|
| 1 | `chapterDraftsTemplate` | 章節列表「✨ AI 生成章節」 |
| 1.5 | `chapterContinuationRules` | 嵌入 #1 的接續規則段（純文字） |
| 2 | `chapterContentTemplate` | 編輯器「✨ 生成本章」/「↩️ 重新生成」 |
| 3 | `chapterPointsTemplate` | 章節要點 Modal「✨ 重新生成」 |
| 4 | `inlineAdjustTemplate` | 正文右鍵 → ✨ 調整內容 |

模板語法：
- 僅支援 `{{var}}` 字串替換（極簡 engine，見 `src/lib/prompt-template.ts`）
- conditional 區段（如 `{{existingChaptersSection}}`）由 caller 預先組成完整字串再注入
- 預設模板存於 `src/lib/prompt-defaults.ts`

預覽功能：
- 「✏️ 編輯」顯示 raw template
- 「👁 預覽」用 `{{var}}` 代入後以 Markdown 渲染
- 變數來源切換：[當前專案 | 範例資料]
  - 「當前專案」抓 `useProjectStore` 中的真實值，沒專案則 fallback
  - 「範例資料」用 `PROMPT_TEMPLATE_SAMPLES` 寫死的 demo 字串

---

## 主編輯區 Markdown 渲染

章節正文編輯器頂端有「✏️ 編輯 / 👁 預覽」切換 tabs：
- 編輯模式：原本的 `<textarea>`，支援右鍵局部調整
- 預覽模式：以 `react-markdown` 渲染，雙擊回到編輯
- 右側顯示即時字數

---

## Prompt 除錯日誌

每次觸發「生成本章」或「重新生成」，`logPromptToTemp()` 會透過 Vite dev server（`POST /log-prompt`）將完整 prompt 寫入 `temp/chapter-gen-YYYYMMDD-HHMMSS.txt`。

**檔案格式：**
```
# chapter-gen
# time: 2026-05-11T14:30:52.000Z
# chapterId: <uuid>
# chapterTitle: 第一章標題
# beat: 引入 (Inciting Incident)
# targetWords: 3000
# provider: google
# model: gemini-1.5-pro

---

[完整 prompt 內容]
```

> `temp/` 已加入 `.gitignore`，不會被 commit。Production build 無 dev server，`logPromptToTemp()` 會 silently 失敗，不影響使用者。

---

> 主編輯介面的完整佈局規範（雙欄結構、左側分頁、右側工具列、底部動作列）請參見 [specs/ui-layout.md](../specs/ui-layout.md)
