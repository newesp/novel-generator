# AI 執行狀態回饋與 Multi-Agent 正文解鎖設計

## 目標

讓所有等待時間較長的 AI 操作都能回答三個問題：

1. 現在有沒有真的在工作？
2. 正在做哪個階段，下一步需要誰處理？
3. 如果不想再等，如何安全停止並恢復操作？

本設計優先處理高品質 Multi-Agent 章節生成，再將同一套狀態回饋語言套用到一般單次 AI 生成。

## 現況診斷

### Multi-Agent 目前不是單純缺少 loading UI

`ChapterEditor.handleConfirmStartMultiAgent()` 現在只呼叫 `createGenerationRun()`。該函式只建立一筆 `status: "pending"` 的 Generation Run，接著 UI 立即把章節標記為鎖定；沒有任何程式接著呼叫 `executePlannerStep()`。

因此使用者看到「按鈕 disabled、正文被鎖、等很久沒有變化」時，流程實際上確實停在排隊狀態，不只是畫面漏顯示進度。

此外：

- `AgentRunPanel` 已存在，但沒有掛進任何章節工作區。
- `PlannerReviewModal` 與 `HumanReviewModal` 已存在，但沒有由章節工作區串起完整流程。
- Agent Run 與 Step 只在初次載入或手動重新整理時讀取，沒有訂閱或輪詢，因此即使背景狀態改變，畫面也不會自然更新。
- 正文鎖只在切換章節時重新查詢；Run 完成或取消後，原畫面不一定會立即解鎖。
- 目前取消有兩個入口：`cancelGenerationRun()` 只改狀態，`cancelRun()` 另有 AbortController。執行步驟尚未把該 signal 傳入 LLM 呼叫，實際網路請求無法可靠中止。
- `sanitizeStartupRuns()` 已實作，但未由 App 啟動流程呼叫。
- 現行 `awaiting_input` 同時可能代表 Planner 審核、候選草稿審核、中斷後等待繼續或格式錯誤，UI 無法知道該顯示哪個動作。

### 一般 AI 操作多半只有按鈕文字

目前世界觀／主線、角色批次生成、角色欄位補完、章節批次生成、快速生成正文、章節要點重整、局部調整、Wiki 問答與 Lint 建議修改，都只在原按鈕顯示「生成中…／查詢中…」並停用操作。

這種回饋在按鈕位於頁面角落、Modal footer 或已捲出可見區時很容易消失；同時沒有經過時間、目前階段、錯誤留存或停止入口。

漫畫工作區相對完整：已有 `message`、`role="status"`、分鏡圖片 `queued/generating/ready/failed` 狀態與批次結果。這一區應沿用既有狀態來源，只統一視覺與文案，不需要改造成 Multi-Agent Run。

## 設計原則

### 以真實狀態驅動畫面

- 不顯示假的百分比或假的剩餘秒數。
- 顯示真實階段、目前角色、已經過時間、佇列位置與可執行動作。
- 若 provider 不提供 token streaming，使用不定進度動畫，不假裝知道完成比例。
- 活潑文案可以輪替，但不能暗示不存在的進度。例如 Planner 呼叫期間可以顯示「整理章節節拍與背景資料」，不能顯示尚未發生的「已完成 70%」。

### 區分持久化流程與單次請求

- Multi-Agent 使用既有 Generation Run、Agent Step 與 Checkpoint 作為權威來源；可以跨章節、重新整理與 App 重啟恢復。
- 一般 AI 操作使用工作階段內的 Activity 狀態即可，不擴張成 Generation Run。
- 共用的是視覺元件與狀態語言，不是強迫所有 AI 操作共用同一種資料模型。

### Disabled 不是狀態回饋

停用按鈕只用來防止重複操作。每次長任務還必須在工作內容旁提供可見、可讀、可被輔助技術宣告的狀態區。

## Multi-Agent 狀態模型補強

Generation Run 保留粗粒度生命週期，另增加能驅動 UI 的明確欄位：

```ts
interface GenerationRunActivity {
  phase:
    | 'preparing'
    | 'queued'
    | 'planning'
    | 'writing'
    | 'criticizing'
    | 'editing'
    | 'saving'
    | 'awaiting_input'
    | 'completed'
    | 'failed'
    | 'cancelled';
  currentRole?: 'planner' | 'writer' | 'critic' | 'editor';
  currentStepId?: string;
  queuePosition?: number;
  pauseReason?:
    | 'planner_review'
    | 'human_review'
    | 'interrupted'
    | 'configuration_blocked'
    | 'format_repair_failed'
    | 'revision_limit';
  startedAt?: number;
  message?: string;
}
```

