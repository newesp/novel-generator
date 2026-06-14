# 規格｜部署方式

---

## 本機 Web App

- 開發：`npm install` 後執行 `npm run dev`，固定使用 `http://localhost:5173`（`strictPort: true`）
- 預覽 production build：`npm run build` 後執行 `npm run preview`
- 所有資料存於本機 IndexedDB（Dexie），可選連結資料夾做 File System Access 備份
- LLM 文字生成在瀏覽器開發環境走 Vite `/llm-proxy` 避開 CORS；Tauri 桌面版直接 fetch 目標 API
- 若使用外部 LLM / image provider，生成能力仍取決於 API 可用性

### 已知限制

- **無痕模式關閉後資料會被清光**（IndexedDB 被瀏覽器清空）— 這是瀏覽器規範，非 bug
- 大量 binary（圖片/影片）受瀏覽器配額限制（通常數 GB）
- 影片合成若留在 Web 版只能用 ffmpeg.wasm 或後端服務，效能受限
- → 上述限制由 Phase 5 桌面化解決

---

## 桌面 App（Phase 5+，✅ Windows 已落地 2026-05）

- **Tauri 2.x 殼層**包裝既有 React + Vite 前端，UI 程式碼 99% 不變
- 資料層改用 **SQLite（native via `tauri-plugin-sql`）**，無瀏覽器配額限制、無無痕模式問題
  - DB 路徑：`%AppData%\com.novelgenerator.app\novel-generator.db`
  - `PRAGMA journal_mode=WAL` + `synchronous=NORMAL`（效能調校，規避 Windows Defender fsync 拖慢）
- 漫畫圖片 metadata 走 SQLite；大型 binary 長期目標是本機檔案系統
- 影片合成走 native **ffmpeg sidecar**（尚未實作）
- Windows MSI：`npm run tauri build` → `Novel Generator_0.1.0_x64_en-US.msi`（4.25 MB）
- macOS / Linux 打包：之後補

### 遷移策略（已實作）

**手動 JSON 搬遷**（最簡可靠）：
1. 瀏覽器版「匯出備份 JSON」→ 下載 `novel-generator-backup-<timestamp>.json`
2. 桌面版「匯入備份 JSON」→ replaceAll 覆蓋 SQLite（使用者已確認）
3. 資料完整性已驗證（bit-perfect round-trip）

> 注意：桌面版的 LLM 設定（API Key 等）存於 webview localStorage（不在 SQLite），
> 需手動在偏好設定重新輸入一次。

未實作：首次啟動自動偵測 IndexedDB 並匯入（YAGNI，手動 JSON 已足夠）。

---

## Web 版回部署（Phase 7，可選 / 未來）

- 透過 Phase 5 設計的 Adapter 介面，可在不重寫 UI 的前提下回到 Web 部署
- 儲存層改為 **wa-sqlite + OPFS**（與桌面共用 SQL schema）
- 媒體：OPFS 存 binary；影片功能降級（ffmpeg.wasm）或標示「桌面版專屬」
- 部署形式：靜態 PWA（離線可用、可安裝至桌面）

### 平台差異仍存在

- 無痕模式仍會清光 OPFS — 無解，僅能提示使用者
- 大檔案下載受瀏覽器限制 — 大型影片建議使用桌面版
- 多裝置同步需要後端，不在此 phase 範圍
