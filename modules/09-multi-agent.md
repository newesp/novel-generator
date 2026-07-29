# 模組 09｜Multi-Agent 協作引擎

> Phase：4（選做）
> 依賴：03 章節管理、04 知識管理、05 版本管理、07 Context Budget、08 LLM Adapter

## 狀態

**✅ 已實作（2026-07-27）。**
現已完成包含 Planner、Writer、Critic、Editor 四個角色的完整 Multi-Agent 協作引擎。核心邏輯、`StorageAdapter` 資料表（Dexie IndexedDB schema v9 / SQLite migration 008）、LLM Profiles 連線設定檔（包含 Anthropic Claude 直連）、人工審核模態框、全域單一 LLM 執行槽、AI Activity Card、章節寫入鎖定、過期軌跡大內容清理與 Agent Inspector 均已完整落地。

領域術語以根目錄 [`CONTEXT.md`](../CONTEXT.md) 為準，重要取捨記錄於 [`docs/adr/`](../docs/adr/)。

---

## 目標與模式

使用 Planner、Writer、Critic、Editor 四種專責 Agent 組成可持久化、可恢復、可觀測的高品質章節生成流程。

- **快速生成（預設）**：保留現有單 Writer 流程與 `chapterContentTemplate`。
- **高品質生成**：啟動完整 Multi-Agent 生成執行。
- 章節動作列使用「生成」分割按鈕：主按鈕永遠是快速生成，選單提供高品質生成。
- 高品質生成不保存為預設，每次建立生成執行前都必須通過成本預檢與使用者確認。

---

## Agent 角色與 Prompt 契約

| Agent | 職責 | 輸出 |
|---|---|---|
| Planner | 根據章節節拍、要點、上下文與知識資料產生生成細綱 | 固定 schema 的結構化資料，至少包含 `beat`、`points` 與說明 |
| Writer | 依核准的生成細綱撰寫第一份候選草稿 | 純章節正文 |
| Critic | 依固定 rubric 評分、判定重大缺陷並產生可執行修改要求 | 固定 schema 的結構化評審 |
| Editor | 只依目前候選草稿與同版本 Critic feedback 進行針對性修訂 | 純章節正文 |

### Prompt 管理

- 建立 `GenerationRun` 時，context snapshot 會凍結書本 `writingLanguage`；Planner、Writer、Critic、Editor 全程使用同一創作語言契約。
- 切換 `interfaceLocale` 只改變執行狀態、Agent Inspector、人工審核與錯誤訊息，不會改變已建立 run 的輸出語言。
- 自訂 Agent role guidance 與 Prompt 不得覆寫 snapshot 中的創作語言。
- 快速模式保留既有 `chapterContentTemplate`，不遷移、不改變既有自訂模板。
- Multi-Agent 新增 Planner、Writer、Critic、Editor 四份獨立 Prompt 契約。
- 使用者可在偏好設定編輯四個角色的角色指令。
- 必要輸入、禁止事項、輸出格式與 JSON schema 由 App 以不可編輯、可版本化的系統契約附加。
- Planner、Critic 回傳無效結構時最多自動進行一次格式修復；原始與修復嘗試都進入執行軌跡。仍無效時停止並等待使用者重試該步驟。

### Writer／Editor 共用 executor

- 圖上保留 `writer_node` 與 `editor_node`，兩者共用同一個 generation executor。
- state 必須顯式帶 `generationRole: "writer" | "editor"`，不得只依 feedback 是否存在推斷角色。
- Editor 必須取得結構化 Critic feedback，且 `feedback.draftVersion` 必須等於目前候選草稿版本。
- Writer 每次生成執行只執行一次；Editor 完成後只回 Critic，不回 Writer。

---

## 生成流程

```text
成本預檢與確認
  ↓
Planner
  ↓
生成細綱人工審核
  ├─ 採用並更新 Chapter.beat + Chapter.points
  └─ 僅供本次生成使用
  ↓
Writer
  ↓
Critic
  ↓
路由
  ├─ 有重大缺陷且尚可修訂 ─────────────→ Editor → Critic
  ├─ 無重大缺陷，score ≥ passScore ────→ 自動採用
  ├─ 無重大缺陷，humanReviewFloor ≤ score < passScore
  │                                      → 人工審核
  ├─ 無重大缺陷，score < humanReviewFloor
  │   且尚可修訂 ───────────────────────→ Editor → Critic
  └─ 修訂上限耗盡 ─────────────────────→ 人工審核
```

