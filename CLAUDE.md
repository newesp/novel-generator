# 小說產生器 — AI 載入指南

本機瀏覽器 Web App，自動生成高品質中文小說，從大綱到正文完整流程。

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

3. 用戶詢問歷史/最近改動時才查：優先 `docs/CHANGELOG.md`，否則 `git log` main 分支（忽略未合併 branch）。

## 開發鐵則

- 所有資料以 `bookId` 為根鍵，存於 IndexedDB（Dexie）。
- 僅讀 main 分支；版本合併後將摘要存入 `docs/CHANGELOG.md`。
- Phase 1 優先「能跑的最小版本」，品質可日後迭代。
- 技術棧現況（權威來源是 `package.json`）：React 19 / TypeScript strict / Vite 8 / Zustand 5 / Dexie 4 / 自製 UI 元件（無 shadcn、無 Tailwind，使用 CSS variables）。
