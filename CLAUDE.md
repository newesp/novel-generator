# 小說產生器（Novel Generator）

## 專案背景

啟動時讀取 `README.md` 獲取專案背景。若存在 `docs/CHANGELOG.md`，優先讀取最近版本摘要；若不存在，fallback 到最近三個 git commit 訊息。

專案目標：本機瀏覽器 Web App，自動生成高品質中文小說，從大綱到正文完整流程。

## 文件結構

```
README.md               # 主文件：系統架構、模組索引、跨模組依賴
docs/
  plan.md               # 完整規劃文件（含所有模組詳細規格）
  log.md                # 開發日誌
specs/
  roadmap.md            # 開發階段規劃（Phase 1–4）
  tech-stack.md         # 技術選型
  UI.md                 # 視覺規範
  UI-layout.md          # 主編輯介面佈局
  output-formats.md     # 輸出格式規格
  deployment.md         # 部署方式
modules/
  00-book.md            # 書本管理（Phase 1）
  01-outline.md         # 大綱生成系統（Phase 1）
  02-characters.md      # 角色系統（Phase 2）
  03-chapters.md        # 章節管理器（Phase 1）
  04-knowledge.md       # 知識管理系統（Phase 2/2.5）
  05-versions.md        # 章節版本管理（Phase 1）
  06-polish.md          # 內容潤色器（Phase 3）
  07-context-budget.md  # Context Budget Manager（Phase 1/2.5）
  08-llm-adapter.md     # LLM 適配層（Phase 1/2）
  09-multi-agent.md     # Multi-Agent 協作引擎（Phase 4，選做）
  10-multimedia.md      # 多媒體生成模組（Phase 4，選做）
```

## 實作任務對應文件

| 任務 | 建議載入 |
|------|---------|
| UI 實作 | README + specs/UI.md + specs/UI-layout.md |
| 書本列表與 CRUD | README + modules/00-book.md |
| 大綱生成流程 | README + modules/00 + 01 + specs/tech-stack.md |
| 章節生成核心 | README + modules/00 + 03 + 07 |
| Wiki 存入與提醒 | README + modules/04 + 07 + specs/tech-stack.md |
| 角色系統與關係圖 | README + modules/02 + 04 |
| 版本管理 | README + modules/05 |
| LLM 串接 | README + modules/08 + specs/tech-stack.md |
| 導出功能 | README + specs/output-formats.md + specs/tech-stack.md |
| Phase 規劃確認 | README + specs/roadmap.md |

## 技術棧

- **建構工具**: Vite 5
- **框架**: React 18 + TypeScript (strict)
- **狀態管理**: Zustand + persist
- **本地存儲**: Dexie.js 4 (IndexedDB)
- **UI 元件**: shadcn/ui + Radix UI
- **LLM**: 自定義 API adapter（OpenAI-compatible，Phase 1）
- **樣式**: Tailwind CSS

## 開發規則

- AI 僅讀取 main 分支的 commit，忽略尚未合併的 feature branch
- 當版本更新完成並合併至 main 後，將版本摘要存入 `docs/CHANGELOG.md`
- 所有資料以 `bookId` 為根鍵，存於 IndexedDB
- Phase 1 優先：能跑的最小版本，哪怕品質普通
