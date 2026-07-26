# 小說產生器 — AI 載入指南

本機 Web App + Windows 桌面版（Tauri），自動生成高品質中文小說，從大綱到正文完整流程。

## 載入策略

1. 第一次進入專案：讀 `README.md`（系統概觀 + 模組總表）。
2. 依任務只載對應模組，不要全載：

| 任務                    | 載入                                           |
| --------------------- | -------------------------------------------- |
| UI 視覺/佈局              | `specs/UI.md` + `specs/UI-layout.md`         |
| 書本 CRUD / 首頁          | `modules/00-book.md`                         |
| 大綱生成                  | `modules/00` + `01`                          |
| 章節生成核心                | `modules/00` + `03` + `07`                   |
| Wiki / RAG / 知識層      | `modules/04` + `07`                          |
| 角色系統 / 關係圖            | `modules/02` + `04`                          |
| 版本管理                  | `modules/05`                                 |
| 潤色                    | `modules/06`                                 |
| LLM 串接 / provider     | `modules/08`                                 |
| Multi-Agent（Phase 4）  | `modules/09` + `07`                          |
| 多媒體生成（Phase 6 / Phase 4 選做） | `modules/10`                                 |
| 導出格式                  | `specs/output-formats.md`                    |
| 技術選型 / 版本             | `specs/tech-stack.md`（版本以 `package.json` 為準） |
| Phase 規劃              | `specs/roadmap.md`                           |
| 儲存層 / Tauri / adapter | `src/lib/storage/` + `specs/tech-stack.md`   |
| 部署方式                  | `specs/deployment.md`                        |

3. 以程式碼為主，md 不見得是最新資訊，只在設計/roadmap 時讀。
4. 用戶詢問歷史/最近改動時才查：優先 `docs/CHANGELOG.md`，否則 `git log` main 分支（忽略未合併 branch）。

## 開發鐵則

- 所有資料以 `bookId` 為根鍵；**瀏覽器版**存於 IndexedDB（Dexie）、**桌面版（Tauri）**存於 SQLite（`%AppData%\com.novelgenerator.app\novel-generator.db`）。UI / stores 只依賴 `src/lib/storage/` 的 `StorageAdapter` 介面，不直接 import `db`。
- 非硬性規定，但建議使用順序：CLI > API > MCP。
- 僅讀 main 分支。
- 技術棧現況（權威來源是 `package.json`）：React 19 / TypeScript strict / Vite 8 / Zustand 5 / Dexie 4 / Tauri 2.x（桌面殼層） / tauri-plugin-sql（SQLite） / 自製 UI 元件（無 shadcn、無 Tailwind，使用 CSS variables）。
- **驗證範圍**：程式碼變更只跑 `tsc -b`。完整 `vitest run`、browser 驗證留到階段完成，或使用者要求時。純 Markdown 文件整理不需要跑 `tsc -b`，但需以 `package.json`、`src/types/`、`src/lib/storage/` 與相關實作檔交叉檢查。驗證通過就 commit，並更新 `docs/CHANGELOG.md`。

## Agent skills

### Issue tracker

Issues 與 PRD 使用 GitHub Issues。詳見 `docs/agents/issue-tracker.md`。

### Triage labels

使用五個標準 triage labels。詳見 `docs/agents/triage-labels.md`。

### Domain docs

本專案採 single-context：`CONTEXT.md` 與 `docs/adr/`。詳見 `docs/agents/domain.md`。
