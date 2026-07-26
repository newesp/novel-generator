# Writer 與 Editor 共用 executor 並顯式指定角色

Writer 與 Editor 都需要組裝上下文、選擇 Prompt／模型設定、呼叫 LLM、記錄軌跡及建立候選草稿，建立兩套 executor 會讓 retry、logging 與錯誤處理逐漸分歧；只依 feedback 是否存在推斷角色又可能誤用殘留意見。因此圖上保留 `writer_node` 與 `editor_node` 兩個節點及各自 Prompt 契約，底層共用同一 generation executor，state 以 `generationRole` 明確指定角色。Editor 必須收到結構化 feedback，且其 `draftVersion` 必須等於目前候選草稿版本，否則不得執行；Writer 在每次生成執行中只執行一次，Editor 完成後直接回到 Critic。