### Planner 人工審核

Planner 完成後必定暫停，顯示生成細綱與現有 `beat`／`points` 的前後差異。

- **採用並更新章節規劃**：同時寫入 `Chapter.beat` 與 `Chapter.points`。
- **僅供本次生成使用**：不改動章節規劃，只把生成細綱保存在本次生成執行。

Planner 規劃一旦由使用者明確採用，即使之後取消正文生成也不回滾。

### Critic 路由

- `passScore` 預設 85。
- `humanReviewFloor` 預設 80。
- 必須保持 `0 ≤ humanReviewFloor < passScore ≤ 100`。
- 沒有重大缺陷且達到通過門檻時自動採用。
- 沒有重大缺陷且落在人工審核分數帶時立即停下，不自動消耗 Editor 次數。
- 重大缺陷優先於總分；即使達到通過門檻也必須修訂，修訂耗盡才轉人工。

### 人工審核

一般人工審核提供：

1. **直接採用**：記錄人工放行、實際分數與原門檻。
2. **交給 Editor 修訂**：加入使用者補充方向後進 Editor。
3. **人工修改**：建立新的候選草稿；完成後可直接採用，或再送 Critic 評分。

`maxRevisions` 只計 Editor 完成次數，不包含 Writer、Critic、格式修復或人工修改。預設 3，可在 1–5 間調整。一般上限耗盡後最多允許一次由使用者明確授權的額外 Editor 修訂，之後不再提供自動重試選項。

### 採用與正文鎖定

- Writer、Editor 與人工修改產生的內容在採用前都是候選草稿，不寫入 `Chapter.content`。
- 章節存在未結束生成執行時，正式正文設為唯讀。
- 局部調整、套用章節版本、快速生成及再次啟動高品質生成等所有會改寫 `Chapter.content` 的入口都必須停用。
- 查看、複製、版本預覽與 Agent 審核仍可使用。
- 自動或人工採用時，在同一個持久化操作中先保存原正文為正式 `ChapterVersion`，再更新 `Chapter.content` 並結束生成執行。
- 使用者取消流程後才恢復正文編輯；取消不改動正式正文。

---

## Critic Rubric

六個維度固定，配分可在全域偏好設定調整且總和必須為 100。

| 維度 | 預設配分 | 定義 |
|---|---:|---|
| 指令與章節目標 | 20 | 使用者最高優先指令、生成細綱、節拍、要點、標題與目標字數 |
| 劇情邏輯與因果 | 20 | 行動動機、資訊來源、事件因果、衝突解決與鋪陳 |
| 角色一致性與成長 | 20 | 知識、能力、性格、語氣、關係及成長弧線 |
| 前文與世界觀連貫 | 15 | 參考章節、Wiki、時間線、空間與未解情節 |
| 文風與敘事品質 | 15 | 中文表達、視角、語調、類型風格、可讀性與重複 |
| 節奏、結構與伏筆 | 10 | 場景安排、張力、轉場、高潮、章末推進與伏筆承接 |

App 必須依分項配分重新計算總分，不直接信任模型提供的總分。每個扣分需附草稿證據，`requiredChanges` 必須能直接成為 Editor 修改指令，feedback 必須帶對應的 `draftVersion`。

重大缺陷是獨立阻擋判定，例如：

- 違反使用者最高優先指令。
- 與 Wiki 或前文核心事實直接矛盾。
- 關鍵事件缺少必要因果或資訊來源。
- 主要角色突然擁有未建立的知識、能力或關係。
- 時間、地點或人物身分斷裂到使劇情無法成立。

---

## 持久化與資料邊界

所有資料以 `bookId` 為根，UI 與 stores 只透過 `StorageAdapter` 存取；瀏覽器使用 Dexie／IndexedDB，桌面版使用 Tauri SQLite。