欄位名稱可在實作時調整，但 `pauseReason` 必須存在；不能再只靠 `awaiting_input` 猜測應顯示「審核」、「繼續」、「修復設定」或「重試」。

Orchestrator 應成為唯一命令入口：

- `startRun()`：建立 Run 後自動排入全 App 唯一 LLM 執行槽，輪到時立刻開始 Planner。
- `continueRun(command)`：接收 Planner 審核、人工審核、繼續或重試等明確命令。
- `cancelRun()`：中止請求、將 Run 標記為 cancelled、忽略遲到回應並保留軌跡。

UI 不直接串 `executePlannerStep()`、`executeWriterStep()` 等節點函式。

## Multi-Agent UI

### 1. 章節內固定工作卡

在章節工具列與正文之間顯示固定工作卡，取代目前紅色「已鎖定」橫幅：

```text
┌──────────────────────────────────────────────────────────────────┐
│ [Planner 人物圖]  Planner 正在規劃本章                           │
│                 整理章節節拍、要點與背景資料…  已經過 01:42      │
│                 ● Planner  ○ Writer  ○ Critic  ○ Editor          │
│                                      [查看執行] [停止並解鎖]      │
└──────────────────────────────────────────────────────────────────┘
```

狀態色：

- 藍／角色色：準備、排隊、執行中。
- 黃：等待使用者審核或修復設定。
- 紅：失敗。
- 灰：已取消。
- 綠：已完成／已採用。

執行中是正常狀態，不使用紅色警告背景。

### 2. 「版本｜Agent」右側 Inspector

依既有 ADR 0025，把右側 `VersionPanel` 改成 `版本｜Agent` Tabs。

- Agent Tab 顯示 Run 清單、目前步驟時間軸、角色圖、Prompt／回應、token、錯誤與動作。
- 有未結束 Run 時自動切到 Agent Tab；使用者仍可切回版本查看。
- 目前版本面板固定 240px，而 `AgentRunPanel` 內部另有 180px Run 清單，直接塞入會嚴重擁擠。Agent Tab 應改成單欄時間軸，或讓 Inspector 在 Agent 模式擴為約 360–420px。
- 1024px 寬度下改為可收合 Inspector 或底部抽屜，不能讓正文編輯區被壓到不可用。

### 3. 章節清單狀態徽章

每章顯示：

- `Planner 執行中`
- `排隊 #2`
- `等待審核`
- `執行中斷`
- `生成失敗`

點擊徽章直接打開該章與 Agent Tab。

### 4. 全域 LLM 執行槽

既有 ADR 規定全 App 同時只執行一個 Agent Step，因此工具列應顯示單一全域狀態：

```text
[Writer 小圖] Writer 正在撰寫〈第三章〉 · 02:18 · 另有 1 個任務排隊
```

點擊後返回對應章節。使用者切到大綱、角色或 Wiki 時仍知道背景流程沒有消失。

## 角色圖與動態文案

### 角色圖

首版建議使用隨 App 打包的固定角色圖，不在執行時生成圖片：

- Planner：藍色，手持筆記／地圖。
- Writer：綠色，書寫或鍵盤。
- Critic：橘色，放大鏡／評分板。
- Editor：紫色，校稿筆／修訂頁。

每張圖需有一致構圖、透明背景、小尺寸仍可辨識；建議提供 64px 與 128px 輸出。動態只做輕微呼吸、筆尖或三點省略動畫，並遵守 `prefers-reduced-motion`。

一般單次 AI 操作若沿用 Planner／Writer／Editor 人物圖，必須只在工作語義真的相符時使用，避免讓使用者誤以為它已進入持久化 Multi-Agent Run。其他任務先使用中性的「AI 助理」圖示，或另行確認是否要擴充 Librarian／Illustrator 等產品角色。

### 真實階段文案

