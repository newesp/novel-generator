# Multi-Agent orchestrator 使用 TypeScript 狀態機

現有產品的章節生成、LLM adapter、stores、Dexie、Tauri SQLite 與 UI 全部位於 TypeScript；為單一選配模組加入 Python LangGraph sidecar 會增加 Windows 打包、程序生命週期、Web 版降級、API Key 傳遞及 checkpoint 跨 runtime 同步成本。首版因此在現有 TypeScript runtime 實作持久化 orchestrator／狀態機，以具名 Planner、Writer、Critic、Editor 節點提供相同的路由與執行軌跡；不引入 Python 或 LangGraph runtime。Orchestrator 對 UI 提供單一 command-driven interface，LLM 與持久化只作為內部注入 seam。