首版在現有 TypeScript runtime 實作持久化 orchestrator／狀態機，不引入 Python sidecar 或 LangGraph runtime。Orchestrator 對 UI 提供單一 command-driven interface，具名 Agent 節點、LLM completion 與持久化細節都隱藏在該 interface 後方。

### 主要持久化概念

- **Generation Run**：單一章節的一次完整生成歷程。
- **Generation Context Snapshot**：建立流程時凍結的故事資料、書本創作語言、Prompt 契約版本、rubric、門檻與非敏感模型設定。
- **Checkpoint**：Agent 步驟完成或進入人工關卡時的可恢復狀態。
- **Agent Step／Attempt**：角色、嘗試次數、狀態、時間、輸入 checkpoint、Prompt、回應、provider／model 快照、usage、request metadata 與去敏化錯誤。
- **Candidate Draft／Draft Version**：本次流程中的候選正文及其遞增版本。
- **Run Summary**：大型內容清理後仍保留的輕量結果、評分、路由、模型、時間、用量與人工決策。

### 不變量

- 每章最多一個未結束生成執行；不同章節可各自保有流程。
- 未結束流程會阻止刪除其引用的 LLM 連線設定檔。
- API Key 不進入上下文快照、執行軌跡或摘要。
- 同一次生成執行始終使用建立時的上下文快照；來源資料變更只顯示「上下文已過期」，不在原流程內刷新。
- 所有 Agent 步驟完成後及所有人工關卡都必須先寫入 checkpoint，再允許下一個路由。
- 中間產物不寫入 `ChapterVersion`；只有採用時保存原正式正文。

### 可恢復狀態

- 等待 Planner 人工審核。
- 等待 Critic／修訂上限人工審核。
- 等待使用者完成人工修改。
- 等待繼續：App 重啟後尚未送出的付費步驟。
- 執行中斷：請求可能已送達，但未留下完成 checkpoint。
- 設定阻塞：引用的 LLM 連線設定檔缺少有效設定或憑證。

重新開啟 App 或還原備份後，不自動啟動任何付費步驟。

---

## 排程、錯誤與取消

### 全域排程

- 全 App 只有一個 LLM 執行槽，同時最多執行一個 Agent 步驟。
- 同一 App 工作階段內，佇列在前一步完成後自動接續。
- App 重啟後，原本未送出的步驟改為等待繼續，必須由使用者恢復流程或佇列。

### Retry

- Provider 明確回覆 408、425、429 或 5xx 時，最多依退避策略自動 retry 3 次，所有 transport 嘗試寫入軌跡。
- fetch 網路例外或 profile timeout 無法確認 provider 是否完成，必須標記執行中斷，不自動 retry。
- 執行中斷只允許使用者手動「重試此步驟」，從上一個完整 checkpoint 建立新的 attempt。
- 每個 LLM 連線設定檔提供 `timeoutSeconds`，預設 600，範圍 30–3600。

### 取消

- 取消立即發出 `AbortSignal`、把流程標記為已取消並忽略稍後抵達的回應。
- UI 必須提示 provider 仍可能已計費。
- 已取消流程保留摘要與軌跡，且不可恢復。
- 只有已採用或已取消的流程可刪除；未結束流程必須先取消。

---

## LLM 連線設定檔

偏好設定可建立多個全域 LLM 連線設定檔。每個設定檔保存 provider、endpoint、API Key、預設模型與生成參數；Planner、Writer、Critic、Editor 各自引用設定檔並可覆寫 model、temperature、maxTokens。

目標 adapter：

- OpenAI-compatible
- Google Gemini
- Grok
- Anthropic

這允許 Writer 使用 Anthropic Claude、Planner 使用 OpenAI 模型，而不在每個 Agent 重複保存憑證。直接使用不同 provider 時，各 adapter 必須把回應正規化為共同的 completion result，包含正文、可取得的 token usage、request ID 與 finish reason。

設定檔若仍被未結束流程引用則禁止刪除；所有引用流程都已採用或取消後可刪除，歷史紀錄仍保留非敏感 provider／model 快照。

---