| 階段 | 主訊息 | 次訊息範例 |
|---|---|---|
| preparing | 正在準備生成資料 | 載入章節、Wiki 與角色背景… |
| queued | 等待 AI 執行槽 | 前方還有 1 個任務 |
| Planner | Planner 正在規劃本章 | 整理節拍、要點與背景資料… |
| Writer | Writer 正在撰寫候選草稿 | 依核准細綱完成第一版正文… |
| Critic | Critic 正在評讀第 2 版 | 檢查情節、角色一致性與節奏… |
| Editor | Editor 正在修訂第 2 版 | 依 Critic 意見處理必要修改… |
| saving | 正在保存生成結果 | 寫入執行軌跡與檢查點… |
| planner_review | Planner 已完成，等待你審核 | 確認細綱後 Writer 才會開始 |
| human_review | 候選草稿需要你決定 | 可採用、修改或交回 Editor |
| interrupted | 上次執行被中斷 | 為避免重複計費，請手動重試 |

## 正文解鎖機制

### 鎖定範圍

維持 ADR 0030：只要有 Open Generation Run，就禁止所有會改寫 `Chapter.content` 的入口。

但正文輸入框應使用 `readOnly`，不能使用 `disabled`。ADR 明確允許查看與複製；disabled textarea 會降低可選取、可聚焦與輔助技術可理解性。

仍需停用：

- 快速生成。
- 再次啟動高品質生成。
- 局部調整與接受寫入。
- 套用章節版本。
- 儲存會改寫正文的操作。

仍可使用：

- 查看、選取與複製正文。
- 預覽版本與 Agent 軌跡。
- Planner／候選草稿審核。
- 繼續、重試或取消流程。

### 依狀態顯示解鎖動作

| Run 狀態 | 主動作 | 次動作 |
|---|---|---|
| queued / pending | 查看排隊 | 取消排隊並解鎖 |
| running | 查看進度 | 停止生成並解鎖 |
| awaiting_input + planner_review | 審核 Planner 細綱 | 放棄流程並解鎖 |
| awaiting_input + human_review | 審核候選草稿 | 放棄流程並解鎖 |
| awaiting_input + interrupted | 重試此步驟 | 取消流程並解鎖 |
| configuration_blocked | 修復設定 | 取消流程並解鎖 |
| failed | 查看錯誤 | 已自動解鎖，可重新開始 |
| completed / cancelled | 查看紀錄 | 已解鎖 |

### 取消確認

確認內容必須說明：

- 正在進行的請求會嘗試立即停止，但 provider 可能已經計費。
- 候選草稿不會寫入正式正文。
- 執行軌跡會保留。
- 已經由使用者明確採用的 Planner `beat`／`points` 不回滾。

按下後顯示「停止中…」，直到 cancelled 狀態已持久化才移除鎖定。所有 Agent 回應寫入前都必須再次檢查 Run 仍可寫入，確保遲到回應不會復活已取消流程。

### 自動解鎖與狀態同步

- completed、failed、cancelled 都是終止狀態，立即解鎖。
- UI 必須訂閱 Generation Run store 或由明確事件更新，不能只在切換章節時查一次。
- App 啟動必須執行安全恢復；中斷的執行仍維持鎖定，但要顯示「重試／取消」而不是假裝仍在執行。

## 全專案 AI 回饋盤點

| 區域 | 現況 | 建議回饋 | 優先級 |
|---|---|---|---:|
| 高品質 Multi-Agent 章節生成 | 建立 pending Run 後鎖住，未啟動 Planner | 角色工作卡、Agent Tab、章節徽章、全域槽、取消／繼續 | P0 |
| 快速生成正文 | 只有底部按鈕改字 | Writer 工作卡、經過時間、正文暫時唯讀、失敗留在卡片 | P1 |
| 世界觀／主線生成 | 左側按鈕改字 | Planner／AI 助理狀態卡放在兩個輸出欄上方 | P1 |
| 章節批次生成 | Modal footer 按鈕改字 | Modal 內顯示規劃中、目標章數、完成後結果摘要 | P1 |
| 角色批次生成 | Modal footer 按鈕改字 | Modal 內顯示正在設計幾個角色與經過時間 | P1 |
| 角色欄位補完 | Header 按鈕改字 | 表單頂部狀態條，說明只補空白欄位 | P1 |
| 章節要點 AI 重整 | Modal footer 按鈕改字 | Planner 狀態卡，保留舊值並顯示產出後差異 | P1 |
| 局部調整正文 | Modal footer 按鈕改字 | Writer／Editor 狀態卡，顯示選取字數與上下文範圍 | P1 |
| Wiki 問答 | 按鈕顯示查詢中 | 在答案區顯示正在閱讀幾頁 Wiki 與經過時間 | P1 |
| Lint LLM 修改建議 | Issue 按鈕改字 | Issue inline 狀態列，標明正在分析哪一頁 | P1 |
| 單章 Wiki ingest | 按鈕顯示存入中 | 狀態卡顯示分析／建立／更新 Wiki 階段 | P2 |
| 批次 Wiki ingest | 已有 done/total/current | 補 aria-live、錯誤數與可停止入口 | P2 |
| 漫畫分鏡生成 | 已有 message | 統一狀態卡與角色視覺 | P2 |
| 漫畫圖片生成 | 已有整體 message 與逐格狀態 | 增加完成格數／總格數；保留逐格失敗重試 | P2 |
| TTS／影片輸出 | 已有細分狀態與訊息 | 視覺統一，不納入 Multi-Agent Run | P3 |

