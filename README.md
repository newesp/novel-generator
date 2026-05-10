# 小說產生器（Novel Generator）— 主文件

> 版本：1.3（Phase 1 完成）　建立日期：2026-05-08　更新：2026-05-10

---

## 快速開始

```bash
npm install
npm run dev
```

然後在瀏覽器打開 `http://localhost:5173`。首次使用需點擊「🔑 API 設定」填入您的 LLM API endpoint 和 key（支援 OpenAI-compatible API）。

---

## 專案概述

一款能夠自動生成高品質中文小說的本機 Web 應用程式，在本機瀏覽器中運行，提供從大綱到正文的完整生成流程，並透過 **LLM Wiki + Vector RAG 混合記憶** 確保內容一致性。Multi-Agent 協作引擎為選配功能，於 Phase 4 導入。

- **目標語言**：中文小說（優先）
- **使用方式**：本機瀏覽器直接開啟（`index.html` 或 `npx serve`）
- **輸出格式**：`.txt` / `.html` / `.epub`

---

## 系統架構

```
┌─────────────────────────────────────────────────────────┐
│                    用戶界面層 (本機 Web App)             │
├─────────────────────────────────────────────────────────┤
│                    業務邏輯層                           │
│  大綱生成器 │ 角色系統 │ 章節管理器 │ 內容潤色器        │
│          LLM Wiki + Vector RAG 混合記憶                  │
│          Context Budget Manager（上下文預算管理器）      │
│          Graph 關係層（Phase 2.5，JSON 模式）            │
│          Multi-Agent 協作引擎（Phase 4，選做）           │
├─────────────────────────────────────────────────────────┤
│                    LLM 適配層                           │
│  OpenAI │ Anthropic │ Google │ Grok │ Ollama            │
│          + 自定義 API (如 NVIDIA)                        │
├─────────────────────────────────────────────────────────┤
│                     數據存儲層                           │
│   書本資料模型（bookId 為所有資料的根鍵）                   │
│   IndexedDB (Dexie.js) │ 文件系統 API                    │
│   Vector DB: LanceDB（Ollama embedding，本機）           │
└─────────────────────────────────────────────────────────┘
```

---

## 模組索引

### 功能模組（`modules/`）

| 檔案                                                   | 模組                     | Phase   | 說明                                |
| ---------------------------------------------------- | ---------------------- | ------- | --------------------------------- |
| [00-book.md](modules/00-book.md)                     | 書本管理                   | 1       | 書本 CRUD、首頁列表、資料根容器                |
| [01-outline.md](modules/01-outline.md)               | 大綱生成系統                 | 1       | 題材/風格輸入 → 世界觀/主線劇情                |
| [02-characters.md](modules/02-characters.md)         | 角色系統                   | 2       | 角色 CRUD、卡片管理、關係圖視覺化               |
| [03-chapters.md](modules/03-chapters.md)             | 章節管理器                  | 1       | 章節生成、故事節拍機制                       |
| [04-knowledge.md](modules/04-knowledge.md)           | 知識管理系統                 | 2 / 2.5 | LLM Wiki + Vector RAG + Graph 關係層 |
| [05-versions.md](modules/05-versions.md)             | 章節版本管理                 | 1       | 3 版保留、釘選、版本切換                     |
| [06-polish.md](modules/06-polish.md)                 | 內容潤色器                  | 3       | 文風、語法、描寫密度、對話優化                   |
| [07-context-budget.md](modules/07-context-budget.md) | Context Budget Manager | 1 / 2.5 | Token 預算分配、摘要壓縮                   |
| [08-llm-adapter.md](modules/08-llm-adapter.md)       | LLM 適配層                | 1 / 2   | 多 provider 支援、自定義 API             |
| [09-multi-agent.md](modules/09-multi-agent.md)       | Multi-Agent 協作引擎       | 4（選做）   | Planner/Writer/Critic/Editor 流水線  |
| [10-multimedia.md](modules/10-multimedia.md)         | 多媒體生成模組                | 4（選做）   | 封面圖、漫畫分鏡、語音朗讀                     |

### 規格文件（`specs/`）

| 檔案                                           | 內容                             |
| -------------------------------------------- | ------------------------------ |
| [tech-stack.md](specs/tech-stack.md)         | 技術選型與說明                        |
| [output-formats.md](specs/output-formats.md) | 輸出格式規格                         |
| [deployment.md](specs/deployment.md)         | 部署方式                           |
| [roadmap.md](specs/roadmap.md)               | 開發階段規劃（Phase 1–4）              |
| [UI.md](specs/UI.md)                         | 視覺規範（色彩、字體、元件、動效）              |
| [UI-layout.md](specs/UI-layout.md)           | 主編輯介面佈局（雙欄結構、左側分頁、右側工具列、底部動作列） |

---

## 跨模組依賴關係

```
書本管理（00）← 所有模組的資料根容器，所有 bookId 均源自此
	└── 被依賴 → 01 大綱、02 角色、03 章節、04 知識、05 版本

章節管理器（03）
    └── 依賴 → Context Budget Manager（07）：組裝每次生成的 Prompt
    └── 依賴 → 知識管理系統（04）：載入 Wiki + RAG 檢索結果
    └── 依賴 → 章節版本管理（05）：生成結果存入版本歷史

知識管理系統（04）
    └── 依賴 → Context Budget Manager（07）：決定載入哪些 Wiki 條目

Multi-Agent（09）[Phase 4]
    └── 依賴 → Context Budget Manager（07）：分配 Agent 間 token
    └── 依賴 → 知識管理系統（04）：Graph 層提供 Critic 審核依據
```

---

## AI 實作參考：按任務載入文件

| 實作任務                 | 建議載入                                             |
| -------------------- | ------------------------------------------------ |
| UI 實作                | README + specs/UI + mockup.html                  |
| 書本列表與 CRUD           | README + 00                                      |
| 大綱生成流程               | README + 00 + 01 + specs/tech-stack              |
| 章節生成核心               | README + 00 + 03 + 07                            |
| Wiki 存入與提醒           | README + 04 + 07 + specs/tech-stack              |
| 角色系統與關係圖             | README + 02 + 04                                 |
| 版本管理                 | README + 05                                      |
| LLM 串接               | README + 08 + specs/tech-stack                   |
| 導出功能                 | README + specs/output-formats + specs/tech-stack |
| Phase 規劃確認           | README + specs/roadmap                           |
| Multi-Agent（Phase 4） | README + 09 + 07                                 |
