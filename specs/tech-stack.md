# 規格｜技術選型

---

## 技術棧總表

| 層級           | 技術方案                                         |
| ------------ | -------------------------------------------- |
| 前端框架         | React + TypeScript                           |
| 狀態管理         | Zustand + persist                            |
| LLM 调用       | LangChain.js / Vercel AI SDK / 直接 API        |
| Embedding 模型 | Ollama（nomic-embed-text / mxbai-embed-large） |
| 向量資料庫        | LanceDB（瀏覽器端）                                |
| Graph 關係層    | JSON 圖結構存於 IndexedDB；D3.js / React Flow 視覺化  |
| LLM Wiki     | skill (skills/llm-wiki)                      |
| 本地存儲         | IndexedDB (Dexie.js) + 文件系統 API              |
| 電子書生成        | epub-gen 或手寫 EPUB 結構                         |
| 圖像生成         | Grok Imagine / Flux Schnell（Phase 4）         |
| TTS          | Edge-TTS / ElevenLabs API（Phase 4）           |
| UI 元件        | shadcn/ui + Radix UI                         |

---

## 技術說明

**epub：** epubjs 定位為電子書**閱讀器**，不適合用於生成 epub 檔案。epub 本質上是符合特定規範的 ZIP 壓縮包（包含 OPF、NCX/NAV、HTML 章節檔），建議改用 `epub-gen` 套件，或直接手寫 epub 結構以獲得最大控制彈性。

**Ollama CORS：** 本專案定位為本機運行，可直接呼叫 `localhost:11434`，無 CORS 問題。若未來考慮 Web 部署，需額外處理。
