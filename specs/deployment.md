# 規格｜部署方式

---

## 本機 Web App（Phase 1–4 主要部署方式）

- 直接用瀏覽器開啟 `index.html`，或執行 `npx serve` 後於瀏覽器訪問
- 所有資料存於本機 IndexedDB（Dexie），可選連結資料夾做 File System Access 備份
- Ollama 在本機運行，無 CORS 限制
- 離線完全可用（LLM 使用 Ollama 本機模型時）

### 已知限制

- **無痕模式關閉後資料會被清光**（IndexedDB 被瀏覽器清空）— 這是瀏覽器規範，非 bug
- 大量 binary（圖片/影片）受瀏覽器配額限制（通常數 GB）
- 影片合成只能用 ffmpeg.wasm，效能受限
- → 上述限制由 Phase 5 桌面化解決

---

## 桌面 App（Phase 5+，規劃中）

- **Tauri 殼層**包裝既有 React + Vite 前端，UI 程式碼 99% 不變
- 資料層改用 **SQLite（native via `tauri-plugin-sql`）**，無瀏覽器配額限制、無無痕模式問題
- 媒體檔案存本機檔案系統：`<project_folder>/media/...`
- 影片合成走 native **ffmpeg sidecar**
- 三平台發布：Windows / macOS / Linux

### 遷移策略

1. 首次啟動桌面版偵測舊瀏覽器 IndexedDB 資料 → 一次性匯入 SQLite
2. 提供匯出 / 匯入 `.db` + media 資料夾的工具，方便使用者跨機器搬遷

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