## 成本預檢與偏好設定

### 建立流程前

每次高品質生成都顯示：

- 最壞情況 Agent／LLM 呼叫數。
- 預估輸入與輸出 token（啟用時計算）。
- 四個角色選用的設定檔與模型。
- 使用者填寫單價時的幣別成本估計。
- Provider 仍可能對取消、中斷或逾時請求計費的提示。

### 可調整的全域偏好

| 分組 | 設定 |
|---|---|
| LLM 連線設定檔 | 名稱、provider、endpoint、API Key、預設模型、temperature、maxTokens、timeoutSeconds |
| 成本資料 | 輸入／輸出每百萬 token 單價、幣別 |
| Agent 模型 | 四角色各自的 profile、model、temperature、maxTokens |
| Agent 指令 | 四角色各自的 Role Guidance |
| 修訂控制 | `maxRevisions`，1–5，預設 3 |
| Critic 路由 | `humanReviewFloor` 預設 80、`passScore` 預設 85 |
| Critic 配分 | 六維度權重，非負且總和為 100 |
| Token 顯示 | 是否估算、彙總並顯示 token 與成本 |

Provider 實際回傳的 token usage 無論顯示設定如何都保存到執行軌跡。以下規則固定、不公開成偏好：全域並行數 1、人工額外 Editor 1 次、格式修復 1 次、大型軌跡每章最近 3 次、HTTP retry 3 次、啟動不自動恢復、成本預檢必經、達標自動採用、正文鎖定、重大缺陷永遠啟用、系統 Prompt 契約不可編輯。

---

## 可觀測性、保留與備份

### 章節 UI

- 章節工作區把既有版本區改為「版本｜Agent」Tabs。
- Agent Tab 顯示生成執行清單、步驟時間軸、Prompt／回應、Critic 分項與證據、相鄰候選草稿比較、人工決策、usage、錯誤、繼續、取消、釘選與刪除。
- 章節清單以狀態徽章顯示未結束流程。
- 全域工具列只顯示單一執行槽與佇列狀態，不新增側欄工作區。
- 長內容與清單使用局部捲動，維持 v2 頁面外層 `overflow: hidden`。

### 保留

- 所有未結束流程保留完整軌跡。
- 每章最近三次已結束流程與所有釘選流程保留完整 Prompt、回應與候選草稿。
- 其他已結束流程自動清理大型內容，但保留 Run Summary。
- 系統不自動刪除 Run Summary；使用者可刪除整筆已結束紀錄。
- 刪除會級聯移除摘要、步驟、checkpoint、Prompt、回應與候選草稿，不影響 `Chapter.content` 或 `ChapterVersion`。

### JSON 備份

- Run Summary 一律納入。
- 匯出時提供預設開啟的「包含完整執行軌跡」選項。
- API Key 永遠排除。
- 還原後所有未結束流程進入等待繼續，不自動呼叫模型。

---

## 驗證重點

- 只透過 orchestrator 的外部 interface 測試流程，不讓 UI 測試依賴內部節點函式。
- 使用注入的 fake completion adapter 驗證 Planner → Writer → Critic → Editor 路由、門檻、重大缺陷、版本綁定與修訂上限。
- 以 Dexie 與 SQLite 的 `StorageAdapter` contract 驗證 checkpoint、恢復、唯一性、級聯刪除與採用交易。
- 驗證 App 重啟後不自動付費、執行中斷不自動重播、設定阻塞可恢復、取消後晚到回應被忽略。
- 驗證未結束流程鎖定所有正文寫入入口。
- UI 階段完成時依 `specs/UI.md` 在 Edge 以 1440×900、1024×768 驗證 Tabs、時間軸、差異檢視、人工審核與窄版工具列沒有裁切或雙層 scrollbar。

---

## 注意事項

- 完整流程可能消耗大量 token；先以單章測試，再考慮批次能力。
- 首版不允許同章多個未結束流程、不提供多 LLM 並行、不在 App 啟動時自動恢復付費工作。
- 本模組已實作完成（2026-07-27），完整程式碼位在 `src/lib/multi-agent/` 及 `src/components/chapters/` 等模組。
