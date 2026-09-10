# 小說產生器（Novel Generator）

[English](README.en.md)

> 版本：1.13（中英雙語介面與不可變書籍創作語言）　更新：2026-07-29

本機優先的中、英文小說創作工具，提供瀏覽器 Web App 與 Windows 桌面版（Tauri）。核心流程涵蓋書本管理、大綱、角色、章節正文（支援單 Writer 快速生成與 Planner / Writer / Critic / Editor 四角色的高品質 Multi-Agent 生成）、版本、LLM Wiki、全文檢索、知識圖、漫畫圖片生成，以及桌面版漫畫 TTS / MP4 / SRT 輸出、單格影片重輸出、鏡頭動態效果與章節內影片庫。

- 介面語言：繁體中文（`zh-TW`）／English（`en`），可在偏好設定即時切換
- 創作語言：每本書建立時選擇繁體中文（`zh-Hant`）或 English（`en`），建立後鎖定
- 使用方式：本機瀏覽器或 Windows 桌面版
- 目前資料層：瀏覽器版 IndexedDB（Dexie）；桌面版 SQLite（`tauri-plugin-sql`）
- 輸出格式：已支援整本 `.txt` / `.html` / `.epub` 導出
- 目前介面：Mantine Gray 主題；大綱、角色、場景、章節、Wiki、漫畫、影片各自使用獨立工作區，v1 保留於 tag `v1.0.0` / branch `release/v1`

---

## 語言模型

- **Interface Locale** 只控制 UI、狀態、驗證、錯誤、日期與原生視窗標題，不決定小說內容語言。
- **Writing Language** 屬於書本，決定大綱、角色、章節、Wiki、Lint 修復、漫畫旁白、Multi-Agent 與成書匯出的內容語言。
- 偏好設定的「新書預設創作語言」只影響建立表單預設值；每本書仍需在建立時確認，之後不可中途變更。
- 內建 AI Prompt 依書本創作語言選用中／英文版本；使用者自訂 Prompt 仍受不可覆寫的創作語言契約約束。
- 英文書籍預設使用英文 Edge-TTS voice；單格與整章影片輸出都會阻擋不相符的 TTS voice。
- 題材、風格與章節節拍以穩定代碼儲存、依介面語言顯示；自訂值保留使用者原文。

---

## 快速開始

### 瀏覽器版

```bash
npm install
npm run dev
```

瀏覽器開 `http://localhost:5173`；首次使用點「偏好設定」填 LLM Connection Profile 與 API Key（支援 OpenAI-compatible、Google Gemini、Grok、Anthropic Claude）。

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

## CI/CD

GitHub Actions 使用 `.github/workflows/ci-cd.yml`：

- Pull Request：在 `ubuntu-latest` 執行 `npm ci`、`npm run lint`、`npm run test`、`npm run build`。
- `main` push：先跑同一組 CI；通過後在 `windows-latest` 建置 Tauri Windows MSI，並上傳為 workflow artifact。
- 目前不部署 GitHub Pages。靜態 Pages 無法提供 Tauri SQLite、native file dialog、ffmpeg / Edge-TTS sidecar，也沒有 Vite dev-only `/llm-proxy`，因此只把可安裝桌面產物視為目前的 CD 目標。

---

## 系統分層

1. **UI 層** — React 19 + TypeScript strict + Vite 8 + Mantine Gray 主題；既有自製元件保留為功能相容層。
2. **業務邏輯層** — 大綱、角色、章節、版本、LLM Wiki、Context Budget、Lint、Graph、Multi-Agent 協作引擎、漫畫圖片。
3. **LLM 適配層** — 具名 LLM Profile 管理；支援自定義 OpenAI-compatible、Google Gemini、Grok、Anthropic Claude（文字）；ComfyUI、OpenAI-compatible image、DeepInfra FLUX、Google Gemini Image（圖片）。
4. **儲存層** — `StorageAdapter` 統一介面；瀏覽器版走 Dexie / IndexedDB，桌面版走 Tauri SQLite + FTS5。

---

## 技術棧（Tech Stack）

本專案詳細技術選型與架構說明請參見 [specs/tech-stack.md](specs/tech-stack.md)，核心技術組成如下（套件版本以 `package.json` 為準）：

| 領域 / 層級 | 技術與工具 | 說明 |
|-------------|------------|------|
| **前端框架** | React 19 + TypeScript（Strict 模式） | 現代化前端架構與完整型別安全 |
| **建構工具** | Vite 8 | 快速開發伺服器與模組打包 |
| **狀態管理** | Zustand 5 | 輕量且模組化的全域狀態管理與快照 |
| **UI 與樣式** | Mantine v9（Gray 主題）+ Lucide React | 統一設計系統、CSS 變數與圖示庫（無 Tailwind / shadcn） |
| **內容渲染** | react-markdown | Markdown 格式渲染與預覽 |
| **桌面端核心** | Tauri 2.x (Rust) | 輕量級本機桌面殼層（比 Electron 佔用更低資源） |
| **資料儲存** | IndexedDB (`Dexie.js`) / SQLite (`tauri-plugin-sql`) | 雙引擎架構（Web 版走 IndexedDB，桌面版走 SQLite），由抽象 `StorageAdapter` 統一介面 |
| **全文檢索** | SQLite FTS5 (trigram tokenizer) | 桌面端高效繁簡中文與英文知識檢索 |
| **多媒體與音訊** | Edge-TTS + FFmpeg Sidecar | 漫畫對白/旁白語音合成、單格/整章 MP4 視訊渲染與鏡頭動態效果 |
| **LLM 適配** | 自製 Adapter（具名 Profile 管理） | 直連 OpenAI-compatible、Google Gemini、Grok、Anthropic Claude |
| **Multi-Agent** | 自製協作引擎 | Planner、Writer、Critic、Editor 四角色協同生成與反思精煉 |
| **圖像生成** | 自製 ImageProvider | 支援 ComfyUI、OpenAI-compatible image、DeepInfra FLUX、Google Gemini Image |
| **測試與品管** | Vitest + JSDOM + ESLint + TypeScript ESLint | 單元與整合測試、程式碼靜態分析與 React Hook 規範檢查 |

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
| [08-llm-adapter.md](modules/08-llm-adapter.md) | LLM 適配層（具名 Profile + Anthropic ✅） | 1 / 2 | tech-stack |
| [09-multi-agent.md](modules/09-multi-agent.md) | Multi-Agent 協作引擎（Planner / Writer / Critic / Editor ✅） | 4（選做） | 03, 04, 05, 07, 08 |
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
- Phase 3：完整內容潤色器；v2 工作區基礎重整已完成，後續持續做局部 UI/UX polish。
- Phase 4 / 6：封面圖生成、完整 Visual Bible 管理、provider reference weighting、全書級媒體庫、批次圖片/影片匯出、video orphan cleanup、多角色/對話 TTS、Web 版影片降級。
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
