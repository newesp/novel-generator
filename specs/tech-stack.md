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
| 本地存儲 | IndexedDB (Dexie.js) + File System Access API |
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
