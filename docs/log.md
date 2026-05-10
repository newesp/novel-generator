# 開發日誌

## 2026-05-10 Phase 1 完成

### 完成狀態

✅ **Phase 1 已完成** — 能跑的最小版本，可以完整生成一本小說

### 實作模組

| 模組 | 狀態 | 說明 |
|------|------|------|
| 00-book | ✅ | Toolbar 新建專案 + App.tsx auto-load 最近專案 |
| 01-outline | ✅ | 題材/風格 → AI 生成世界觀/主線劇情/章節大綱 |
| 02-characters | ✅ | 角色 CRUD、Modal 編輯器 |
| 03-chapters | ✅ | 章節生成、故事節拍、章節要點、調整方向 |
| 05-versions | ✅ | 3 版本保留、釘選、預覽、切換 |
| 07-context-budget | ✅ | 固定比例 token 分配 + 摘要截斷 |
| 08-llm-adapter | ✅ | OpenAI-compatible custom API |
| UI 殼層 | ✅ | 雙欄佈局、可拖曳分隔線、tab 導航 |
| Common 元件 | ✅ | Button、Input、Textarea、Select、Modal |
| IndexedDB 持久化 | ✅ | Dexie.js schema + Zustand stores |

### 未完成（Phase 2+）

- LLM Wiki（存入/讀取 + 未存入提醒）
- Vector RAG（LanceDB + Ollama embedding）
- 角色關係圖視覺化
- 多 LLM provider 支援（Ollama、Google、Grok 等）
- 導出功能（.txt / .html / .epub）
- 內容潤色器
- Multi-Agent 協作引擎

### 技術棧

- **建構工具**: Vite 8
- **框架**: React 19 + TypeScript (strict)
- **狀態管理**: Zustand 5 + persist
- **本地存儲**: Dexie.js 4 (IndexedDB)
- **LLM**: 自定義 API adapter（OpenAI-compatible）
- **UI**: 純 CSS（dark mode，無 UI framework）

### 運行方式

```bash
npm install
npm run dev
```

開啟 `http://localhost:5173` → 點擊「🔑 API 設定」填入 endpoint + key → 「新建專案」開始。

### 架構

```
src/
├── main.tsx / App.tsx              # 入口 + 殼層 + auto-load
├── index.css                        # 全域 CSS（變數 + Apple 風格 dark mode）
├── types/index.ts                   # TypeScript interfaces
├── lib/
│   ├── db.ts                        # Dexie.js IndexedDB schema
│   ├── llm.ts                       # LLM API adapter (fetch)
│   └── context-budget.ts            # Prompt 預算分配
├── stores/
│   ├── projectStore.ts              # 專案/章節/角色/版本 CRUD
│   ├── settingsStore.ts             # LLM API 設定（persist）
│   └── uiStore.ts                   # UI 狀態（tab、選中章節、pane 寬度）
└── components/
    ├── Toolbar.tsx                  # 頂部工具列 + API 設定 Modal
    ├── layout/ResizablePane.tsx
    ├── common/                      # Button、Input、Textarea、Select、Modal
    ├── outline/OutlinePanel.tsx
    ├── characters/CharactersPanel.tsx
    └── chapters/{ChaptersPanel,ChapterEditor,VersionPanel}.tsx
```

### Git 重構紀錄

本次同時處理了 git repo 結構問題：原本 git repo root 誤設於 `C:\`（C 槽根目錄），導致每次 git 操作需掃描整個磁碟，且 worktree 路徑錯位。已重新在 `C:\Leo\Project\novel-generator\` 建立乾淨 repo。

### Git History

```
714769d feat: Phase 1 implementation — full novel generator MVP
03f43dc chore: initial commit
```
