# 小說產生器（Novel Generator）

> 版本：1.5（Phase 2 進行中）　更新：2026-05-12

本機瀏覽器 Web App，自動生成高品質中文小說，從大綱到正文完整流程；透過 **LLM Wiki + Vector RAG 混合記憶** 維持一致性。Multi-Agent 協作（Phase 4）為選配。

- 目標語言：中文小說（優先）
- 使用方式：本機瀏覽器執行
- 輸出格式：`.txt` / `.html` / `.epub`

---

## 快速開始

### 瀏覽器版

```bash
npm install
npm run dev
```

瀏覽器開 `http://localhost:5173`；首次使用點「⚙️ 偏好設定」填 LLM provider 與 API Key（支援 OpenAI-compatible、Google Gemini、Grok）。

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

1. **UI 層** — 本機 Web App（React 19 + 自製元件）
2. **業務邏輯層** — 大綱／角色／章節／潤色 + LLM Wiki + Vector RAG + Context Budget Manager + Graph 關係層（Phase 2.5）+ Multi-Agent（Phase 4，選做）
3. **LLM 適配層** — OpenAI / Anthropic / Google / Grok / Ollama + 自定義 API
4. **儲存層** — IndexedDB（Dexie，以 `bookId` 為根）/ File System API / LanceDB（向量，Ollama embedding）

---

## 模組總表

| 檔案 | 模組 | Phase | 依賴 |
|------|------|------|------|
| [00-book.md](modules/00-book.md) | 書本管理（所有資料根容器） | 1 | — |
| [01-outline.md](modules/01-outline.md) | 大綱生成系統 | 1 | 00, 02, 07, 08 |
| [02-characters.md](modules/02-characters.md) | 角色系統 | 2 | 00, 04 |
| [03-chapters.md](modules/03-chapters.md) | 章節管理器 | 1 | 00, 04, 05, 07 |
| [04-knowledge.md](modules/04-knowledge.md) | 知識管理（Wiki + RAG + Graph） | 2 / 2.5 | 00, 07 |
| [05-versions.md](modules/05-versions.md) | 章節版本管理 | 1 | 00 |
| [06-polish.md](modules/06-polish.md) | 內容潤色器 | 3 | 00, 08 |
| [07-context-budget.md](modules/07-context-budget.md) | Context Budget Manager | 1 / 2.5 | 04 |
| [08-llm-adapter.md](modules/08-llm-adapter.md) | LLM 適配層 | 1 / 2 | tech-stack |
| [09-multi-agent.md](modules/09-multi-agent.md) | Multi-Agent 協作引擎 | 4（選做） | 04, 07 |
| [10-multimedia.md](modules/10-multimedia.md) | 多媒體生成 | 4（選做） | 00, tech-stack |

---

## 規格文件

| 檔案 | 內容 |
|------|------|
| [tech-stack.md](specs/tech-stack.md) | 技術選型（版本以 `package.json` 為準） |
| [roadmap.md](specs/roadmap.md) | Phase 1–4 開發階段 |
| [UI.md](specs/UI.md) | 視覺規範（色彩/字體/元件/動效） |
| [UI-layout.md](specs/UI-layout.md) | 主編輯介面佈局 |
| [output-formats.md](specs/output-formats.md) | 輸出格式規格 |
| [deployment.md](specs/deployment.md) | 部署方式 |

> AI 載入策略另見 `CLAUDE.md`。
