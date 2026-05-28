# 小說產生器 — AI 載入指南

本機 Web App + Windows 桌面版（Tauri），自動生成高品質中文小說，從大綱到正文完整流程。

## 載入策略

1. 第一次進入專案：讀 `README.md`（系統概觀 + 模組總表）。
2. 依任務只載對應模組，不要全載：

| 任務 | 載入 |
|------|------|
| UI 視覺/佈局 | `specs/UI.md` + `specs/UI-layout.md` |
| 書本 CRUD / 首頁 | `modules/00-book.md` |
| 大綱生成 | `modules/00` + `01` |
| 章節生成核心 | `modules/00` + `03` + `07` |
| Wiki / RAG / 知識層 | `modules/04` + `07` |
| 角色系統 / 關係圖 | `modules/02` + `04` |
| 版本管理 | `modules/05` |
| 潤色 | `modules/06` |
| LLM 串接 / provider | `modules/08` |
| Multi-Agent（Phase 4） | `modules/09` + `07` |
| 多媒體生成（Phase 4） | `modules/10` |
| 導出格式 | `specs/output-formats.md` |
| 技術選型 / 版本 | `specs/tech-stack.md`（版本以 `package.json` 為準） |
| Phase 規劃 | `specs/roadmap.md` |
| 儲存層 / Tauri / adapter | `src/lib/storage/` + `specs/tech-stack.md` |
| 部署方式 | `specs/deployment.md` |

3. 用戶詢問歷史/最近改動時才查：優先 `docs/CHANGELOG.md`，否則 `git log` main 分支（忽略未合併 branch）。

## 開發鐵則

- 所有資料以 `bookId` 為根鍵；**瀏覽器版**存於 IndexedDB（Dexie）、**桌面版（Tauri）**存於 SQLite（`%AppData%\com.novelgenerator.app\novel-generator.db`）。UI / stores 只依賴 `src/lib/storage/` 的 `StorageAdapter` 介面，不直接 import `db`。
- 僅讀 main 分支；版本合併後將摘要存入 `docs/CHANGELOG.md`。
- Phase 1 優先「能跑的最小版本」，品質可日後迭代。
- 技術棧現況（權威來源是 `package.json`）：React 19 / TypeScript strict / Vite 8 / Zustand 5 / Dexie 4 / Tauri 2.x（桌面殼層） / tauri-plugin-sql（SQLite） / 自製 UI 元件（無 shadcn、無 Tailwind，使用 CSS variables）。


## Pre-handoff self-review

### Before writing code

1. Establish the review range (`BASE_SHA..HEAD_SHA`) and confirm it matches this PR's intended changes.
2. Read at least 2 sibling modules before inventing structure. Adopt their guardrails unless there's a documented reason to differ.
### During implementation

3. Verify external API, SDK, runtime-version, and config assumptions via official docs or real tool calls. Mark anything unverified as `[unverified]`.
4. Ask before proceeding on unverified assumptions that affect correctness, security, or data; otherwise document them explicitly.
### Before requesting human review

5. Run the project's real build, lint, and test commands. Include the actual command output, or the relevant passing summary / failing lines when output is long.
6. Remove dead code: unused files, exports, enum members, fields written but never read, and stale comments.
7. Keep docs aligned with actual behavior.
8. Keep one PR focused on one concern.
9. Scan the diff for secrets, PII, and customer-identifiable data.
10. Smoke-test the actual runtime path against test/staging endpoints. Do not use production side-effecting endpoints unless explicitly approved.
11. Run a self-review workflow. If Superpowers is available, use the `requesting-code-review` skill to dispatch parallel reviewers for (1) correctness & logic, (2) security & performance, (3) maintainability + naming + file locations. Fix all Critical and Important findings, then re-dispatch until they return zero Critical and zero Important. If Superpowers is not available, perform the same three review passes manually or with the available agent tooling.
12. If this is your own PR branch, squash noisy iteration commits into meaningful commits before handoff. Force-push only to your fork/branch, never upstream/shared branches.
13. Post a self-review report: commands run, outputs or summaries, reviewer findings, fixes made, and deferred items with reasons.