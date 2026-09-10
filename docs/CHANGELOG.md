# 開發日誌

## 2026-09-10 - 在 README 新增技術棧總表

- 在繁中與英文 `README.md` 及 `README.en.md` 新增「技術棧（Tech Stack）」區塊，詳細列出前端框架、建構工具、狀態管理、UI 與樣式、桌面端核心、雙引擎儲存層、全文檢索、多媒體 Sidecar、LLM/Multi-Agent 引擎及測試品管工具。
- 與 `package.json`、`specs/tech-stack.md` 及目前實作架構進行交叉校對。

## 2026-07-30 - 修復 CI/CD lint 阻塞

- 修正 Multi-Agent、備份、LLM 與 Zustand stores 的嚴格 lint 錯誤，包括 JSON 回應的 `unknown` 型別驗證、錯誤 cause 保留、無效 catch／賦值與未使用變數。
- 保持 production TypeScript 的嚴格 lint 規則，僅對測試 mock 與 fixture 允許顯式 `any`。
- 移除 Wiki 查詢中已不需要的 TypeScript ignore，並維持備份及 Multi-Agent snapshot 不輸出 API key。

**Verification**
- `npm.cmd run lint` 通過（0 errors；保留 12 個既有 React Hook warnings）。
- `npx.cmd tsc -b` 通過。

## 2026-07-29 - 微調介面 Logo 字型大小、連線測試按鈕寬度與偏好設定用語

- 將側邊欄 Logo 標題英文 `Novel Generator` 字型大小由 `15px` 微調為 `14px`，避免標題被 CSS 截斷。
- 將偏好設定 LLM API 的「測試與驗證此設定檔連線」按鈕設定 `alignSelf: 'flex-start'`，使其寬度自適應文字內容。
- 將中文版偏好設定「一般 / General」分頁簡化為「一般」。
- 將中文版偏好設定中 LLM API 與 Agent 設定的「Profile」統一改為中文「設定檔」，圖片生成的「Provider」改為「服務提供商」。

## 2026-07-29 - 同步雙語介面與創作語言文件

- 更新中、英文 README，說明 `interfaceLocale` 與每本書不可變 `writingLanguage` 的責任邊界、雙語 Prompt、穩定預設代碼與英文 TTS。
- 更新 UI、版面、技術棧及 roadmap 規格，記錄全站翻譯覆蓋、雙語視覺 QA 與語言政策的權威程式位置。
- 更新書本、大綱、角色、章節、Wiki、LLM、Multi-Agent 與多媒體模組文件，確保所有 AI 內容流程依創作語言，而 UI 與動態訊息依介面語言。
- 純 Markdown 更新；已與 `Project.writingLanguage`、language policy、locale catalog、雙語 Prompt defaults、漫畫 TTS voice 與輸出驗證實作交叉檢查。

## 2026-07-29 - 完成全站中英介面覆蓋與動態語言邊界

- 將首頁、導覽、Toolbar、偏好設定、大綱、角色、章節、編輯器、Wiki、Lint、搜尋、備份、漫畫、場景、影片及 Multi-Agent 工作區全面接入 `zh-TW` / `en` locale catalog。
- 新增 production JSX 在地化回歸測試，阻止可見中文字串再次以硬編碼形式進入元件。
- 將介面語言與書本創作語言徹底分離：AI 正文、章節、角色、Wiki、Lint 修復、漫畫分鏡及 TTS 依書本 `writingLanguage`；按鈕、狀態、驗證、錯誤及原生檔案選擇器依 `interfaceLocale`。
- 英文書籍預設使用英文 TTS voice，單格與整章影片輸出都會驗證 voice 與創作語言相符；試聽文字也依書本創作語言。
- 補齊圖片 provider、LLM profile、Multi-Agent、Wiki/Lint、備份與同步等底層動態訊息的英文呈現，避免英文介面仍透出中文錯誤。
- Tauri 視窗標題會隨介面語言即時更新；初始標題改為中性的 `Novel Generator`。

**Verification**
- `npm.cmd exec tsc -- -b --pretty false` 通過。
- `npm.cmd exec vitest -- run --maxWorkers=1 --fileParallelism=false`：82 files、313 tests 全數通過。
- `src/lib/language-policy/ui-localization.test.ts` 通過，production JSX 無硬編碼可見漢字。

## 2026-07-28 - 建立 Interface Locale 切換閉環與 Language Policy seam (Issue #16)

- 實作全站通用翻譯介面 `t()`，從 `app`, `navigation`, `home`, `toolbar` namespace 切入，取代硬編碼中文。
- 檢視並修復 `detectInitialLocale`，讓 `en` / `zh-TW` 的 Interface Locale 切換正確寫入並生效。
- 確認 `<html lang>`、日期、字數與成本格式化受 Interface Locale 驅動。

## 2026-07-28 - 建立不可變的書籍 Writing Language (Issue #17)

- 新增書本表單提供繁體中文／English Writing Language 選項，並預設帶入全域偏好設定。
- 書籍建立後 `writingLanguage` 永久保存為唯讀，並於章節編輯器工具列以 Badge 標示。
- 載入或匯入時，確保缺少 `writingLanguage` 的舊書籍／舊備份一律正規化為 `zh-Hant`。

## 2026-07-28 - 以穩定代碼在地化題材、風格與章節節拍 (Issue #18)

- 實作 `GENRE_PRESETS`, `STYLE_PRESETS`, `BEAT_PRESETS`，讓內建題材、風格與節拍以穩定代碼 (code) 保存。
- 在 `NewBookModal`, `OutlinePanel`, `ChapterEditor` 中實作端到端的 localized preset 流程，UI 依 Interface Locale 顯示對應中英文名稱，儲存時自動正規化為 code。
- 確保舊中文與既有中英混合內建值可冪等正規化，無法辨識的值成為 Custom 保留原文。

## 2026-07-28 - 完成 i18n & Writing Language 功能 (Ticket #16 ~ #25)

- **Ticket #16**: 實作 Interface Locale 切換閉環與 Language Policy seam（支援 `zh-TW` / `en` 切換、自動偵測與預設寫入）。
- **Ticket #17**: 實作不可變的書籍 Writing Language 欄位（`writingLanguage: 'zh-Hant' | 'en'`），專案建立時寫入並鎖定，全站唯讀顯示 Badge。
- **Ticket #18**: 以穩定代碼在地化題材、風格與章節節拍（`normalizeGenre`, `normalizeStyle`, `normalizeBeat`, `resolveBeatLabel`）。
- **Ticket #19**: 重構 System Prompts 與 Prompt Target 結構語意，支援雙語系預設 PromptPair（`chapterDrafts`, `chapterOutline`, `characterProfile`, `expandContent`, `polishContent`, `summaryGeneration`, `wikiIngest`）。
- **Ticket #20**: 實作大綱與章節草稿 (Outline / Drafts) LLM 語意邊界與 Prompt 語系隔離。
- **Ticket #21**: 實作章節正文與段落擴充／潤色 LLM 語意邊界。
- **Ticket #22**: 實作角色草稿、摘要提煉與角色卡雙語系 LLM 語意邊界。
- **Ticket #23**: 讓漫畫與場景區分 Story Content／Technical Prompt，實作介面雙語化。
- **Ticket #24**: 加入英文 TTS 語音，並實作影片語言驗證預檢與介面雙語化。
- **Ticket #25**: 收斂 legacy 相容層並完成全站雙語驗收，通過 `tsc -b` 與 `vitest`。

**Verification**
- 執行 `npx vitest run` 所有 150+ 個單元測試全數通過（含新增之 `policy.test.ts`, `presets.test.ts`, `ai-tasks.drafts-language.test.ts`, `content-generation-language.test.ts`, `character-language.test.ts`, `agents-language.test.ts`, `wiki-language.test.ts`, `llm-fix-language.test.ts`）。
- 執行 `npx tsc -b` 無任何型別錯誤。

## 2026-07-28 - 完成中英雙語介面與書籍創作語言規劃

- 使用 `grill-with-docs` 與 domain modeling 釐清介面語系、書籍創作語言、內建／自訂 Prompt、創作內容與技術提示詞的邊界，並更新 `CONTEXT.md`。
- 新增雙語介面與書籍創作語言實作計畫，涵蓋：
  - 全新／既有安裝的語系初始化。
  - 書籍建立時選定且鎖定的創作語言。
  - Prompt provenance、不可覆寫的輸出語言契約與 Multi-Agent snapshot。
  - 題材、風格、章節節拍穩定代碼與舊資料遷移。
  - HTML／EPUB 語言 metadata、英文 TTS voices、完整翻譯盤點與雙語視覺 QA。
- 新增架構決策紀錄，說明為何介面語系與不可變的書籍創作語言必須分離。
- 查證英文出版／翻譯平台實際使用的題材、風格與敘事節拍名稱；確認 `Xuanhuan`、`Xianxia` 是實際使用的英文借詞，並避免把「都市」誤譯為 `Urban Fantasy`。

**Verification**
- 純 Markdown 規劃；已與 `package.json`、`src/types/`、`src/lib/storage/`、`settingsStore`、Prompt、Multi-Agent、書籍匯出與 TTS 實作交叉檢查。

## 2026-07-27 - 同步全站規格與模組文件至 Phase 4 Multi-Agent 完成現況

- 同步專案主說明與架構文件至最新實作狀態：
  - 更新 `README.md` 與 `README.en.md`：標記 Phase 4 Multi-Agent 協作引擎為已完成，補充具名 LLM Profiles 管理與 Anthropic Claude 直連。
  - 更新 `specs/roadmap.md`：將 Phase 4 Multi-Agent 協作引擎狀態更正為 `✅ 已實作（2026-07-27）`，完整紀錄流程、路由、保護鎖、時間軸與備份還原等細節。
  - 更新 `modules/09-multi-agent.md`：狀態從「未實作」更新為 `✅ 已實作（2026-07-27）`，詳述各執行器與資料層實作。
  - 更新 `modules/08-llm-adapter.md`：Anthropic 標記為已實作，補充 `LLMProfile` 與共同 `completeNormalized` seam。
  - 更新 `modules/03-chapters.md`：補充「⚡ 快速生成本章」Split Action 下拉選單、重複「↩️ 重新生成」按鈕移除紀錄、正文唯讀鎖定與 AI Activity Card / Agent Inspector 整合。
  - 更新 `specs/tech-stack.md`：補充 Anthropic Claude 直連與 Multi-Agent 協作引擎選型。
- 移除過時與歷史紀錄資料夾：
  - 依需求從 Repository 中完全移除 `docs/superpowers/`、`docs/agents/` 與 `docs/adr/` 資料夾。
- `.gitignore` 規則調整：
  - 依需求將 `docs/superpowers`、`docs/mocks`、`docs/agents`、`docs/adr` 及 `mocks/`、`agents/`、`adr/` 加入忽略清單。

**Verification**
- 純 Markdown 與 `.gitignore` 設定調整；已依 `AGENTS.md` 與 `package.json`、`src/types/`、`src/lib/storage/` 進行交叉檢查。

## 2026-07-27 - 更新偏好設定的 Wiki 與 Lint 文案

- 移除偏好設定中已過時的「Phase 2.5」與「尚未啟用」字樣；Wiki 問答、LLM Lint 模板與 deterministic pick-pages 均已有實際呼叫路徑。
- 保持產品功能狀態說明：LLM 驅動的 pick-pages 與 Graph 進階推理仍列為 roadmap 的 advanced polish，不將其誤稱為已完成。

**Verification**
- `node node_modules/typescript/bin/tsc -b` 通過。

## 2026-07-27 - 防範按鈕文字換行與修復「批次處理」按鈕版型

- 修復「批次處理」按鈕斷行破版：
  - 在 `ChaptersPanel.tsx` 為 Wiki 未同步提醒卡片的「批次處理」按鈕加上 `flexShrink: 0` 與 `whiteSpace: 'nowrap'`，並將提示文字加上單行溢出省略 (`textOverflow: 'ellipsis'`)，避免左側區塊拉窄時按鈕文字垂直換行破版。
- 全站 Button 元件基礎防破版保護：
  - 在 `Button.tsx` 的基底樣式中預設加入 `whiteSpace: 'nowrap'`，防止任何按鈕在窄寬度情境下字體斷行。

**Verification**
- `npx tsc -b` 通過。

## 2026-07-27 - 新增 AI 訊息卡片關閉按鈕與 Agent 執行紀錄時間戳記

- AI 訊息通知卡片新增關閉按鈕：
  - 在 `AIActivityCard.tsx` 新增 `onClose` / `onDismiss` 屬性與右上角 `✕` 關閉按鈕（`ai-activity-close-btn`）。
  - 在 `ChapterEditor.tsx` 中傳入關閉處理程序，使用者點擊 `✕` 時可隱藏該筆 Run 的通知區塊。
