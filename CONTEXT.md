# 小說產生器

本文件定義小說生成領域的共通語言，讓產品規格、介面與實作使用一致術語。

## Multi-Agent 生成

**生成執行（Generation Run）**：
針對單一章節發起的一次完整 Multi-Agent 生成歷程，從規劃開始，直到採用、取消或失敗；暫停或重新開啟應用程式後仍視為同一次歷程。
_Avoid_：工作流、任務、生成版本

**檢查點（Checkpoint）**：
生成執行在可安全暫停與恢復的位置所留下的狀態快照。
_Avoid_：章節版本、自動儲存

**執行中斷（Interrupted）**：
Agent 步驟已開始，但未留下完成檢查點，因而無法確認外部生成是否完成的生成執行狀態；必須由使用者明確決定是否重試該步驟。
_Avoid_：失敗、自動重試、繼續執行

**已取消（Cancelled）**：
使用者明確放棄且不可繼續的生成執行終結狀態；保留既有執行軌跡，但不得再接受 Agent 輸出或改動正式正文。
_Avoid_：暫停、執行中斷、刪除紀錄

**等待繼續（Awaiting Resume）**：
生成執行具有下一個可執行步驟，但因 App 工作階段已結束而暫停，必須由使用者明確恢復付費執行的狀態。
_Avoid_：排隊、人工審核、執行中斷

**設定阻塞（Configuration Blocked）**：
未結束生成執行因引用的 LLM 連線設定檔缺少有效憑證或必要設定而無法開始下一步的可恢復狀態。
_Avoid_：執行中斷、失敗、等待繼續

**成本預檢（Cost Preflight）**：
建立生成執行前，向使用者呈現最壞呼叫數、角色模型配置，以及啟用時計算的 token 與幣別成本估計。
_Avoid_：實際用量、帳單、成本上限

**未結束生成執行（Open Generation Run）**：
尚未被採用、取消或判定為不可恢復失敗的生成執行；正在執行、等待人工審核與執行中斷都屬於未結束。
_Avoid_：Active Run、背景任務

**Agent 步驟（Agent Step）**：
生成執行中由一個專責角色讀取目前檢查點並產生下一個檢查點的一次工作。
_Avoid_：Agent 執行個體、節點函式、LLM 請求

**生成細綱（Generation Plan）**：
Planner 針對單次生成執行提出的章節寫作計畫；經使用者審核後，可只供該次生成使用，或採用為章節的正式規劃資料。
_Avoid_：章節要點、大綱、Planner 草稿

**重大缺陷（Hard Failure）**：
Critic 判定草稿存在足以阻止自動採用的關鍵問題；此判定獨立於總分，且優先於通過門檻。
_Avoid_：必改建議、低分、錯誤訊息

**人工審核（Human Review）**：
生成執行在檢查點暫停，等待使用者明確決定採用、交由 Editor 修訂或自行修改的狀態。
_Avoid_：確認視窗、執行中斷、失敗

**候選草稿（Candidate Draft）**：
Writer、Editor 或人工修改在生成執行內產生、但尚未成為正式章節正文的完整內容。
_Avoid_：章節版本、正式正文、暫存檔

**候選草稿版本（Draft Version）**：
同一次生成執行內每份候選草稿的遞增識別，用來確保 Critic feedback 只作用於它實際評審的草稿。
_Avoid_：ChapterVersion、修訂次數、檢查點版本

**採用（Adoption）**：
將生成執行中的候選草稿確立為正式章節正文，並結束該次生成執行的終結動作；可由達標路由或人工決策觸發。
_Avoid_：儲存、套用版本、完成生成

**執行軌跡（Run Trace）**：
生成執行內依時間排列、不可覆寫的 Agent 步驟嘗試、候選草稿、評審結果與人工決策紀錄。
_Avoid_：章節版本歷史、Prompt 暫存紀錄、應用程式日誌

**執行摘要（Run Summary）**：
生成執行在大型內容自動清理後仍保留的輕量追溯資料，包含結果、評分、路由、時間、模型與人工決策；只有使用者明確刪除整筆已結束紀錄時才移除。
_Avoid_：執行軌跡、章節摘要、應用程式日誌

**修訂次數（Revision Count）**：
同一次生成執行中 Editor 已完成的次數，不包含初始 Writer、Critic 重評或人工修改。
_Avoid_：迭代次數、Agent 步驟數、生成次數

**通過門檻（Pass Score）**：
Critic 在沒有重大缺陷時允許候選草稿自動採用的最低總分。
_Avoid_：及格分數、品質分數

**人工審核下限（Human Review Floor）**：
Critic 在沒有重大缺陷時，將候選草稿送入人工審核而非自動交給 Editor 的最低總分。
_Avoid_：最低分、警告門檻

**評審準則（Critic Rubric）**：
Critic 評估候選草稿時使用的六個固定品質維度及其全域配分；配分總和必須為 100。
_Avoid_：評分 Prompt、通過門檻、重大缺陷規則

**LLM 連線設定檔（LLM Connection Profile）**：
一組可重用的模型供應商連線、憑證與預設生成參數；Agent 角色引用設定檔，而不各自保存憑證。
_Avoid_：Agent、Provider、模型設定

**Prompt 契約（Prompt Contract）**：
一個 Agent 角色專用的指令、可用輸入與輸出要求；不同角色各自維護契約，即使共用相同 executor。
_Avoid_：Prompt、Agent 執行個體、模板字串

**角色指令（Role Guidance）**：
Prompt 契約中允許使用者編輯的角色目標、偏好與工作方式，不包含系統維護的必要輸入與輸出結構。
_Avoid_：Prompt 契約、System Prompt、JSON Schema

**格式修復（Format Repair）**：
Planner 或 Critic 的完整回應不符合固定輸出結構時，使用原回應與驗證錯誤進行的一次受限修正嘗試。
_Avoid_：自動重試、Editor 修訂、人工修改

**生成上下文快照（Generation Context Snapshot）**：
生成執行建立時凍結的故事資料、Prompt 契約版本、評審設定與非敏感模型設定；同一次執行的所有 Agent 步驟都以此為基準。
_Avoid_：目前專案資料、檢查點、Prompt 紀錄
