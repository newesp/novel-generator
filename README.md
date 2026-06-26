# 小說產生器（Novel Generator）

> 版本：1.10（Phase 6 comic image / TTS / MP4 / SRT / motion-effect video library implemented）　更新：2026-06-25

本機優先的中文小說創作工具，提供瀏覽器 Web App 與 Windows 桌面版（Tauri）。核心流程涵蓋書本管理、大綱、角色、章節正文、版本、LLM Wiki、全文檢索、知識圖、漫畫圖片生成，以及桌面版漫畫 TTS / MP4 / SRT 輸出、單格影片重輸出、鏡頭動態效果與章節內影片庫。

- 目標語言：中文小說（優先）
- 使用方式：本機瀏覽器或 Windows 桌面版
- 目前資料層：瀏覽器版 IndexedDB（Dexie）；桌面版 SQLite（`tauri-plugin-sql`）
- 輸出格式：`.txt` / `.html` / `.epub` 仍屬 Phase 3 未實作

---

## 快速開始

### 瀏覽器版

```bash
npm install
npm run dev
```

瀏覽器開 `http://localhost:5173`；首次使用點「偏好設定」填 LLM provider 與 API Key（支援 OpenAI-compatible、Google Gemini、Grok）。

### 桌面版（Windows，Phase 5b）

桌面版用 Tauri 包成原生 app、儲存走 SQLite（位於 `%AppData%\com.novelgenerator.app\novel-generator.db`），不受瀏覽器無痕模式 / 配額限制。

前置：安裝 [Rust toolchain](https://rustup.rs/) + Visual Studio Build Tools (Desktop C++) + WebView2 Runtime（Win 10/11 通常已內建）。

```bash
# 開發（會啟 vite + Tauri webview）
npm run tauri dev

# 打包 MSI 安裝檔
npm run tauri build
# 產物：src-tauri/target/release/bundle/msi/*.msi
```

瀏覽器版資料可透過「匯出 JSON → 桌面版匯入」搬移。

---

## 系統分層

1. **UI 層** — React 19 + TypeScript strict + Vite 8 + 自製 CSS variables 元件。
2. **業務邏輯層** — 大綱、角色、章節、版本、LLM Wiki、Context Budget、Lint、Graph、漫畫圖片。
3. **LLM 適配層** — 自定義 OpenAI-compatible、Google Gemini、Grok（文字）；ComfyUI、OpenAI-compatible image、DeepInfra FLUX、Google Gemini Image（圖片）。
4. **儲存層** — `StorageAdapter` 統一介面；瀏覽器版走 Dexie / IndexedDB，桌面版走 Tauri SQLite + FTS5。

---

## 模組總表

| 檔案 | 模組 | Phase | 依賴 |
|------|------|------|------|
| [00-book.md](modules/00-book.md) | 書本管理（所有資料根容器） | 1 | — |
| [01-outline.md](modules/01-outline.md) | 大綱生成系統 | 1 | 00, 02, 07, 08 |
| [02-characters.md](modules/02-characters.md) | 角色系統 | 2 | 00, 04 |
| [03-chapters.md](modules/03-chapters.md) | 章節管理器 | 1 | 00, 04, 05, 07 |
| [04-knowledge.md](modules/04-knowledge.md) | 知識管理（Wiki、FTS5、Lint、Graph、問 Wiki） | 2 / 2.5 | 00, 07 |
| [05-versions.md](modules/05-versions.md) | 章節版本管理 | 1 | 00 |
| [06-polish.md](modules/06-polish.md) | 內容潤色器（未實作） | 3 | 00, 08 |
| [07-context-budget.md](modules/07-context-budget.md) | Context Budget Manager（Wiki 摘要 + pick-pages + 摘要品質 ✅） | 1 / 2.5 | 04 |
| [08-llm-adapter.md](modules/08-llm-adapter.md) | LLM 適配層 | 1 / 2 | tech-stack |
| [09-multi-agent.md](modules/09-multi-agent.md) | Multi-Agent 協作引擎（未實作） | 4（選做） | 04, 07 |
| [10-multimedia.md](modules/10-multimedia.md) | 多媒體生成（漫畫圖片、TTS、MP4、SRT、motion effects 與章節內影片庫） | 6 / 4（選做） | 00, tech-stack |

---

## 規格文件

| 檔案 | 內容 |
|------|------|
| [tech-stack.md](specs/tech-stack.md) | 技術選型（版本以 `package.json` 為準） |
| [roadmap.md](specs/roadmap.md) | Phase 1–7 開發階段與未完成項 |
| [UI.md](specs/UI.md) | 視覺規範（色彩/字體/元件/動效） |
| [UI-layout.md](specs/UI-layout.md) | 主編輯介面佈局 |
| [output-formats.md](specs/output-formats.md) | 輸出格式規格 |
| [deployment.md](specs/deployment.md) | 部署方式 |

---

## 接下來未完成重點

- Phase 2.5 polish：手動批次摘要重建、LLM pick-pages、Graph 進階事件抽取 / 因果推理。
- Phase 3：`.txt` / `.html` / `.epub` 導出、完整內容潤色器、持續 UI/UX polish。
- Phase 4 / 6：Multi-Agent、封面圖生成、完整 Visual Bible 管理、provider reference weighting、全書級媒體庫、批次圖片/影片匯出、video orphan cleanup、多角色/對話 TTS、Web 版影片降級。
- Phase 5 / 7：macOS / Linux 打包、code signing、首次啟動自動 IndexedDB→SQLite 遷移（目前採手動 JSON）、`WaSqliteAdapter` / `WebMediaAdapter` / PWA 回部署。

詳細狀態以 [specs/roadmap.md](specs/roadmap.md) 為準。

---

## 授權

本專案採用 GNU Affero General Public License v3.0 only（SPDX：`AGPL-3.0-only`）。完整授權摘要見 [LICENSE](LICENSE)。

---

## 文件維護原則

- `package.json` 是套件版本權威來源。
- `src/types/index.ts` 與 `src/lib/storage/types.ts` 是資料模型與儲存介面權威來源。
- `docs/superpowers/specs/` 與 `docs/superpowers/plans/` 是歷史設計/實作紀錄，不回填成最新狀態；最新狀態以本 README、`modules/`、`specs/`、`docs/CHANGELOG.md` 與程式碼為準。