- Agent 執行紀錄標籤顯示時間戳記：
  - 在 `AgentRunPanel.tsx` 新增 `formatFullStepTime` 格式化函式 (`YYYY/mm/DD HH:MM`)。
  - 在右側 Agent 頁籤的各個步驟卡片標題處（例如 `Attempt #1 · completed`）補上時間戳記（如 `2026/07/27 15:05`）。

**Verification**
- `npx tsc -b` 通過。

## 2026-07-27 - 修復章節介面 ResizablePane 拖曳與寬度持久化

- 修復 `ResizablePane` 拖曳互動：
  - 改用 `window` 層級之 `mousemove` 與 `mouseup` 監聽器，解決快速拖曳或移出容器區域時拖曳事件丟失問題。
  - 正確扣除容器邊界 left offset (`clientX - containerRect.left`)，解決拖曳座標偏移與無法移動問題。
  - 加寬 resizer 碰撞熱區 (`margin: 0 -3px; width: 6px`) 並提供 active 狀態樣式回饋。
- 新增 `leftPaneWidth` 寬度持久化：
  - 在 `uiStore.ts` 引入 Zustand `persist` middleware，使左右區塊調整後的大小自動記錄於 `localStorage` (key: `novel-generator-ui`)，重新整理或重載應用後持續保持上一次設定的大小。

**Verification**
- `npx tsc -b` 通過。

## 2026-07-27 - 實作 AI 執行狀態回饋與 Multi-Agent 正文解鎖

- 完成 Multi-Agent 真實執行閉環：預檢後建立 Run 並進入全 App 單一執行槽，依序驅動 Planner 審核、Writer、Critic 路由、Editor 修訂與人工採用／修改，終止狀態會即時解除章節鎖定。
- 統一 `startRun`、`continueRun`、`cancelRun` command seam；所有 Agent LLM 呼叫支援 `AbortSignal`，取消會保留軌跡、阻擋遲到回應，App 重啟則將未結束 Run 安全轉為手動重試，避免自動重送與重複計費。
- 新增持久化 Run Activity 與 Zustand 同步層，串接章節工作卡、章節狀態徽章、全域 LLM 執行槽，以及可收合的版本／Agent Inspector。
- 執行期間正文改為 `readOnly`，仍可查看、選取與複製；依排隊、執行、審核、中斷、設定阻塞、失敗、完成與取消狀態提供對應動作。
- 建立共用 AI Activity Card，套用到快速正文、章節要點、世界觀／主線、角色、章節批次、局部調整、Wiki 問答與 Lint 修正；一般任務使用中性 AI 助理，Multi-Agent 使用隨 App 打包的 Planner／Writer／Critic／Editor 固定插畫與專業工作台版型。
- 視覺驗證通過 1440×900 與 1024×768：正文與 Inspector 無水平溢出或控制項裁切；重新載入後無 React 執行期錯誤。

**Verification**
- `node node_modules/typescript/bin/tsc -b` 通過（直接執行 TypeScript CLI，等同專案 `tsc -b`；PowerShell 執行原則會阻擋 `npx.ps1`）。
- 依專案 `AGENTS.md`，本階段未執行完整 Vitest。

## 2026-07-27 - 完成 AI 執行狀態回饋與正文解鎖設計評估

- 新增 `docs/superpowers/specs/2026-07-27-ai-execution-feedback-design.md`，盤點全專案 AI 長任務的現有回饋與改善優先級。
- 確認高品質 Multi-Agent 目前只建立 `pending` Generation Run 並鎖定章節，尚未由章節工作區啟動 Planner；既有 Agent 軌跡與審核元件也尚未接入畫面。
- 設計角色化 AI 工作卡、版本／Agent Inspector、章節狀態徽章、全域 LLM 執行槽與真實階段文案。
- 設計依 Run 狀態顯示取消、審核、重試與修復設定的正文解鎖閉環，並要求鎖定時正文保持可查看與複製。
- 本次為純 Markdown 設計評估；已與 `package.json`、`src/types/`、`src/lib/storage/`、Multi-Agent 實作與相關 UI 元件交叉檢查。

## 2026-07-27 - 調整偏好設定 UI 佈局與移除重複按鈕

- 移除重複按鈕：經過評估，章節底部工具列的「↩️ 重新生成」按鈕與 Split Action 主按鈕「⚡ 快速生成本章」綁定相同的單次 LLM 生成邏輯 (`runGeneration`)，功能 100% 重複。已將「↩️ 重新生成」按鈕移除，保留整合下拉選單（支援快速生成與高品質 Multi-Agent 生成）之主要 Split Action 按鈕。
- 彈出視窗尺寸：偏好設定 Modal 寬度由固定 720px 調整為 App 寬度的 70% (`width="70vw"`)。
- Tab 頁面與欄位標籤中文化：
  - 「Multi-Agent 策略」TAB 更名為「Agent 設定」；「選取調整」TAB 更名為「上下文範圍」。
  - 統一翻譯介面標籤（如 `服務提供商 (Provider)`、`發散度 (Temperature)`、`最大輸出長度 (Max Tokens)`、`連線逾時時間 (Timeout 秒數)`、`LLM 連線設定檔 (Connection Profile)` 等），保留 Token、LLM、Agent 等專有名詞。
- 說明提示圖示擴充：在 Temperature、Max Tokens、Timeout、Provider、Agent 角色設定、修訂門檻及 Wiki LLM 上限等欄位名稱旁新增懸停 `?` 說明圖示與詳細文字註解。
- Agent 區塊視覺強化：為四個 Agent（Planner、Writer、Critic、Editor）角色設定區塊加上左側專屬顏色立體邊框（藍、綠、橘、紫）與深色背景框，顯著提升辨識度。

**Verification**
- `npx tsc -b` 通過。

## 2026-07-27 - 納入 Multi-Agent JSON 備份與還原 (Issue #14)

- 擴充 JSON 備份與還原機制 (`src/lib/backup.ts`)：
  - `BackupSnapshot` 納入 `generationRuns`、`generationSteps` 與 `generationCheckpoints` 欄位。
  - 匯出選項 `includeFullAgentTrace`（預設啟用）：啟用時包含完整 Prompt / Response 軌跡；關閉時自動排除大型文字內容，但保留 `GenerationRunSummary`。
  - 敏感憑證防線：匯出快照時嚴格自動塗銷/過濾 Profile 中的 `apiKey`。
  - 還原安全性 (`importSnapshot`)：自動相容 v1 / v2 備份格式；還原之未結束 Run 重設狀態為 `awaiting_input`，絕不自動發起付費 LLM 請求。
- 新增 `backup-multi-agent.test.ts` 單元測試，驗證憑證遮蔽、軌跡選擇性匯出與靜態安全還原。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run` 67 個測試檔案全數通過。

## 2026-07-26 - 完成 Agent 可觀測性與紀錄生命週期 (Issue #13)

- 實作過期軌跡大內容清理與紀錄生命週期 (`src/lib/multi-agent/observability.ts`)：
  - `pruneOldRunTraces`：已完成/已取消之 Run 僅保留最近 3 筆完整 Prompt/Response 軌跡；較舊紀錄自動清理大內容，但永久保留 `RunSummary` 統計。
  - 未結束 (`pending`, `running`, `awaiting_input`) 與釘選 Run 嚴格受保護不進行清理。
  - `deleteGenerationRunRecord`：僅允許刪除已採用或已取消的 Run 紀錄；級聯移除步驟與 Checkpoint，不影響正式 `Chapter.content` 或 `ChapterVersion`。
- 實作 Agent 執行軌跡時間軸面板 (`src/components/chapters/AgentRunPanel.tsx`)：
  - 展示章節 Run 列表與即時狀態標籤。
  - 時間軸展開可預覽單步角色、attempt、usage (tokens)、Prompt/Response 內容與錯誤說明。
  - 提供審核點直接進入 `HumanReviewModal` 決策面板。
- 新增 `observability.test.ts` 單元測試，驗證最近 3 筆大內容保留、過期清理與未結束 Run 阻斷刪除。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/observability.test.ts` 通過。

## 2026-07-26 - 提供人工審核與人工修改分支 (Issue #12)

- 實作人工審核分支與決策處理 (`src/lib/multi-agent/human-review.ts`)：
  - 人工直接採用 (`humanAdoptDraft`)：寫入 `human_pass` 決策標記，沿用章節版本備份與 `Chapter.content` 更新安全交易。
  - 人工傳送至 Editor (`humanSendToEditor`)：支援加入補充修改方向，並在上限耗盡時允許授權額外 1 次 Editor 執行 (`maxRevisions + 1`)。
  - 人工直接修改草稿 (`humanEditDraft`)：產生遞增草稿版本 (`draftVersion` v1 -> v2) 並記錄 `human_edited` Checkpoint，避免繞過 Run 破壞追蹤。
- 建立 `HumanReviewModal` UI 組件 (`src/components/chapters/HumanReviewModal.tsx`)：
  - 完整展示當前 Candidate Draft 正文、Critic 六維度評分、重大缺陷警告與細節項。
  - 提供人工審核通過採用、輸入補充方向傳送 Editor、人工直接修改模式切換與授權額外修訂選項。
- 為 `GenerationCheckpointStore` 擴充 `update` 方法以支援修訂反饋補充方向。
- 新增 `human-review.test.ts` 單元測試，驗證人工採用、人工修改草稿版本遞增與授權額外修訂。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/human-review.test.ts` 通過。

## 2026-07-26 - 執行 Editor／Critic 修訂迴圈 (Issue #11)

- 新增 Multi-Agent Editor 預設 Prompt 模板 (`DEFAULT_MULTI_AGENT_EDITOR_TEMPLATE`)。
- 實作 Editor 步驟執行函式 `executeEditorStep` (`src/lib/multi-agent/editor.ts`)：
  - 嚴格驗證版本匹配：Editor 僅處理與當前 Candidate Draft 版本完全一致 (`feedback.draftVersion === candidateDraftVersion`) 的 Critic 反饋。
  - 修訂上限計數與控管：`maxRevisions`（預設 3 次）僅計算成功的 Editor 步驟；達上限時自動終止自動修訂並將 Run 狀態切換為 `awaiting_input`（進入人工審核）。
  - 修訂草稿遞增版本 (`draftVersion` v1 -> v2 ...) 並寫入 Trace 及 `editor_done` Checkpoint。
  - 完成後僅回到 Critic (`executeCriticStep`) 重新評審，絕不重回 Writer。
- 新增 `editor.test.ts` 單元測試，驗證版本錯配拒絕、maxRevisions 上限控管與修訂再評審採用迴圈。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/editor.test.ts` 通過。

## 2026-07-26 - 處理中斷、重試、取消與啟動恢復 (Issue #10)

- 調整 LLM 重試策略 (`src/lib/llm.ts`)：
  - 只有 HTTP 408、425、429 與 5xx (500, 502, 503, 504) 會依退避策略自動重試最多 3 次。
  - fetch 網路例外、AbortError 與 TimeoutError 視為結果不確定，立即拋出例外，寫入軌跡並標記中斷，不進行自動重試。
- 實作流程取消與 AbortSignal 控管 (`src/lib/multi-agent/resilience.ts`)：
  - `registerRunAbortController` / `cancelRun`：取消時發出 `AbortSignal` 並寫入 `cancelledAt` 時間戳，將 Run 狀態更新為 `cancelled`。
  - 遲到或中斷後的回應一律忽略，不得改寫已取消或更新狀態之 Run。
- 實作 App 啟動安全恢復 (`sanitizeStartupRuns`)：
  - 啟動時僅掃描並正規化未結束之 Run 狀態 (`running`/`pending` 轉為 `awaiting_input`)，絕不自動發起付費 LLM 請求。
- 新增 `resilience.test.ts` 單元測試，驗證 AbortController 訊號觸發、狀態轉換與啟動安全恢復。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/resilience.test.ts` 通過。

## 2026-07-26 - 由 Critic 評分並自動採用達標草稿 (Issue #9)

- 新增 Multi-Agent Critic 預設 Prompt 模板 (`DEFAULT_MULTI_AGENT_CRITIC_TEMPLATE`) 與格式修復 Prompt 模板 (`DEFAULT_MULTI_AGENT_CRITIC_REPAIR_TEMPLATE`)。
- 實作 Critic 評分與驗證邏輯 (`src/lib/multi-agent/critic.ts`)：
  - `recalculateTotalScore`：依據全域六維度 Rubric 配分 (`instructionAndBeat`, `plotLogic`, `characterConsistency`, `contextAndWorld`, `styleAndQuality`, `pacingAndStructure`) 重新計算加權總分，不直接信任模型總分。
  - `parseCriticResponse`：驗證 `draftVersion` 與目標評審草稿版本嚴格一致；格式無效或版本不符時自動進行一次格式修復 (attempt 2)。
- 實作 Critic 路由與自動採用機制 (`executeCriticStep`, `adoptCandidateDraft`)：
  - 重大缺陷 (`hasMajorFlaw: true`) 永遠優先阻擋自動採用。
  - 無重大缺陷且總分大於等於 `passScore` 時觸發自動採用（HQ Happy Path）。
  - 自動採用在同一交易中將舊正文備份為 `ChapterVersion`、更新 `Chapter.content` 為新草稿、結束 Run 並解除章節寫入鎖定。
- 新增 `critic.test.ts` 單元測試，驗證加權總分計算、草稿版本不符拒絕、重大缺陷阻擋與自動採用交易。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/critic.test.ts` 通過。