## 共用 UI 元件

建議建立一個純呈現元件，例如 `AIActivityCard`：

- `role`／`avatar`
- `title`
- `message`
- `startedAt`
- `phase`
- `progress`（僅接受真實 determinate 數值）
- `primaryAction`
- `secondaryAction`
- `tone`
- `compact`

Multi-Agent 從持久化 Run Activity 轉成 props；一般 AI 操作由 local state 轉成 props。元件應包含 `role="status"` 與 `aria-live="polite"`；失敗訊息使用 `role="alert"`。

## Frontend Visual QA

### 受影響容器

- `ChapterEditor`
- `.editor-body`：flex，`overflow: hidden`
- `.editor-content`：flex column，`min-width: 0`
- 右側 `.version-panel`：固定 240px
- 底部 `.action-bar`：固定、不捲動

### 視覺根因

目前唯一狀態提示藏在底部按鈕或紅色鎖定橫幅；長任務狀態沒有固定內容區，右側既有 Agent 面板又尚未掛載且寬度不相容。

### 結構修正

- 工作卡放在正文上方且不隨正文內容捲走。
- 版本／Agent Inspector 共用受控捲動，Agent 模式調整寬度或改成單欄。
- 小寬度下 Inspector 改為抽屜，不以縮字或裁切按鈕解決。
- 狀態卡按鈕允許換行，主動作與破壞性停止動作保持清楚區隔。
- 動畫遵守 reduced motion，文字更新可由輔助技術讀取。

## 建議實作順序

1. 修正 Multi-Agent happy path：確認預檢後自動排隊並執行 Planner。
2. 建立 orchestrator command seam，統一取消、繼續、重試與 late response 防護。
3. 補 Run Activity／pauseReason，建立可訂閱的 Run store。
4. 掛載工作卡、版本／Agent Tabs、章節徽章與全域執行槽。
5. 把正文改為 readOnly，完成各狀態取消／解鎖閉環。
6. 建立共用 `AIActivityCard`，依 P1 → P3 套用到一般 AI 操作。
7. 最後加入角色圖與細緻動畫；先確保狀態正確，再做角色化。

## 驗收條件

- 確認高品質生成後，Planner 在同一次 Run 內真正開始執行。
- 任一時間都能看出 running、queued、awaiting input、failed 或 interrupted。
- 執行中切換頁面後，全域工具列仍顯示目前工作。
- Planner 完成時顯示細綱審核入口，Writer 不會提前執行。
- 取消後 Run 變為 cancelled、軌跡保留、正文未改寫且畫面立即解鎖。
- App 重啟後不自動重送付費請求；使用者可重試或取消。
- 鎖定正文時仍可選取與複製。
- 一般 AI 任務不再只靠 disabled 按鈕表示工作中。
- 1024×768 與 1440×900 下沒有文字、按鈕或 Inspector 裁切。

## 待確認產品選項

1. 角色圖採隨 App 打包的固定插畫，或允許使用者自訂／替換？建議首版固定插畫。
2. 一般單次 AI 任務是否沿用 Planner／Writer／Editor 人設？建議只在語義明確時沿用，其他先用中性 AI 助理，避免混淆 Multi-Agent Run。
3. 執行中的角色卡要偏「專業工作台」還是「較具陪伴感的角色對話」？兩者會影響文案密度與角色圖占比；建議以專業工作台為主，保留一行生動次訊息。
