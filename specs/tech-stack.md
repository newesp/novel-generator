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
| 本地存儲（瀏覽器版） | IndexedDB (Dexie.js) + File System Access API 備份 |
| 本地存儲（桌面版） | SQLite（native，透過 `tauri-plugin-sql`，已落地 2026-05） |
| 本地存儲（Phase 7，Web 版回部署） | wa-sqlite + OPFS（與桌面共用 SQL schema） |
| 桌面殼層（Phase 5+） | Tauri 2.x（Rust + 系統 webview，比 Electron 輕量；Windows 已落地 2026-05） |
| 影片合成（Phase 6，桌面） | ffmpeg sidecar（native） |
| 影片合成（Phase 7，Web） | ffmpeg.wasm（功能降級，或介接後端 API） |
| LLM 呼叫 | 自製 adapter（OpenAI-compatible / Google Gemini / Grok） |
| 全文檢索 | SQLite FTS5 + trigram tokenizer — Phase 2（未來真有 vector 需求改用 sqlite-vec，不引入 Ollama / LanceDB） |
| Graph 關係層 | 由 characters + wiki pages 即時計算 JSON graph；Wiki 面板可查 2-hop neighborhood |
| 電子書生成 | epub-gen 或手寫 EPUB 結構 — Phase 3 |
| 圖像生成 | `ImageGenerationProvider`：ComfyUI / OpenAI-compatible image / DeepInfra FLUX / Google Gemini Image |
| TTS | Edge-TTS / ElevenLabs API — Phase 4 |

---

## 技術說明

**epub：** epubjs 定位為電子書**閱讀器**，不適合用於生成 epub 檔案。epub 本質上是符合特定規範的 ZIP 壓縮包（包含 OPF、NCX/NAV、HTML 章節檔），建議改用 `epub-gen` 套件，或直接手寫 epub 結構以獲得最大控制彈性。

**Ollama / 本機模型：** 尚未有專屬 provider。若本機模型服務提供 OpenAI-compatible chat completions endpoint，可先走自定義 API；若未來加入 Ollama native provider，再補 CORS / Tauri 直連差異。

**儲存層 Adapter 抽象（Phase 5 起）：** UI 與 business logic 僅依賴 `StorageAdapter` interface；底層可換 Dexie / SQLite (Tauri) / wa-sqlite (Web) 三種實作。SQL schema 設計需確保 Tauri native SQLite 與 wa-sqlite 都能執行相同語句，僅在薄 wrapper 層統一 transaction API 差異。

**媒體檔案儲存規則（Phase 6）：** metadata（章節 ↔ 圖片/音檔的關聯、prompt、provider params、圖片歷史）進 adapter 管理的資料表；目前生成圖片會正規化為可持久化的 URL/data URL 並以 `MediaAsset` metadata 追蹤。大型 binary 長期仍應移往本機檔案系統，避免 DB 或瀏覽器儲存膨脹。

**Phase 5b 已落地細節（2026-05，Windows）：**
- `src-tauri/` 內含 migrations `001_initial.sql` 到 `006_comic_panel_image_variants.sql`
- DB 路徑 `%AppData%\com.novelgenerator.app\novel-generator.db`
- 啟用 `PRAGMA journal_mode=WAL + synchronous=NORMAL` 規避 Windows Defender 對 fsync 的拖慢
- tauri-plugin-sql v2.x 無 transaction API；`replaceAll` 非 atomic（接受由使用者明確覆蓋）
- macOS / Linux 打包之後再加