## 2026-07-26 - 由 Writer 產生可觀測的候選草稿 (Issue #8)

- 新增 Multi-Agent Writer 預設 Prompt 模板 (`DEFAULT_MULTI_AGENT_WRITER_TEMPLATE`)。
- 實作 Writer 步驟執行函式 `executeWriterStep` (`src/lib/multi-agent/writer.ts`)：
  - 讀取核准的 `planner_reviewed` 或 `planner_done` Checkpoint 以取得章節節拍與要點。
  - 使用 Writer assigned profile 及角色提示指引，呼叫 `completeNormalized` 寫作章節正文。
  - 每筆 Run 產生初始 Candidate Draft (`draftVersion`: 1)，寫入完整執行 Trace 與 `writer_done` Checkpoint。
  - 正式正文 (`Chapter.content`) 完全保持唯讀不被修改，亦不建立正式 `ChapterVersion`。
- 新增 `writer.test.ts` 單元測試，驗證 Writer 步驟執行、草稿版本 `draftVersion: 1` 產生、Checkpoint 寫入與 `Chapter.content` 唯讀保護。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/writer.test.ts` 通過。

## 2026-07-26 - 執行 Planner 並完成人工規劃審核 (Issue #7)

- 新增 Multi-Agent Planner 預設 Prompt 模板 (`DEFAULT_MULTI_AGENT_PLANNER_TEMPLATE`) 與格式修復 Prompt 模板 (`DEFAULT_MULTI_AGENT_REPAIR_TEMPLATE`)。
- 實作 `executePlannerStep` 與 `parsePlannerResponse` (`src/lib/multi-agent/planner.ts`)：
  - 依據快照與專案/章節資訊動態渲染 Planner 提示詞。
  - 回傳 JSON 結構驗證 (`beat`, `points`, `explanation`)，格式無效時自動執行一次格式修復 (attempt 2)；若仍失敗則寫入軌跡並停留在可手動重試狀態。
  - 成功完成後建立 `planner_done` Checkpoint 並將 Run 狀態轉換為 `awaiting_input`。
- 實作 Planner 人工審核選擇與持久化處理 (`applyPlannerReviewChoice`)：
  - 支援「正式採用並寫回章節」：同步更新 `Chapter.beat` 與 `Chapter.points`，後續取消生成不復原改動。
  - 支援「僅供本次生成使用」：不改動現有章節設定，僅帶入本次生成執行。
- 建立 `PlannerReviewModal` UI 組件，視覺化呈現現有章節規劃與 Planner 新規劃比較面板，供使用者預覽、微調並決策。
- 擴充 `StorageAdapter` 介面，為 `ChapterStore` 新增 `get(id)` 支援。
- 新增 `planner.test.ts` 單元測試，驗證 JSON 清理、陣列點轉換與欄位缺失例外處理。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run src/lib/multi-agent/planner.test.ts` 通過。

## 2026-07-26 - 建立可持久化的高品質生成 Run Shell (Issue #6)

- 新增 `GenerationRun`、`GenerationStep`、`GenerationCheckpoint` 資料模型與 SQLite / Dexie 儲存層 schema（IndexedDB schema v9, SQLite migration 008）。
- `StorageAdapter` 擴充 `generationRuns`、`generationSteps` 與 `generationCheckpoints` 介面，同步支援 IndexedDB（Dexie）與 SQLite。
- 章節編輯器（`ChapterEditor`）生成按鈕改為 Split Action 模式：主按鈕為 `⚡ 快速生成本章`，下拉選單提供 `🤖 高品質生成 (Multi-Agent)...`。
- 實作高品質生成預檢 Modal (`MultiAgentPreflightModal`)：啟動前顯示各 Agent 角色 assigned profile、模型名稱、預估步驟上限 (Max Steps)、Editor 修訂上限 (Max Revisions)、Critic 評分門檻與可用時的 Token／成本估算，並由使用者確認。
- 實作 Run Shell 建立與約束機制：
  - 唯一性：同章節限制只能有一筆未結束 Run (`status` in `pending`, `running`, `awaiting_input`)。
  - 正文寫入鎖定：章節有未結束 Run 時鎖定 `Chapter.content` 編輯與寫入入口。
  - Profile 刪除鎖定：Run 引用的 LLM Profile 在 Run 結束或取消前不可刪除。
  - 排隊與取消：Run 可主動取消，重新整理或重啟後持續保持，且預檢建立 Run 時不會自動發出付費 LLM 請求。
- 新增 Multi-Agent 儲存層與 Run Shell 單元測試 (`storage-multi-agent.test.ts`)，驗證唯一性、checkpoint、取消與 Profile 鎖定約束。

**Verification**
- `npx tsc -b` 通過。
- `npx vitest run` 通過。

## 2026-07-26 - 設定 Agent 角色與 Critic 全域策略 (Issue #5)

- 定義 `MultiAgentPrefs` 偏好設定資料結構，支援四個 Agent 角色 (Planner, Writer, Critic, Editor) 指定具名 LLM Profile 與覆寫 model、temperature、maxTokens 及編輯 Role Guidance。
- 設定 `maxRevisions` 限制（預設 3，強制介於 1–5）。
- 實作 Critic 評分門檻與驗證機制 (`validateCriticThresholds`，預設 humanReviewFloor 80、passScore 85，並驗證 `0 <= humanReviewFloor < passScore <= 100`)。
- 實作 Critic 六維度 Rubric 配分與驗證機制 (`validateCriticWeights`，預設 20/20/20/15/15/10，驗證數值非負且總和必為 100)。
- 提供 Token 估算與成本顯示選項控制（包含每百萬 input/output token 單價及顯示幣別，關閉顯示仍保留實際 provider usage 保存）。
- 在偏好設定 Modal 新增「🤖 Multi-Agent 策略」分頁，提供完整 UI 表單及即時驗證警示。
- 偏好設定備份與匯入/匯出 (`settings-backup`) 整合 Multi-Agent 策略設定備份。
- 新增與更新 Multi-Agent 偏好設定、門檻、配分驗證、儲存庫 persist 與備份匯入/匯出單元測試。

**Verification**
- `npx tsc --noEmit` 通過。
- `npx vitest run` 60 個測試檔案 (共 230 個測試) 全數通過。

## 2026-07-26 - 支援 Anthropic Claude 直連 Profile (Issue #4)


- 新增 Anthropic Claude 直連 Profile 支援（預設 endpoint `https://api.anthropic.com/v1`，模型 `claude-3-5-sonnet-20241022`）。
- 實作 Anthropic Messages API completion handler (`completeAnthropicNormalized`)，包含 `x-api-key` 與 `anthropic-version` 認證標頭及 `system` prompt 處理。
- 正規化 Anthropic 回應之正文 (`content` text blocks)、`input_tokens`／`output_tokens` usage、`request-id` 與 `stop_reason`。
- Vite dev proxy (`llmProxyPlugin`) 支援轉發 `x-api-key` 與 `anthropic-version` 請求標頭。
- 新增 Anthropic 請求格式、回應正規化、usage、`stop_reason`、錯誤處理與憑證遮蔽單元測試。

**Verification**
- `npx tsc --noEmit` 通過。
- `npx vitest run` 59 個測試檔案 (共 224 個測試) 全數通過。

## 2026-07-26 - 建立具名 LLM Connection Profiles 與共同 Completion Seam (Issue #3)


- 新增 `LLMProfile` 型別與 `llmProfiles` 多 Profile 管理機制，支援建立、編輯、切換預設、刪除與連線驗證。
- Profile 設定欄位新增 `temperature`、`maxTokens` 與 `timeoutSec` (30–3600 秒 timeout 控制)。
- 建立共同 LLM completion seam (`completeNormalized`)，統一正規化 OpenAI-compatible、Google Gemini 與 Grok 之回應正文、token usage (`promptTokens` / `completionTokens` / `totalTokens`)、`requestId` 與 `finishReason`。缺少欄位時具有明確且穩定的 `null` 表示。
- 實作 Profile 連線驗證功能 (`verifyLLMProfile`)，回傳正規化連線結果，並具備 API Key 遮蔽機制 (`sanitizeApiKey`)，避免 API Key 洩漏至 log 或 UI 錯誤顯示。
- 偏好設定備份與匯入/匯出 (`settings-backup`) 支援多 Profile 與選擇性包含 API Key，並完整相容舊版單一 `llmConfig` 設定之自動遷移。
- 新增與更新 Provider 正規化、timeout、usage、連線驗證與設定遷移單元測試。

**Verification**
- `npx tsc --noEmit` 通過。
- `npx vitest run` 59 個測試檔案 (共 223 個測試) 全數通過。

## 2026-07-26 - Multi-Agent 規劃與規格


