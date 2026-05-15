# 規格｜技術選型

---

## 技術棧總表

> 套件版本以 `package.json` 為準；本表只說明選型。

| 層級 | 選型 |
|------|------|
| 前端框架 | React + TypeScript（strict） |
| 建構工具 | Vite |
| 狀態管理 | Zustand + persist |
| 樣式 | CSS variables（無 Tailwind） |
| UI 元件 | 自製元件（無 shadcn / Radix） |
| 本地存儲（Phase 1–4） | IndexedDB (Dexie.js) + File System Access API |
| 本地存儲（Phase 5+，桌面版） | SQLite（native，透過 `tauri-plugin-sql`）+ 本機檔案系統 |
| 本地存儲（Phase 7，Web 版回部署） | wa-sqlite + OPFS（與桌面共用 SQL schema） |
| 桌面殼層（Phase 5+） | Tauri（Rust + 系統 webview，比 Electron 輕量） |
| 影片合成（Phase 6，桌面） | ffmpeg sidecar（native） |
| 影片合成（Phase 7，Web） | ffmpeg.wasm（功能降級，或介接後端 API） |
| LLM 调用 | 自製 adapter（OpenAI-compatible / Google Gemini，可擴充） |
| Embedding | Ollama（nomic-embed-text / mxbai-embed-large）— Phase 2 |
| 向量資料庫 | LanceDB（瀏覽器端）— Phase 2 |
| Graph 關係層 | JSON 圖結構存於 IndexedDB；D3.js / React Flow 視覺化 — Phase 2.5 |
| 電子書生成 | epub-gen 或手寫 EPUB 結構 — Phase 3 |
| 圖像生成 | Grok Imagine / Flux Schnell — Phase 4 |
| TTS | Edge-TTS / ElevenLabs API — Phase 4 |

---

## 技術說明

**epub：** epubjs 定位為電子書**閱讀器**，不適合用於生成 epub 檔案。epub 本質上是符合特定規範的 ZIP 壓縮包（包含 OPF、NCX/NAV、HTML 章節檔），建議改用 `epub-gen` 套件，或直接手寫 epub 結構以獲得最大控制彈性。

**Ollama CORS：** 本專案定位為本機運行，可直接呼叫 `localhost:11434`，無 CORS 問題。若未來考慮 Web 部署，需額外處理。

**儲存層 Adapter 抽象（Phase 5 起）：** UI 與 business logic 僅依賴 `StorageAdapter` / `MediaAdapter` interface；底層可換 Dexie / SQLite (Tauri) / wa-sqlite (Web) 三種實作。SQL schema 設計需確保 Tauri native SQLite 與 wa-sqlite 都能執行相同語句，僅在薄 wrapper 層統一 transaction API 差異。

**媒體檔案儲存規則（Phase 5/6）：** metadata（章節 ↔ 圖片/音檔的關聯與 prompt）進 SQLite；binary（PNG / MP3 / MP4）進本機檔案系統，例 `<project_folder>/media/ch01/panel-01.png`。adapter 對外只回不透明 handle 或本地 URL，避免 UI 與底層耦合。
