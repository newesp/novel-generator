# 持久化 Multi-Agent 生成執行

Multi-Agent 章節生成可能在人工審核點暫停，僅保存在 UI 工作階段會使重新整理、切換章節或重啟桌面 App 中斷流程，並可能造成重複的付費 LLM 呼叫。因此每次生成執行都必須以 `bookId` 為根、關聯目標章節，透過 `StorageAdapter` 同時持久化至瀏覽器版 Dexie 與桌面版 SQLite，並在每個 Agent 節點完成後及進入人工審核時建立可恢復的檢查點。