- 完成 Phase 4 Multi-Agent 章節生成的規劃訪談，並將持久化工作流、人工審核、Critic 六維度評分、Writer／Editor 草稿可觀測性、LLM 角色設定、成本與 token 顯示、正文鎖定及執行紀錄管理等決策整合至 `modules/09-multi-agent.md`。
- 建立 Multi-Agent 領域詞彙與架構決策紀錄，並補充 Agent 使用的 issue tracker、標籤與 domain 文件索引。
- 建立 GitHub Issue [#2](https://github.com/newesp/novel-generator/issues/2) 作為 Phase 4 實作規格，並標記 `ready-for-agent`。
- 本次僅異動 Markdown 規格與文件追蹤設定，未變更程式碼；依專案驗證規範不執行 `tsc -b`。

## 2026-07-18 - Synchronize v2 UI documentation

- Replaced the obsolete Apple/red and draggable-tab layout specs with the implemented Mantine Gray v2 design system and fixed workspace shell.
- Documented the independent Outline, Character, Scene, Chapter, Wiki, Comic, and Video workspaces, including local-scroll and 1024px layout rules.
- Updated README, roadmap, and affected module docs to use the v2 entry points and removed documentation for the duplicate Chapter `轉漫畫` action.
- Kept v1 preservation explicit at tag `v1.0.0` and branch `release/v1`.

## 2026-07-18 - Optimize v2 outline, character, and scene workspaces

- Rebuilt Outline as a full-height workspace with a fixed basic-settings column and responsive world/plot editors; text areas scroll locally without creating a page-level scrollbar.
- Reworked Characters into a master/detail workspace with a searchable local list, inline editing, Basic/Story/Comic Visual tabs, and the existing relationship graph as an alternate detail view.
- Kept character CRUD, AI generation/fill, relationship data, visual prompts, and reference-image storage on their existing handlers and data model.
- Flattened the selected Scene editor into text and reference-image columns while preserving chapter/panel context, scene assignment, creation, deletion, upload, preview, and storage behavior.
- Added responsive 1024px constraints so editor columns remain usable without clipping or horizontal overflow.
- Tightened the Scene assignment row so its label, dropdown, and content-width create button remain grouped, and removed the excess gap between the scene-prompt label and textarea.

**Verification**
- `tsc -b` passed.
- Edge visual QA passed at 1440×900 and 1024×768 for Outline, Character Story/Comic Visual, and Scene workspaces.
- Browser measurements confirmed the body and v2 workspace have matching scroll/client dimensions at both tested viewports; only intended text and gallery regions can scroll locally.
- Scene spacing QA confirmed a 128px create button, a 520px dropdown cap, a 6px prompt label gap, and no horizontal overflow at both tested widths.

## 2026-07-17 - Refine v2 resource and scene workspaces

- Removed the unrelated chapter editor from Outline and Character workspaces; each now uses one focused resource pane.
- Removed the chapter/panel rail from the dedicated Scene workspace and moved its chapter/panel context controls into a compact top row.
- Replaced the always-expanded scene list with a searchable single-select control, including the `無場景` option, and render only the selected scene's visual-settings card.
- Kept existing scenes editable even when no comic panel exists; only the panel-dependent `從此格建立場景` action is disabled.
- Removed the duplicate `轉漫畫` action from the Chapter editor because the Comic workspace is now the canonical entry point.

**Verification**
- `tsc -b` passed.
- Edge visual QA passed at 1440×900 and 1024×768 with no page-level horizontal overflow or clipped visible controls.
- Browser interaction QA confirmed one rendered scene card for three stored scenes, scene-card replacement after selection, a compact 128px create button, hidden Scene rail, and no Chapter `轉漫畫` button.

## 2026-07-17 - Start the Mantine v2 local workspace UI

- Marked the pre-v2 baseline as tag `v1.0.0` and branch `release/v1`; v2 development continues on `codex/v2-local-ui`.
- Added Mantine with the default Gray palette and Lucide icons, then rebuilt the editor around a fixed workspace sidebar and compact project toolbar.
- Added independent Scene, Comic, and Video workspace presentations while retaining the existing shared comic storage, generation, TTS, ffmpeg, MP4, SRT, and media-library logic.
- Moved reference chapter, target word count, chapter tone, and chapter points into one Chapter Settings dialog; chapter points now follow chapter tone directly.
- Expanded Wiki into a full-width workspace and replaced browser `prompt()` slug renaming with a validated Mantine input dialog that still updates internal Wiki references through the existing rename mutation.

**Verification**
- `tsc -b` passed.
- Browser interaction QA passed in Edge at 1440×900 and 1024×768: chapter settings, Wiki create/rename, Scene/Comic/Video workspace switching, video source-audio controls, and video settings dialog.
- No page-level horizontal overflow or clipped visible button labels were detected at 1024px.

## 2026-07-06 - Add GitHub Actions CI/CD

- Added a focused GitHub Actions workflow for PR `lint` / `test` / `build` checks and `main` Windows Tauri MSI workflow artifacts.
- Pinned all workflow actions to full commit SHAs verified by `git ls-remote`, disabled checkout credential persistence, and added a CI job timeout.
- Documented why the current CD target is a downloadable desktop artifact instead of GitHub Pages.
- Updated README, book module, and roadmap export-format status to match the implemented `.txt`, `.html`, and `.epub` full-book export flow.
- Resolved lint/test blockers required to make the new CI meaningful: kept React compiler-only lint rules disabled with an explicit rationale, removed a dead assignment, tightened File System Access typing, preserved caught-error causes, and made remote image persistence read `Response.arrayBuffer()` directly.

**Self-review**
- Correctness: CI commands match `package.json`; `main` desktop artifact build is gated by the CI job; GitHub Pages is intentionally excluded because it would not support Tauri-native capabilities.
- Security/data: workflow permissions are read-only; checkout credentials are not persisted; actions are pinned to immutable full SHAs; the only token reference is GitHub's scoped `GITHUB_TOKEN`; no new secrets, PII, or customer-identifiable data were added.
- Maintainability: docs now describe CI/CD behavior and export status; remaining React Hook dependency warnings are existing codebase cleanup, deferred to avoid broad UI refactors in this CI/CD change. Cargo caching and explicit MSI artifact retention are deferred because the current workflow is correct without them; they can be added later if main-branch build time or artifact retention policy becomes a problem.

**Verification**
- `npm.cmd run lint` passed with 8 existing React Hook dependency warnings.
- `npm.cmd run test` passed: 59 files, 216 tests.
- `npm.cmd run build` passed; Vite reported the existing large chunk / plugin timing warnings.

## 2026-07-02 - Fix desktop book export save dialog

- Fixed Tauri desktop book export so `.txt`, `.html`, and `.epub` are accepted by the shared binary save dialog.
- Replaced the image-only extension whitelist in the desktop binary export command with a validated per-call extension, preserving filename and selected-path safety checks.
- Added Rust regression coverage for book export extensions and unsafe extension rejection.

**Verification**
- `npx.cmd tsc -b` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml binary_export --lib` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-export-fix`: 2 tests.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with the same Cargo target dir.

## 2026-06-30 - Tighten comic sidebar headings and checkbox spacing

- Matched ComicModal sidebar headings such as `角色`, `參考圖`, `場景`, and `場景視覺設定` to the compact 12px label scale.
- Fixed the `保留影片原聲` checkbox spacing by overriding the full-width panel input rule and using a fixed 14px checkbox column with a 4px label gap.

**Verification**
- `tsc -b` passed.

## 2026-06-30 - Normalize comic panel MP4 settings typography

- Normalized ComicModal MP4 clip setting labels and controls to a compact 12px label scale.
- Left-aligned the `保留影片原聲` checkbox row so the checkbox and label stay close together.
- Fixed shared comic `FieldLabel` typography so labels such as `手動秒數` match smaller section headers like `旁白腳本`.

**Verification**
- `tsc -b` passed.

## 2026-06-30 - Re-encode chapter MP4 audio concat

- Changed full-chapter comic MP4 export to re-encode concatenated segments as H.264/AAC instead of stream-copying them.
- Changed chapter concatenation to pass each panel segment as an independent ffmpeg input and join them with the concat filter, avoiding AAC decoder failures at MP4 segment boundaries.

**Verification**
- `tsc -b` passed.
- `npx.cmd vitest run src/lib/comic/video/video-renderer.test.ts` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-concat-audio`.
- `cargo test --manifest-path src-tauri/Cargo.toml chapter_concat_filter_decodes_each_segment_independently` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-concat-audio`.

## 2026-06-30 - Regenerate missing comic TTS audio

- Checked reusable comic TTS audio and panel segment files against the desktop media filesystem before reusing them.
- Regenerated missing panel narration MP3 files before rendering uploaded MP4 clip segments, avoiding ffmpeg failures from stale `MediaAsset.path` records.

**Verification**
- `tsc -b` passed.

## 2026-06-30 - Phase 3 book export

- Added full-book export for `.txt`, `.html`, and `.epub` from the editor toolbar.
- Added a shared book export builder with sorted chapters, HTML escaping, and a dependency-free EPUB 3 ZIP package.
- Added a book export modal that uses the existing Web save picker / Tauri native save dialog flow and reports saved, downloaded, cancelled, and failure states.
- Updated the output format spec for the implemented export pipeline.

**Verification**
- `npx.cmd vitest run src/lib/book-export.test.ts` passed: 1 file, 5 tests.
- `npx.cmd tsc -b` passed.
- `npm.cmd run dev -- --host 127.0.0.1` reached Vite ready state in foreground.
- Browser visual QA was not completed because background Vite processes launched from this PowerShell environment exited before port 5173 stayed reachable; layout was checked by code review against the toolbar flex row and export modal responsive grid.

## 2026-06-27 - Comic image save location picker

- Changed ComicModal panel-image and preview-image download actions to open a save-location picker instead of immediately downloading to the browser default folder.
- Added shared Blob file saving support for Web `showSaveFilePicker` and a Tauri desktop image save dialog, with direct download kept only as the unsupported-browser fallback.

**Verification**
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-comic-image-save`.

## 2026-06-27 - Stack MP4 clip audio controls

- Changed the MP4 clip settings layout to three stable rows: keep source audio, source audio volume, and long-narration behavior.
- Prevented the `保留影片原聲` label from wrapping into vertical text in narrow comic panel settings.

**Verification**
- `tsc -b` passed.

## 2026-06-27 - Add MP4 source audio volume control

- Added a per-panel MP4 source audio volume control for clip-based comic video segments.
- Mixed preserved MP4 source audio through ffmpeg `volume` before combining it with narration.
- Kept the `保留影片原聲` checkbox and label on one row and added responsive layout rules for the MP4 clip settings block.

**Verification**
- `tsc -b` passed.
- `vitest run src/lib/comic/video/video-clips.test.ts src/lib/comic/video/video-renderer.test.ts src/lib/comic/storage-types.test.ts` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-clip-volume`.

## 2026-06-27 - Remove unavailable Edge-TTS voices

- Trimmed the comic video narrator voice menu to the Chinese / Cantonese Edge-TTS voices currently reported by `edge-tts --list-voices`.
- Removed stale Edge-TTS voice ids that can fail with `NoAudioReceived`.
- Converted Edge-TTS `NoAudioReceived` failures into a short user-facing message that asks the user to choose another narrator voice.

**Verification**
- `tsc -b` passed.
- `vitest run src/lib/comic/video/voices.test.ts` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-voice-list`.

## 2026-06-27 - Fix comic voice preview playback

- Fixed narrator voice preview playback on Tauri desktop by reading the generated preview MP3 through a safe media-file command and playing it from a Blob URL.
- Avoided relying on Tauri local asset URLs for audio preview, which could fail with `Failed to load because no supported source was found`.

**Verification**
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-voice-preview`.

## 2026-06-27 - Add comic video voice preview

- Added a small `試聽` button next to the full-chapter video narrator voice selector.
- The preview generates a short Edge-TTS sample for the currently selected voice and plays it in-place without creating a persisted media asset.
- Added playback state and compact row styling so the voice selector remains stable in the settings modal.

**Verification**
- `tsc -b` passed.

## 2026-06-27 - Backup export location and settings snapshots

- Moved the preference settings export/import controls from the body card to the top-right of the Preferences modal header, above the tab list.
- Changed manual JSON backup export to use a save/folder picker when supported, including a Tauri Windows folder picker for desktop exports.
- Replaced the Tauri Windows export picker with a modern Save File dialog so users can navigate from This PC, drives, Desktop, Downloads, and other common locations.
- Added standalone preference settings export/import JSON with an opt-in checkbox for including API keys; exports omit API keys by default and imports preserve existing keys when the file does not contain them.
- Added a narrow Tauri command that writes JSON only after the user picks an export directory and validates the generated filename.
- Added desktop-only complete project ZIP export/import using Rust-side stored ZIP entries. The archive contains `backup.json`, `manifest.json`, and media files under their media-root-relative paths; preferences and API keys are not included.
- Restored imported ZIP media under the new computer's project media root while preserving each original relative path, then rewrote imported `mediaAssets[].path` to the new local paths.
- Added Backup modal controls for complete ZIP export/import on Tauri desktop and left the Web version explicitly marked as TODO.

**Verification**
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-backup`.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with the same Cargo target dir: 10 tests.

## 2026-06-26 - Fix Tauri dev watcher on Windows

- Ignored `src-tauri/target` in Vite dev-server file watching so `npm run tauri dev` does not crash on locked Rust build artifacts during compilation.
- Installed local npm dependencies and the Rust stable MSVC toolchain required by Tauri on this machine.

**Verification**
- `npx.cmd tsc -b` passed.
- `npm.cmd run tauri -- info` passed and detected WebView2, MSVC Build Tools, Rust, Cargo, and rustup.
- `npm.cmd run tauri dev` compiled and launched the Tauri app; the verification process was stopped afterward to free port 5173.

## 2026-06-26 - Add English README

- Added `README.en.md` as an English counterpart to the current Chinese README.
- Linked the Chinese and English README files to each other.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- `git diff --check` passed.

## 2026-06-26 - Update project license

- Updated project metadata to `AGPL-3.0-only`.
- Added a root `LICENSE` summary file and documented the license in `README.md`.
- Checked tracked files and git history for an English README; only `README.md` was found.

**Verification**
- Documentation / metadata-only change; skipped `tsc -b`.
- `git diff --check` passed.

## 2026-06-26 - Auto-mute silent panel MP4 clips

- Added ffprobe audio-stream detection for uploaded panel MP4 clips and stored the result in clip metadata.
- Updated clip segment rendering so `保留影片原聲` automatically falls back to mute when any selected clip has no audio track.
- Added a clip list indicator for `有音軌` / `無音軌` so users can see why source audio may be skipped.

**Verification**
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `vitest run src/lib/comic/video/video-clips.test.ts src/lib/comic/video/video-validation.test.ts src/lib/comic/video/panel-cleanup.test.ts src/lib/comic/storage-types.test.ts src/lib/comic/video/video-renderer.test.ts` passed: 5 files, 17 tests.

## 2026-06-25 - Add panel MP4 clip visual sources

- Added panel-owned MP4 clip uploads for comic video panels, persisted through `ComicPanel.videoClipAssetIds` and `MediaAsset(kind='video')`.
- Added Tauri ffprobe/ffmpeg commands to probe uploaded clip duration and render one or more panel clips with Edge-TTS narration into a reusable segment MP4.
- Added per-panel clip render settings for keeping MP4 source audio and choosing whether longer narration freezes the last frame or loops the uploaded clip sequence.
- Updated segment reuse metadata so full-chapter export can directly concat matching single-panel outputs without regenerating unchanged clip-based segments.
- Added UI controls to upload, inspect duration, and delete per-panel MP4 clips; deleting a panel now also deletes its related clip assets.
- Documented the current manual MP4-upload flow and left Image-to-Video provider adapters as a future TODO.

**Verification**
- `tsc -b` passed.
- `cargo check` passed.
- `cargo test clip_video_filter --manifest-path src-tauri/Cargo.toml` passed: 2 tests.
- `vitest run src/lib/comic/video/video-clips.test.ts src/lib/comic/video/video-validation.test.ts src/lib/comic/video/panel-cleanup.test.ts src/lib/comic/storage-types.test.ts src/lib/comic/video/video-renderer.test.ts` passed: 5 files, 16 tests.

## 2026-06-25 - Add Lint batch undo UI

- Added a generic `undoWikiLogBatch()` helper that reverts `wiki_log` batches without requiring a chapter, while preserving the existing chapter ingest undo behavior.
- Added a Lint report action to undo all Wiki fixes applied by the current Lint batch and reload the Wiki state after revert.
- Updated Lint visible text toward Chinese labels while keeping `Lint` as the domain term.
- Removed the summary quality trend report from the Phase 2.5 remaining list and updated the next priority order.

**Verification**
- `vitest run src/lib/wiki-undo.test.ts` passed: 1 file, 1 test.
- `tsc -b` passed.
- Browser visual QA was not run because the in-app browser tool was unavailable and starting Vite through this PowerShell environment hit a `Start-Process` PATH issue; layout was checked by code review against the modal's flex-wrap action row.

## 2026-06-25 - Documentation refresh for current Phase 6 state

- Updated README, module docs, roadmap, tech-stack, deployment, debug notes, and AI loading guides against the current comic video implementation.
- Documented per-panel motion effects, Edge-TTS sentence-level SRT timing, explicit selected-panel MP4 rerendering, migration `007_comic_tts_video_metadata.sql`, and remaining Phase 6 polish.
- Updated `skills/llm-wiki` docs/prompts from file-based wiki language toward the current DB-backed `WikiPage` / `WikiLogEntry` integration.

**Verification**
- Documentation-only change; skipped `tsc -b` per AGENTS.md.
- Cross-checked against `package.json`, `src/types/index.ts`, `src/lib/storage/types.ts`, `src/lib/storage/tauri-sqlite-adapter.ts`, `src/components/comic/ComicModal.tsx`, `src/lib/comic/video/*`, and `src-tauri/src/lib.rs`.
- Ran Markdown stale-term scans with `rg`.

## 2026-06-25 - Fix single-panel MP4 rerender

- Fixed `單格輸出 MP4` so pressing it again explicitly rerenders the selected panel segment instead of returning the reusable existing MP4 and only showing the completion message.
- Kept full-chapter MP4 export segment reuse intact, so unchanged matching panel segments are still reused during chapter export.

**Verification**
- `vitest run src/lib/comic/video/video-renderer.test.ts` passed: 1 file, 6 tests.
- `tsc -b` passed.

## 2026-06-25 - Fix motion effect aspect ratio

- Fixed MP4 motion effects so `slow_zoom_in` and other animated effects preserve the same aspect-fitted, padded panel frame as `none` before applying camera movement.
- Added a Rust regression test that prevents motion filters from using the crop/fill path that distorted portrait comic panels.

**Verification**
- `cargo test motion_video_filter --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-motion`: 2 tests.
- `tsc -b` passed.

## 2026-06-25 - Fix motion effect menu contrast

- Fixed the Motion effect dropdown menu entries so native option text renders dark on the white popup background.

**Verification**
- `tsc -b` passed.

## 2026-06-24 - Comic MP4 motion effects

- Added per-panel MP4 motion effects for comic video export: none, slow zoom in/out, pan directions, Ken Burns focus variants, pulse zoom, crash zoom, subtle shake, fade in, and fade out.
- Added a shared motion-effect option list for ComicModal, persisted `ComicPanel.motionEffect`, and stored the selected effect in segment metadata so changed effects rerender instead of reusing stale MP4 segments.
- Updated the Tauri ffmpeg segment renderer to build effect-specific `zoompan` / `fade` filters while preserving the original static centered output for `none`.

**Verification**
- `vitest run src/lib/comic/video/video-renderer.test.ts` passed: 1 file, 5 tests.
- `cargo test motion_video_filter --manifest-path src-tauri/Cargo.toml` passed with `CARGO_TARGET_DIR=%TEMP%\novel-generator-cargo-target-motion`: 2 tests.
- `tsc -b` passed.

## 2026-06-24 - Edge-TTS sentence subtitle timing

- Changed comic chapter SRT generation to use Edge-TTS sentence-level subtitle timing from each panel's `--write-subtitles` output instead of showing each panel's full narration for the whole segment duration.
- Stored per-segment subtitle cues in video metadata so reusable segments can keep precise sentence timing; older segments without cue metadata are regenerated.
- Added SRT parsing and offset composition helpers for merging panel subtitles into chapter-level YouTube sidecar captions.

**Verification**
- `vitest run src/lib/comic/video/subtitles.test.ts src/lib/comic/video/video-renderer.test.ts` passed: 2 files, 7 tests.
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 2 tests.

## 2026-06-23 - Recover stale comic video segments

- Fixed ComicModal video library segment rows that showed `媒體檔案遺失` when the database media asset record was stale but the deterministic `segments/segment-00N.mp4` file still existed.
- Added a safe Tauri `media_file_exists` command and wired ComicModal video state refresh to recover segment paths from the chapter `comic-video/segments` folder.

**Verification**
- `vitest run src/lib/comic/video/video-state-refresh.test.ts src/lib/comic/video/video-library.test.ts src/lib/comic/video/video-renderer.test.ts` passed: 3 files, 8 tests.
- `tsc -b` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml media_file_exists_reports_existing_safe_media_file` passed: 1 test.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.

## 2026-06-23 - Refresh comic video segments in UI

- Refreshed ComicModal video state from storage after single-panel and full-chapter MP4 exports, so the video library shows newly generated segment assets instead of stale missing references.
- Added a compact single-panel MP4 file row with open and reveal actions next to the generated path.
- Added a focused video-state refresh helper and test.

**Verification**
- `vitest run src/lib/comic/video/video-state-refresh.test.ts src/lib/comic/video/video-library.test.ts src/lib/comic/video/video-renderer.test.ts` passed: 3 files, 7 tests.
- `tsc -b` passed.

## 2026-06-23 - Comic sidecar subtitle MVP

- Added full-chapter SRT subtitle generation for comic video export. `整章輸出 MP4` now writes `chapter-video.srt` from panel narration and segment timing, without burning subtitles into the MP4.
- Added `MediaAsset(kind='subtitle')` and `ChapterComic.subtitleAssetId` so SRT files are stored as sidecar media assets for YouTube-style toggleable captions.
- Updated the ComicModal video library to list, open, reveal, delete, and rerender chapter SRT subtitle assets alongside MP4 assets.
- Updated multimedia, roadmap, tech-stack, and README docs for the MP4/SRT workflow.

**Verification**
- `vitest run src/lib/comic/video/subtitles.test.ts src/lib/comic/video/video-renderer.test.ts src/lib/comic/video/video-library.test.ts src/lib/comic/storage-types.test.ts src/lib/tauri-migrations.test.ts` passed: 5 files, 10 tests.
- `tsc -b` passed.

## 2026-06-23 - Open comic video folder directly

- Changed the ComicModal video library "定位" action on Windows to open the MP4 parent folder directly instead of using Explorer `/select`.
- Kept mixed-separator normalization so existing paths containing `comic-video/segments/` open the correct `segments` directory.

**Verification**
- `cargo test --manifest-path src-tauri/Cargo.toml windows_reveal_folder_arg` passed: 1 test.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `tsc -b` passed.

## 2026-06-23 - Fix comic video reveal on Windows

- Fixed the ComicModal video library "定位" action on Windows by quoting the Explorer `/select` target path and normalizing mixed path separators.
- Added Rust tests for the Windows reveal argument, including existing MP4 paths that contain `comic-video/segments/`.

**Verification**
- `cargo test --manifest-path src-tauri/Cargo.toml windows_reveal_arg` passed with a separate Cargo target dir: 2 tests.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with the same separate target dir.
- `tsc -b` passed.

## 2026-06-22 - Expand comic narration voices

- Expanded ComicModal video narration voice choices from three hard-coded options to grouped Taiwan Mandarin, China Mandarin, and China regional Mandarin Edge-TTS voices.
- Added a shared `voices.ts` list for ComicModal and a focused test that locks the supported voice ids and default voice availability.

**Verification**
- `vitest run src/lib/comic/video/voices.test.ts` passed: 1 file, 2 tests.
- `tsc -b` passed.

## 2026-06-21 - Documentation refresh for comic video library

- Updated README, multimedia module docs, roadmap, and tech-stack notes against the current ComicModal TTS / MP4 / video-library implementation.
- Documented `tts_audio` / `video` media assets, `ComicPanel.segmentAssetId`, `ChapterComic.videoAssetId`, chapter-scoped video library actions, and full-chapter MP4 validation feedback.
- Added the full-book media library as a TODO for cross-chapter browsing, filtering, open/reveal, delete, orphan cleanup, and batch export.

**Verification**
- Documentation-only change; skipped `tsc -b` per AGENTS.md.
- Cross-checked against `package.json`, `src/types/index.ts`, `src/lib/storage/types.ts`, `src/components/comic/ComicModal.tsx`, `src/lib/comic/video/*`, and `src-tauri/src/lib.rs`.

## 2026-06-21 - Comic chapter video validation

- Fixed full-chapter MP4 export feedback so missing panel images or narration show a visible message next to the export action.
- Added full-chapter video input validation that lists every missing panel image, instead of stopping silently or reporting only the first missing panel.
- Moved the full-chapter MP4 feedback out of the footer button row into a dismissible top notice layer.

**Verification**
- `vitest run src/lib/comic/video/video-validation.test.ts` passed: 1 file, 2 tests.
- `tsc -b` passed.

## 2026-06-21 - Comic video library

- Added a ComicModal video library popup for browsing generated chapter MP4 files and per-panel MP4 segments.
- Added open, reveal in folder, delete, and rerender actions for video library items.
- Added safe Tauri media commands for opening and revealing files under the app media root.
- Added a focused video-library view-model helper and tests for ready and missing video assets.

**Verification**
- `vitest run src/lib/comic/video/video-library.test.ts` passed: 1 file, 2 tests.
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.

## 2026-06-21 - Comic workspace resume

- Added per-book ComicModal workspace resume state so `轉漫畫` reopens the last edited chapter and panel.
- Persisted the active comic chapter/panel through panel selection, chapter switching, and panel edits using the existing `StorageAdapter.appMeta` store.
- Auto-scroll the ComicModal reference-image picker to the current chapter group when editing a panel, reducing manual scrolling in large reference libraries.

**Verification**
- `vitest run src/lib/comic/comic-workspace-state.test.ts` passed: 1 file, 3 tests.
- `tsc -b` passed.

## 2026-06-21 - Comic single-panel video export

- Fixed scene visual deletion so project-wide panel references are detected, users get a warning before deleting referenced scenes, and ComicModal scene lists refresh after deletion.
- Fixed the ComicModal reference-image section so chapter group labels and thumbnail alt text use 1-based chapter numbering.
- Fixed the ComicModal chapter selector display so chapter numbering starts at 1 instead of showing the internal 0-based order.
- Reordered the ComicModal right sidebar so `場景` sits next to `場景視覺設定`, with `參考圖` above them.
- Fixed storyboard normalization so generated panels always start with `durationSec: 0`; manual seconds now remain user-entered only.
- Added a panel-scoped `單格輸出 MP4` flow that validates only the selected comic panel and writes reusable TTS/segment metadata.
- Moved full-chapter video controls into a footer-level `整章影片設定` popup plus `整章輸出 MP4` action.
- Updated chapter video rendering to reuse matching panel segments instead of regenerating every TTS/audio segment on each full export.
- Added responsive popup/footer styling so global video settings do not crowd the selected-panel editor.

**Verification**
- `vitest run src/lib/scene-visuals.test.ts` passed: 1 file, 5 tests.
- `vitest run src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts` passed: 2 files, 20 tests.
- `vitest run src/lib/comic/video/video-renderer.test.ts` passed: 1 file, 3 tests.
- `tsc -b` passed.

## 2026-06-16 - Comic TTS video MVP

- Added panel-level TTS metadata, chapter video status metadata, and timing helpers where `durationSec: 0` uses measured TTS duration and manual estimates never truncate audio.
- Updated comic storyboard generation so `panels[].narration` is a chapter-complete spoken script distributed across ordered panels.
- Added Edge-TTS/ffprobe/ffmpeg Tauri command wrappers, concat-list generation, per-panel segment rendering orchestration, app-data media root resolution, and concat mp4 export.
- Added data URL image materialization before ffmpeg segment rendering, and constrained desktop file write/delete/render paths to the Tauri app-data media root.
- Added cleanup for panel-owned TTS and segment files when a panel is deleted, on rerender, and when regenerating a storyboard; existing chapter video metadata is reset when panels are replaced.
- Added ComicModal controls for narration editing, manual duration fallback, voice/padding/bin settings, and MP4 export.

**Verification**
- `vitest run src/lib/comic/video/timing.test.ts src/lib/comic/video/concat-list.test.ts src/lib/comic/video/panel-cleanup.test.ts src/lib/comic/video/video-renderer.test.ts src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts src/lib/comic/storage-types.test.ts src/lib/tauri-migrations.test.ts` passed: 8 files, 30 tests.
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- Browser visual QA opened ComicModal at `http://127.0.0.1:5173/`; empty/modal state remained usable, but selected-panel video controls could not be visually exercised because the local browser profile had no existing comic panels and no API key to generate a storyboard.

## 2026-06-16 - Comic TTS video implementation plan

- Added the implementation plan for the comic TTS video MVP: `docs/superpowers/plans/2026-06-16-comic-tts-video.md`.
- Planned the work across timing/types, storyboard narration updates, storage migration, Tauri Edge-TTS/ffmpeg commands, video rendering helpers, panel media cleanup, ComicModal UI, frontend visual QA, and final verification.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- Ran plan placeholder/self-review scan and `git diff --check`.

## 2026-06-14 - Comic TTS video MVP design

- Added the design spec for the Phase 6 comic narration video MVP: `docs/superpowers/specs/2026-06-14-comic-tts-video-design.md`.
- Scoped the first implementation to one chapter, pure narration, one Edge-TTS voice, per-panel TTS audio, ffmpeg panel segments, and concat-list mp4 export.
- Defined timing rules: `durationSec` can extend a panel but never truncates TTS; each panel duration is `max(audioDurationMs, durationSec * 1000) + panelPauseMs`.
- Updated the design after review: removed the single-filter-graph option, moved browser ffmpeg.wasm to future consideration, required panel deletion cleanup for related media files, and required `frontend-visual-qa` for future ComicModal UI work.
- Updated `skills/novel-to-storyboard` so generated narration is chapter-complete across ordered panels, with sentence density based on panel count instead of a fixed 1-3 sentence rule.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- Cross-checked against `package.json`, `src/types/index.ts`, `src/lib/storage/types.ts`, `src/lib/comic/storyboard*.ts`, `skills/novel-to-storyboard`, and current Tauri config.

## 2026-06-14 - Documentation refresh against code

- Updated README, module docs, specs, AI loading guides, and storyboard skill schema against current `package.json`, `src/types`, storage adapters, and Phase 6 comic implementation.
- Clarified that pure Markdown-only changes do not require `tsc -b`; code changes still use the existing focused TypeScript verification rule.
- Marked historical superpowers specs/plans as records rather than current-state docs, and corrected stale storage, backup, deployment, LLM provider, Graph, and comic image provider descriptions.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- Ran Markdown/code consistency spot checks with `rg`.
- `git diff --check` passed with only existing line-ending normalization warnings.

## 2026-06-13 - Wiki toolbar fit fix

- Changed the Wiki toolbar from right-aligned flex buttons to a fixed six-column grid so every action remains visible on one row.
- Removed per-button minimum widths that caused the leftmost toolbar actions to be clipped in narrower panes.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Wiki operation log popup

- Removed the redundant Wiki label from the Wiki panel toolbar so actions fit on one row.
- Added a `📜 紀錄` toolbar button that opens operation history in a popup.
- Removed the always-visible operation history footer from the Wiki panel.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Wiki toolbar and editor layout polish

- Updated Wiki navigation/actions to use fixed-size icon-plus-text buttons with tooltip labels.
- Moved `改 slug` into the Wiki editor action bar and aligned it with `刪除` and `儲存`.
- Split the Wiki list/editor columns to 50/50 and added full-name tooltips for truncated list entries.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic upload and CJK search fixes

- Prevented manually uploaded comic panel images from appearing twice in the panel history.
- New comic panels now start with an empty negative prompt instead of inheriting the selected panel's text.
- Added a CJK `LIKE` fallback for desktop full-text search when FTS returns no results.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic image download feedback

- Added visible feedback when downloading comic panel images from the panel editor or preview modal.
- Download links now switch to a started state and the comic modal message explains that the browser download has begun.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic panel image upload

- Added an `上傳圖片` action next to `重生此格` in the comic panel editor.
- Uploaded panel images are saved as comic panel media assets, selected as the current panel image, and added to the panel history variants.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic panel title and drag affordance

- Moved the selected comic panel title editor into the panel header so inserted panels such as `#9 新增分鏡` can be renamed directly.
- Added a visible drag handle, dragging state, and insertion line feedback to the comic panel rail.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic panel drag and title editing

- Replaced native drag/drop in the comic panel rail with pointer-based reordering so dragging works inside the full-screen comic modal.
- Added a selected-panel title field so newly inserted panels such as `#9 新增分鏡` can be renamed.

**Verification**
- `tsc -b` passed.

## 2026-06-12 - Comic panel editing follow-up

- Restored the comic prompt expansion backdrop to the previous translucent overlay while keeping the editor surface opaque.
- Added an icon-only close button to the top-right of the full-screen comic modal.
- Fixed storyboard drag-and-drop reordering by moving drag handlers off the interactive button and onto a dedicated draggable panel row.

**Verification**
- `tsc -b` passed.

## 2026-06-12 - Comic panel editing controls

- Made the comic prompt expansion dialog fully opaque and added an icon-only close button in the upper-right corner while keeping the existing close action.
- Added dynamic storyboard panel insertion, per-panel deletion, and drag-and-drop reordering in the comic modal panel rail.
- Added storage support for deleting a single comic panel and kept remaining panel order synchronized after insert/delete/reorder.
- Added focused panel order helper coverage for reindex, move, and remove behavior.

**Verification**
- `tsc -b` passed.

## 2026-06-12 - Google Gemini image provider

- Added a dedicated Google Gemini Image provider for comic image generation using the Gemini `generateContent` image API.
- Added independent Google image provider settings in preferences, with default model `gemini-3.1-flash-image` and a button to copy the API key from the active Google LLM settings.
- Enabled Google Gemini Image reference image support with `maxReferenceImages` set to 14.
- Added focused provider tests for Gemini response normalization, request payload shape, and provider registry exposure.
- Removed unsupported REST `generationConfig` image fields from the Google Gemini image request payload.

## 2026-06-10 - Comic sidebar interaction fixes

- Applied the shared sidebar search to scene visual settings as well as characters, panel references, and scene pickers.
- Added image preview behavior for history, character, reference, and scene thumbnails.
- Made scene visual names editable while keeping stable slugs, and updated scene fields optimistically to avoid input cursor jumps.
- Added inline history feedback when trying to delete the current selected panel image variant.
- Added a multi-image scene reference grid with preview and per-image removal.
- Persist generated images from remote provider URLs as data URLs so expiring signed URLs do not break history thumbnails.

## 2026-06-10 - Comic modal mockup alignment

- Reworked the comic modal into a three-column workspace closer to `docs/comic-ui-static-mockup.html`: chapter/panel rail, selected panel editor, and shared selectors/sidebar.
- Replaced remaining visible `??` comic modal labels with Chinese titles and moved scene/character/reference controls into the sidebar.
- Backfilled current panel images into history variants when existing panels predate `ComicPanelImageVariant`, so the history grid is visible for previously generated panels.

## 2026-06-07 - Comic image history and full-screen workflow

- Added `ComicPanelImageVariant` storage so every generated panel image is kept as a selectable history variant while `ComicPanel.assetId` remains the current adopted image.
- Added Dexie / SQLite adapter support, Tauri migration `006_comic_panel_image_variants.sql`, backup import/export support, and focused tests for variant row conversion and migration registration.
- Updated the comic modal to full-screen mode with per-panel history thumbnails, set-current and delete-old-image controls, prompt expansion, shared selector search, and scene visual deletion.
- Regenerating storyboard now removes old panel variants and generated comic image assets; regenerating a panel keeps history and creates a new variant.
- Added the design spec `docs/superpowers/specs/2026-06-06-comic-image-history-design.md`.

## 2026-06-04 - Explicit comic panel reference picker

- Replaced the continuity-only interaction with a broader per-panel reference workflow while retaining the automatic previous-panel option.
- Added a reference image picker grouped by chapter and panel order. Explicit selections persist on each target panel and are sent as real provider image inputs.
- Reference bindings now merge character, scene, selected panel, and automatic previous-panel images in deterministic order with duplicate assets removed.

## 2026-06-03 - Phase 6 reference images, scene visuals, and continuity references

**Changed**
- Added project-level scene visual settings for comic generation. Panels can select a reusable scene, and scene prompt / negative prompt / reference images are composed into final image generation.
- Added provider reference-image plumbing. Character, scene, and continuity reference assets are resolved before image generation and skipped with warnings when the selected provider does not support image references.
- Added DeepInfra FLUX-2-pro image provider support with `input_image`, `input_image_2`, ... request fields.
- Added panel-level `useContinuityReference` so a panel can use the previous generated panel image; chapter first panels can fall back to the previous chapter's latest final comic panel.
- Added ComfyUI reference image node mapping.
- Added per-panel character multi-select dropdown in the comic UI so selected characters automatically contribute their visual prompts and uploaded reference images.

- Fixed generated panel prompt snapshots / warnings being overwritten after successful batch generation.
- Aligned Dexie and SQLite uniqueness for scene slugs.

**Verification**
- `tsc -b` passed.
- Focused Vitest coverage passed for providers, prompt composer, scene visuals, storage rows, and Tauri migration registration.

## 2026-05-29 — LLM Provider 設定切換 Hotfix

**修正**
- 修正「偏好設定 → LLM API」切換提供商時，Base URL / 模型名稱仍沿用最後一次儲存值的問題。
- 將 LLM provider 預設值集中到 `src/lib/llm-provider-defaults.ts`，切換 provider 時會套用該 provider 的預設顯示名稱、Base URL 與模型。
- API Key 目前仍維持單一 active LLM 設定共用；若未來要每個 provider 各自保存 key，需再升級為 provider profile 架構。

**驗證**
- `vitest run`：113 tests passed
- `tsc -b`：passed
- `eslint`：passed
- `vite build`：passed（保留既有 chunk size warning）

## 2026-05-29 — Phase 6.1 Visual Bible / Extras 規劃與 MVP 切片

> Phase 6.1 Visual Bible 設計已新增：`docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`。核心決策是角色與場景提示詞作為 Project 層級資產、跨章節引用，漫畫生成時保存 snapshot。

**新增 / 更新**
- 新增 Prompt Composer MVP：生圖前集中組合 final image prompt，並保存 `finalPromptSnapshot` / `finalNegativePromptSnapshot`。
- 新增龍套/群眾混合策略：Named characters 進 Visual Bible；跨多格 recurring groups 進 `extraGroupsJson`；一次性背景龍套留在 panel `visualPrompt`。
- Storyboard prompt schema 增加 `extraGroups`，避免把 100 個龍套塞進 active characters。
- ComicModal 每格可編輯 extras JSON，Final prompt 可展開檢查。

**驗證**
- `vitest run`：108 tests passed
- `tsc -b`：passed
- `vite build`：passed（保留既有 chunk size warning）

## 2026-05-28 — Phase 2: SQLite FTS5 全文檢索

> Phase 2.5 已標記為 **MVP Complete / Advanced polish remaining**。主幹可用，剩餘 LLM pick-pages、批次摘要重建排程、摘要品質趨勢報表、Graph 進階事件抽取與 Lint 整批 undo UI 作為後續 polish。
> Phase 6 漫畫圖片 MVP 設計已完成：`docs/superpowers/specs/2026-05-28-phase-6-comic-images-design.md`。範圍鎖定「選擇章節 → 可編輯分鏡 → 批次生成連續漫畫圖片」，本地優先 ComfyUI HTTP API，線上支援 OpenAI-compatible image provider。

**新增功能**
- Tauri SQLite adapter 掛上 optional `storage.search`，桌面版啟用 FTS5；Dexie/Web 版維持 undefined 並自動隱藏 UI
- 工具列新增「🔎 全文搜尋」modal，可搜尋章節與 Wiki，結果支援 snippet 高亮並可跳到章節或 Wiki 頁
- Wiki ingest create 會用 FTS5 從全書章節抓取最多 3 段相關片段，注入 `{{ftsExcerptsSection}}`，提升新 Wiki 頁跨章節脈絡
- Wiki 列表 summary 頁改依 `ch-N` 數字排序；超過 50 章自動分段，並提供「跳到章節」輸入
- 角色分頁新增「列表 / 關係圖」切換；關係圖從 `Character.relations` 推導角色連線，點節點可開啟角色編輯
- Wiki 分頁新增 `◎ Graph` 查詢 modal，可用角色/Wiki 名稱查 2-hop 關聯節點與路徑
- Wiki ingest 新增「必建角色 entity」三層防線：prompt 明示、程式預檢角色庫中本章出現但 Wiki 缺頁的角色、LLM plan 漏掉時自動補 create op，避免主角未進 Wiki 卻只建立路人 entity

**底層**
- 沿用 `003_fts.sql`：`chapters_fts` / `wiki_pages_fts` virtual table、trigram tokenizer、trigger 同步與 backfill
- 新增 `wiki-ingest-fts` helper 與單元測試
- 新增 `character-graph` helper 與單元測試；先用 SVG circular layout，完整 Graph JSON 留 Phase 2.5
- 新增 `knowledge-graph` helper 與單元測試：characters + wiki pages → serializable JSON graph，支援 label lookup 與 multi-hop neighborhood
- 新增 `wiki-character-entities` helper 與單元測試，將角色庫與 Wiki entity 存在性檢查從 LLM prompt 中抽成 deterministic guard

**驗證**
- `vitest run`：88 tests passed
- `tsc -b`：passed
- `vite build`：passed（仍有既有 chunk size warning）
- 針對新增 FTS 檔案執行 ESLint：passed；全專案 ESLint 仍受既有檔案與 `src-tauri/target` 產物影響

---

## 2026-05-19 — Phase 2.5 Part 1: 一致性 Lint

完整實作 Phase 2.5 #3（spec：`docs/superpowers/specs/2026-05-19-consistency-lint-design.md`，經 codex review 後修訂；plan：`docs/superpowers/plans/2026-05-19-consistency-lint.md`，16 個 task）。

**新增功能**
- Wiki 分頁加「🔍 執行 Lint」按鈕；專用 LintReportModal 進度列 + 報告版合一
- 6 個 check（可逐一在偏好設定勾選）：
  - ① Broken link — structural，AutoFix 一鍵移除 broken ref
  - ② 孤頁 — structural，info-only（codex review 採納：不提供刪除）
  - ③ 別名重複 — structural error，純報告
  - ④ 未登錄角色 — **hybrid**（structural pre-filter 對話/稱呼語境 + 1 LLM call verify）
  - ⑤ Wiki 內部矛盾 — LLM batch per page type，輸入 `WikiLintDigest`（rule-based markdown parser）
  - ⑥ Wiki vs 章節 — LLM batch per character，aliases 集合搜尋章節
- LLM 修改建議：✏️ 修改 inline 展開「修改方向」textarea → ✨ 生成建議 → 兩欄純文字 diff preview → 套用
- 所有 fix（broken-link auto + LLM）都寫 `wiki_log`（`source='lint:<checkId>'`），與 wiki-ingest 補償模式一致；共用 `lintBatchId` 保留未來整批 undo 能力
- 取消功能：AbortSignal 一路傳到 fetch；中途取消後已完成 check 結果仍展示

**設定擴充**
- 偏好設定 → 📚 Wiki 設定 底部加 Lint 區段：6 checkbox + 4 LLM 上限數字輸入
- 偏好設定 → 📜 AI 提示詞 加 4 個 sub-tab（#9 Unrecorded / #10 矛盾 / #11 vs 章節 / #12 修改建議）
- `setLintPrefs` 用 deep merge 避免 nested `checks` 物件被覆蓋
- `persist.merge` 補齊舊使用者預設值

**Schema 變動**
- 零 SQLite / Dexie schema 變動（lint 結果不持久化、prefs 走 localStorage）
- `wiki_log` 沿用既有 schema，僅 `source` 欄位加 `lint:*` 前綴

**測試**
- 加 vitest + jsdom（前所未有的單元測試 infra）
- 21 個 unit test 全綠：digest.ts (8) + unrecorded pre-filter (7) + wiki-contradict JSON parser & batch (6)

**已知限制**
- 「維持現狀」session-only，重 lint 會再出現
- 孤頁不提供刪除（需從 wiki 編輯器手動刪）
- Lint 整批 undo 未實作（保留 wiki_log batch_id 共用設計，後續可補）
- `complete()` 加 AbortSignal 支援，但既有 wiki-ingest / chapter generation 未串接 cancel UI（僅 lint 用到）

---

## 2026-05-19 — LLM Wiki hotfix + 路線調整

**修補**
- `postToLLMWithRetry`：對 408/425/429/5xx 與 fetch 例外做 3 次指數退避（800/2400/6000ms），緩解 NVIDIA / xAI gateway 偶發 502/ECONNRESET 中斷 ingest 串行呼叫
- WikiPageEditor 重寫成絕對定位 flex 佈局，修「雙層 scrollbar」+ 加 ⛶ 全屏按鈕（同 OutlinePanel 款；ESC 收起）
- ChapterEditor 章節「📚 存入 Wiki」按鈕狀態調整：
  - 空白章節 disabled（tooltip 提示）
  - `synced` 後改顯示「🔄 重新存入 Wiki」並保留 enabled（重新合併變更）
  - `partial` 顯示「⚠️ (N)」，N 為當前 batch 失敗 op 數
- Plan prompt 注入 `chapterOrdinal` / `chapterSummarySlug`，修第 N 章摘要 slug 永遠生成 `ch-1` 的衝突；既有 ch-1 受影響使用者請重新點「🔄 重新存入 Wiki」

**路線調整**
- 正式放棄 Vector RAG（Ollama embedding + LanceDB）。理由：LLM Wiki 已覆蓋「概念導向檢索」主訴求；剩餘「找特定對話／伏筆／物品出處」用 SQLite FTS5 + 中文 bigram tokenizer 解掉 80%，零依賴、毫秒級、就在現有 .db。若未來真需要 vector 改用 sqlite-vec，不引入 Ollama / LanceDB。`roadmap.md` / `modules/04-knowledge.md` / `modules/07-context-budget.md` / `specs/tech-stack.md` / `README.md` / `docs/plan.md` 已同步更新

## 2026-05-18 — Phase 2 Part 1: LLM Wiki

完整實作 LLM 自管知識層（spec：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md`，經 4 輪 codex review；plan：`docs/superpowers/plans/2026-05-17-llm-wiki-phase-2.md`）。

**新增功能**
- 左側 📚 Wiki 分頁：5 種 page type（concept/entity/summary/compare/synthesis）、index、編輯、操作記錄
- 章節「📚 存入 Wiki」按鈕 + 5 種狀態徽章（unsynced/synced/stale/partial/partial_stale）
- Ingest pipeline：Plan + 校驗 + Apply + 補償寫入（無 transaction） + 一鍵還原
- Context Budget 整合：cheap relevance filter（2-4 字滑動窗 + 字頻 top 50）+ 預算截斷預警
- 偏好設定「📚 Wiki 設定」 + 4 個 wiki prompt templates 可編輯
- 跨平台 round-trip：backup schema v2（向後相容 v1）

**Schema 變更**
- SQLite: `002_wiki_tables.sql`（wiki_pages + wiki_log，含 batch_id、op_status、page_snapshot JSON）
- Dexie: v5（wikiPages / wikiLog object stores、chapters 多 `wikiSyncedHash` / `wikiSyncStatus`）

**已知限制 / 範圍**
- Pick-pages 兩段式查詢留 Phase 2.5（已有警告機制）
- Lint（矛盾 / 孤頁 / broken link）留 Phase 2.5
- Wiki 不自動寫入 characters 表，僅在 `unrecorded_characters` 提示
- Wiki 頁手動刪除不進 log（只有 ingest pipeline 的 delete op 才寫 log）

## 2026-05-17 Phase 5b — Tauri Windows 桌面版 + SQLite

把 React app 包成 Tauri 桌面殼，桌面版的儲存層改走原生 SQLite
（`tauri-plugin-sql` + `TauriSqliteAdapter`），徹底解決「無痕視窗 / 瀏覽器配額導致書本消失」的問題。
瀏覽器版同一份 codebase 不受影響（仍走 DexieAdapter）。

**新增：**
- `src-tauri/` Rust 殼（透過 `tauri init`）：tauri 2.x + tauri-plugin-sql + tauri-plugin-log
- `src-tauri/migrations/001_initial.sql`：6 個表（projects/chapters/versions/characters/
  app_meta + Phase 6 用的 media_assets 佔位），與 Dexie v4 schema 1:1 對齊
- `src/lib/platform.ts`：`isTauri()` 偵測（`window.__TAURI_INTERNALS__`）
- `src/lib/storage/sqlite-helpers.ts`：row↔entity 轉換 + JSON 序列化
- `src/lib/storage/tauri-sqlite-adapter.ts`：完整 `StorageAdapter` 實作

**串接：**
- `src/lib/storage/index.ts`：`pickAdapter()` → 桌面回 `tauriSqliteAdapter`、瀏覽器回 `dexieAdapter`
- `src/lib/fs-sync.ts`：`isFsAccessSupported()` 在 Tauri 環境一律回 false
  （桌面版資料即本機檔案，不需 File System Access 自動同步；改走手動 export/import）

**效能修正（途中踩雷）：**
- tauri-plugin-sql v2.x **沒有 transaction API**，每次 `execute()` 取獨立連線；
  搭配 SQLite 預設 `synchronous=FULL` + Windows Defender 掃描 `%AppData%` → 每個 op ~5s、
  replaceAll 卡 60s+ 報「undefined」。
- 修法：`getDb()` 啟動時設 `PRAGMA journal_mode=WAL` + `synchronous=NORMAL`，per-op 降到 <50ms；
  拿掉 replaceAll 內無作用的 BEGIN/COMMIT（接受非 atomic，使用者按下「清空覆蓋」即已確認）。

**跨平台搬遷：** 沿用 5a 的 `backup.ts`：使用者手動 export JSON → 另一平台 import。
驗證：瀏覽器→桌面→桌面 export → JSON bit-perfect 與原始相同（所有 id/內容/順序逐欄一致）。

**指令：**
- `npm run tauri dev` — 桌面開發
- `npm run tauri build` — 產出 Windows MSI 安裝包（`src-tauri/target/release/bundle/msi/`）

**未含：**
- macOS / Linux 打包（YAGNI，之後再加）
- Code signing（首次安裝會跳「Windows 已保護您的電腦」，按「其他資訊→仍要執行」即可）
- 自動 IndexedDB→SQLite 遷移（走手動 export/import）
- 桌面版自動排程 snapshot

---

## 2026-05-15 Phase 5a — StorageAdapter 抽象層

把 Dexie 包進 `StorageAdapter` interface，UI / stores / lib 都改走 `src/lib/storage`
singleton，不再直接 import `db`。功能完全不變，但為 Phase 5b（Tauri + SQLite）
鋪好換實作的路；同時保留未來 Web 回部署（Phase 7，wa-sqlite + OPFS）的彈性。

**新增：**
- `src/lib/storage/types.ts`：`StorageAdapter` interface 與子 store 介面
- `src/lib/storage/dexie-adapter.ts`：Dexie 實作（唯一 import `./db` 的業務檔）
- `src/lib/storage/index.ts`：平台偵測（Phase 5b 接 `window.__TAURI__`）+ `storage` singleton

**遷移：**
- `src/stores/projectStore.ts`、`src/lib/backup.ts`、`src/lib/fs-sync.ts`、
  `src/components/home/HomePage.tsx`：全部改走 `storage.*`
- `src/lib/db-maintenance.ts`：業務邏輯改走 adapter；仍保留 `import db` 以將 Dexie 實例
  掛到 `window.dbDebug.db` 供 dev console 直接戳

**規劃文件：**
- `docs/superpowers/specs/2026-05-15-tauri-sqlite-migration-design.md`：Phase 5 完整設計
- `docs/superpowers/plans/2026-05-15-phase-5a-storage-adapter.md`：本次 implementation plan
- `specs/roadmap.md`：新增 Phase 5/6/7 規劃

---

## 2026-05-12 Bug 修正 + 備份/同步

### Bug 修正

| 問題 | 原因 | 修正 |
|------|------|------|
| 關閉瀏覽器再開，剛建的書不見了 | Vite dev server 未固定 port，5173 被占用時會自動跳 5174/5175…；IndexedDB 綁定 origin（host:port），port 一變舊 DB 就「看似消失」（實際還在另一個 origin） | `vite.config.ts` 加 `server.port: 5173` + `strictPort: true`，被占用直接報錯不悄悄換 port |

### 新功能：備份與同步（💾 備份）

Toolbar 新增「💾 備份」按鈕，開啟備份/同步 Modal，提供兩種方案：

| 方案 | 操作 | 適用情境 |
|------|------|---------|
| **A. 手動匯出/匯入 JSON** | 📤 匯出全部 → 下載單一 JSON；📥 匯入 JSON → 取代本機資料 | 所有瀏覽器、無痕模式、換機備援 |
| **E. 連結同步資料夾**（File System Access API） | 一次性選資料夾，之後每次資料變動 2s 後自動寫入 `novel-generator-backup.json`；App 啟動且本機 DB 為空時自動還原 | Chrome/Edge；資料夾選在 OneDrive / Google Drive / iCloud 同步資料夾即可跨機 |

**架構：**

```
src/
├── lib/
│   ├── backup.ts        # exportSnapshot / importSnapshot / downloadSnapshotAsJson
│   ├── fs-sync.ts       # File System Access：pickAndLinkFolder / push / pull / 持久化 handle
│   └── auto-sync.ts     # 啟動掛載：訂閱 projectStore → debounced push（2s）；DB 空時自動 pull
└── components/
    └── BackupModal.tsx  # 整合 UI（手動 + 同步資料夾）
```

**DB 變更：**
- `db.ts` v4：新增 `appMeta` table（key-value），用來持久化 `FileSystemDirectoryHandle`（structured-cloneable）

**備份內容範圍：**
- ✅ projects / chapters / versions / characters
- ❌ settings（LLM API key，避免明文洩漏）
- ❌ Zustand persist（偏好設定、prompts），各自走 localStorage

**無痕模式說明：**
- IndexedDB 在無痕模式關閉時會被清除，連同已連結的資料夾 handle 一起消失，這是瀏覽器規範
- Modal 內已加提醒，建議無痕模式關閉前先「📤 匯出全部」

## 2026-05-11 Phase 2.x — AI 提示詞系統重構

承續同日 Phase 2 功能強化，下午針對 AI 生成品質與可定制性做了一輪深度重構。

### 完成功能

| 功能 | 說明 |
|------|------|
| AI 接續生成品質強化 | 章節骨架生成傳入角色清單避免 AI 自編人名；接續模式排除「引入」節拍；新增四條硬性規則阻止 AI 重啟故事 |
| 章節要點重新生成 | 章節要點 Modal 加「✨ 重新生成」按鈕；依本章節拍 + 參考章節（取尾段 1500 字）+ 角色清單，由 AI 寫出 2-4 句要點 |
| 進入書本自動定位 | 開書時若已有章節，直接切到「章節」分頁並選中第一章；空書則停在「大綱」 |
| Grok (xAI) Provider | 新增 `LLMProvider = 'grok'`；走 OpenAI-compatible，預設 baseUrl `https://api.x.ai/v1`、model `grok-2-latest` |
| 偏好設定分頁化 | Modal 內改為三主分頁：🔑 LLM API / ✨ 選取調整 / 📜 AI 提示詞 |
| 主編輯區 Markdown | 章節正文編輯器新增「✏️ 編輯 / 👁 預覽」切換；預覽模式以 react-markdown 渲染；雙擊回到編輯 |
| 4+1 Prompts 可編輯（方向 A） | 把全部 4 個 prompt 模板 + 接續規則搬到偏好設定；自訂 `{{var}}` template engine；UI sub-tabs 切換 5 個 prompts |
| 預覽變數代入 | 切到「預覽」會用範例資料或當前專案真實值代入 `{{var}}`，並以 Markdown 渲染 |
| 預覽資料來源切換 | 預設「當前專案」（從 useProjectStore 抓真實值），沒專案時自動 fallback 到範例；可切換到「範例資料」 |
| DB 維護工具（dev） | `src/lib/db-maintenance.ts` 掛到 `window.dbDebug`：`inspect()` / `cleanupOrphans()` / `wipeAllExceptBook()` 清舊版孤兒資料 |

### 新增檔案

```
src/
├── lib/
│   ├── prompt-template.ts      # renderTemplate({{var}}) + listTemplateVars
│   ├── prompt-defaults.ts      # 5 條預設 templates + SAMPLES + VARS 說明
│   ├── prompt-preview.ts       # buildLivePromptVars：從專案抓真實預覽變數
│   └── db-maintenance.ts       # window.dbDebug — inspect/cleanupOrphans/wipeAllExceptBook
└── components/common/
    ├── MarkdownView.tsx        # react-markdown 包裝 + .markdown-body 樣式
    └── EditPreviewTabs.tsx     # ✏️ 編輯 / 👁 預覽 共用切換 tabs
```

### Prompt 模板系統

四個 AI 任務全部走 template engine（可在偏好設定編輯）：

| # | 模板 key | 觸發 | 主要變數 |
|---|---------|------|---------|
| 1 | `chapterDraftsTemplate` | ✨ AI 生成章節 | `taskIntro`/`worldSetting`/`mainPlot`/`charactersSection`/`existingChaptersSection`/`continuationRulesSection`/`count`/`beatList` |
| 1.5 | `chapterContinuationRules` | 嵌入 #1 的接續規則段 | （純文字，被 #1 引用） |
| 2 | `chapterContentTemplate` | ✨ 生成本章 / ↩️ 重新生成 | `worldSetting`/`mainPlotSection`/`charactersSection`/`chapterTitle`/`beat`/`points`/`targetWords`/`referenceSection`/`adjustInstructionSection` |
| 3 | `chapterPointsTemplate` | 章節要點 → ✨ 重新生成 | `worldSetting`/`mainPlot`/`charactersSection`/`chapterTitle`/`beat`/`referenceSection`/`currentPointsSection` |
| 4 | `inlineAdjustTemplate` | 右鍵 ✨ 調整內容 | `chapterTitle`/`beat`/`points`/`beforeContext`/`selectedText`/`afterContext`/`adjustInstruction` |

設計約定：
- 模板僅做 `{{var}}` 字串替換，**不支援 if/loop**
- conditional 區段由 caller 預組成完整字串（如 `existingChaptersSection` = `""` 或完整 `## 現有章節\n...` 區塊）再注入
- `useSettingsStore.persist.merge()` 補齊舊使用者缺漏的 prompt 欄位，向後相容

### 偏好設定 → AI 提示詞 UI

```
[🔑 LLM API] [✨ 選取調整] [📜 AI 提示詞]
                              └─ [#1 章節骨架] [#1.5 接續規則] [#2 章節正文] [#3 章節要點] [#4 局部改寫]
                                              ▶ 可用變數（N）
                                              [✏️ 編輯] [👁 預覽]          [↺ 還原預設]
                                              變數來源：[當前專案 | 範例資料]
                                              ┌──────────────────────────────────────┐
                                              │ ... template / 渲染後的 markdown ...  │
                                              └──────────────────────────────────────┘
```

### 套件異動

- `+ react-markdown ^10.1.0` — Markdown 渲染

---

## 2026-05-11 Phase 2 功能強化

### 完成功能

| 功能 | 說明 |
|------|------|
| 書本管理首頁 | 首頁書本 Grid、BookCard（字數/更新時間）、NewBookModal、重命名/刪除、AppView 路由切換 |
| 多 LLM Provider | 新增 Google Gemini 支援；`isLLMReady()` 依 provider 判斷；Vite proxy 條件轉發 Authorization header |
| 角色成長弧線 | Character 新增 `arc` 欄位；AI 生成角色規則：主線提到的名字必生成、主角弧線對應主線劇情 |
| 章節編號徽章 | 章節列表項目左側顯示 `01`/`02` 數字徽章，依 array index 自動計算 |
| 章節拖曳排序 | HTML5 原生 DnD；上/下半部插入位置判斷（before/after）；`reorderChapters()` 批次更新 DB |
| 多選刪除章節 | Checkbox 多選、全選（含 indeterminate）、bulk-actions 動作列、批次刪除 |
| 參考章節持久化 | `referenceChapterId` 補入 Chapter type / DB 預設 / useEffect 載入 / handleSave / onChange 即時存 |
| AI 章節接續生成 | `ExistingChapterSummary`（index/title/beat/points）；接續模式傳最後 8 章給 AI；prompt 明確說明從第 N+1 章接續 |
| Prompt 除錯日誌 | `promptLogPlugin`（vite）+ `logPromptToTemp()` helper；每次「生成本章」自動寫 `temp/chapter-gen-TIMESTAMP.txt` |

### 架構更新

```
src/
├── lib/
│   ├── llm.ts            # 新增 Google Gemini branch、isLLMReady()
│   ├── ai-tasks.ts       # ExistingChapterSummary、接續生成 prompt、角色弧線規則
│   └── prompt-log.ts     # ★ 新增：logPromptToTemp() — 寫 prompt 到 temp/
├── stores/
│   └── uiStore.ts        # AppView = 'home' | 'editor'
└── components/
    └── home/             # ★ 新增資料夾：HomePage、BookCard、NewBookModal
vite.config.ts            # promptLogPlugin（POST /log-prompt → temp/）
```

### Bug 修正

| 問題 | 原因 | 修正 |
|------|------|------|
| 建立按鈕無反應 | `disabled={!title.trim()}` 且缺少 catch | 改為 always enabled + inline validation |
| KeyPath updatedAt not indexed | `loadAllBooks` 用 `orderBy('updatedAt')` 但 DB schema 未索引 | Dexie v3 migration 補 `updatedAt` 索引 |
| Google 401 ACCESS_TOKEN_TYPE_UNSUPPORTED | proxy 總是轉發 `Authorization: Bearer <key>` | Google branch 不送 Authorization；proxy 僅在非空時轉發 |
| 參考章節未儲存 | `referenceChapterId` 只是 local state | 加入 Chapter type / DB / useEffect / handleSave / onChange 即時存 |

---

## 2026-05-10 Phase 1 完成

### 完成狀態

✅ **Phase 1 已完成** — 能跑的最小版本，可以完整生成一本小說

### 實作模組

| 模組 | 狀態 | 說明 |
|------|------|------|
| 00-book | ✅ | Toolbar 新建專案 + App.tsx auto-load 最近專案 |
| 01-outline | ✅ | 題材/風格 → AI 生成世界觀/主線劇情/章節大綱 |
| 02-characters | ✅ | 角色 CRUD、Modal 編輯器 |
| 03-chapters | ✅ | 章節生成、故事節拍、章節要點、調整方向 |
| 05-versions | ✅ | 3 版本保留、釘選、預覽、切換 |
| 07-context-budget | ✅ | 固定比例 token 分配 + 摘要截斷 |
| 08-llm-adapter | ✅ | OpenAI-compatible custom API |
| UI 殼層 | ✅ | 雙欄佈局、可拖曳分隔線、tab 導航 |
| Common 元件 | ✅ | Button、Input、Textarea、Select、Modal |
| IndexedDB 持久化 | ✅ | Dexie.js schema + Zustand stores |

### 未完成（Phase 2+）

- LLM Wiki（存入/讀取 + 未存入提醒）
- Vector RAG（LanceDB + Ollama embedding）
- 角色關係圖視覺化
- 多 LLM provider 支援（Google ✅ 已完成；Ollama、Grok 等待實作）
- 導出功能（.txt / .html / .epub）
- 內容潤色器
- Multi-Agent 協作引擎

### 技術棧

- **建構工具**: Vite 8
- **框架**: React 19 + TypeScript (strict)
- **狀態管理**: Zustand 5 + persist
- **本地存儲**: Dexie.js 4 (IndexedDB)
- **LLM**: 自定義 API adapter（OpenAI-compatible）
- **UI**: 純 CSS（dark mode，無 UI framework）

### 運行方式

```bash
npm install
npm run dev
```

開啟 `http://localhost:5173` → 點擊「🔑 API 設定」填入 endpoint + key → 「新建專案」開始。

### 架構（截至 2026-05-11）

```
src/
├── main.tsx / App.tsx              # 入口 + 殼層 + AppView 路由（home / editor）
├── index.css                        # 全域 CSS（變數 + Apple 風格 dark mode）
├── types/index.ts                   # TypeScript interfaces
├── lib/
│   ├── db.ts                        # Dexie.js IndexedDB schema（v3）
│   ├── llm.ts                       # LLM adapter：custom / google；isLLMReady()
│   ├── ai-tasks.ts                  # AI 批次生成：章節骨架（含接續模式）、角色卡
│   ├── context-budget.ts            # Prompt 預算分配
│   └── prompt-log.ts                # Dev 除錯：logPromptToTemp() → temp/
├── stores/
│   ├── projectStore.ts              # 書本/章節/角色/版本 CRUD；reorderChapters
│   ├── settingsStore.ts             # LLM 設定（persist）
│   └── uiStore.ts                   # AppView、tab、選中章節、pane 寬度
└── components/
    ├── Toolbar.tsx                  # 頂部工具列 + 設定 Modal
    ├── layout/ResizablePane.tsx
    ├── common/                      # Button、Modal、ContextMenu 等
    ├── home/                        # HomePage、BookCard、NewBookModal
    ├── outline/OutlinePanel.tsx
    ├── characters/CharactersPanel.tsx
    └── chapters/{ChaptersPanel,ChapterEditor,VersionPanel,AdjustContentModal}.tsx
vite.config.ts                       # llmProxyPlugin（CORS 繞過）+ promptLogPlugin（dev log）
```

### Git 重構紀錄

本次同時處理了 git repo 結構問題：原本 git repo root 誤設於 `C:\`（C 槽根目錄），導致每次 git 操作需掃描整個磁碟，且 worktree 路徑錯位。已重新在 `C:\Leo\Project\novel-generator\` 建立乾淨 repo。

### Git History

```
714769d feat: Phase 1 implementation — full novel generator MVP
03f43dc chore: initial commit
```
## 2026-05-28 - Context Budget: Wiki summaries

- 章節生成現在會從 Wiki `summary/ch-N` 自動組出 `olderChapterSummary`：近期摘要保留、遠期摘要依本章標題/要點/節拍/角色做輕量相關性挑選。
- 既有「參考章節」仍是最高優先；若已載入參考章節全文，就不再重複塞同章摘要；若參考章節沒有正文，則以對應 Wiki 摘要補位。
## 2026-05-28 - Phase 2.5 Context / Wiki / Graph MVP

- Context Budget 新增 deterministic pick-pages：大型 Wiki 超出預算時會改用相關頁 + 近期 summary 的降級策略；設定中的 pick-pages 開關已可用。
- Wiki 新增「問 Wiki」入口：依問題挑選相關 Wiki pages，使用既有 `wikiQueryAnswerTemplate` 呼叫 LLM 回答並標註來源。
- Wiki 新增「摘要品質檢查」入口：檢查缺失、過短、標題不一致、缺少故事訊號的 `summary/ch-N`，可直接重建並更新 Wiki summary page / 寫入 `wiki_log`。
- Knowledge Graph 新增 `event_sequence` / `causal_hint` / `timeline_reference` 邊，先用 summary 章序與因果關鍵詞建立時間線與因果 MVP。
