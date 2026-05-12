# 開發日誌

## 2026-05-12 Bug 修正 + 備份/同步

### Bug 修正

| 問題 | 原因 | 修正 |
|------|------|------|
| 關閉瀏覽器再開，剛建的書不見了 | Vite dev server 未固定 port，5173 被占用時會自動跳 5174/5175…；IndexedDB 綁定 origin（host:port），port 一變舊 DB 就「看似消失」（實際還在另一個 origin） | `vite.config.ts` 加 `server.port: 5173` + `strictPort: true`，被占用直接報錯不悄悄換 port |

### 新功能：備份與同步（💾 備份）

Toolbar 新增「💾 備份」按鈕，開啟備份/同步 Modal，提供兩種方案：

| 方案 | 操作 | 適用情境 |
|------|------|---------|
| **A. 手動匯出/匯入 JSON** | 📤 匯出全部 → 下載單一 JSON；📥 匯入 JSON → 取代本機資料 | 所有瀏覽器、無痕模式、換機備援 |
| **E. 連結同步資料夾**（File System Access API） | 一次性選資料夾，之後每次資料變動 2s 後自動寫入 `novel-generator-backup.json`；App 啟動且本機 DB 為空時自動還原 | Chrome/Edge；資料夾選在 OneDrive / Google Drive / iCloud 同步資料夾即可跨機 |

**架構：**

```
src/
├── lib/
│   ├── backup.ts        # exportSnapshot / importSnapshot / downloadSnapshotAsJson
│   ├── fs-sync.ts       # File System Access：pickAndLinkFolder / push / pull / 持久化 handle
│   └── auto-sync.ts     # 啟動掛載：訂閱 projectStore → debounced push（2s）；DB 空時自動 pull
└── components/
    └── BackupModal.tsx  # 整合 UI（手動 + 同步資料夾）
```

**DB 變更：**
- `db.ts` v4：新增 `appMeta` table（key-value），用來持久化 `FileSystemDirectoryHandle`（structured-cloneable）

**備份內容範圍：**
- ✅ projects / chapters / versions / characters
- ❌ settings（LLM API key，避免明文洩漏）
- ❌ Zustand persist（偏好設定、prompts），各自走 localStorage

**無痕模式說明：**
- IndexedDB 在無痕模式關閉時會被清除，連同已連結的資料夾 handle 一起消失，這是瀏覽器規範
- Modal 內已加提醒，建議無痕模式關閉前先「📤 匯出全部」

## 2026-05-11 Phase 2.x — AI 提示詞系統重構

承續同日 Phase 2 功能強化，下午針對 AI 生成品質與可定制性做了一輪深度重構。

### 完成功能

| 功能 | 說明 |
|------|------|
| AI 接續生成品質強化 | 章節骨架生成傳入角色清單避免 AI 自編人名；接續模式排除「引入」節拍；新增四條硬性規則阻止 AI 重啟故事 |
| 章節要點重新生成 | 章節要點 Modal 加「✨ 重新生成」按鈕；依本章節拍 + 參考章節（取尾段 1500 字）+ 角色清單，由 AI 寫出 2-4 句要點 |
| 進入書本自動定位 | 開書時若已有章節，直接切到「章節」分頁並選中第一章；空書則停在「大綱」 |
| Grok (xAI) Provider | 新增 `LLMProvider = 'grok'`；走 OpenAI-compatible，預設 baseUrl `https://api.x.ai/v1`、model `grok-2-latest` |
| 偏好設定分頁化 | Modal 內改為三主分頁：🔑 LLM API / ✨ 選取調整 / 📜 AI 提示詞 |
| 主編輯區 Markdown | 章節正文編輯器新增「✏️ 編輯 / 👁 預覽」切換；預覽模式以 react-markdown 渲染；雙擊回到編輯 |
| 4+1 Prompts 可編輯（方向 A） | 把全部 4 個 prompt 模板 + 接續規則搬到偏好設定；自訂 `{{var}}` template engine；UI sub-tabs 切換 5 個 prompts |
| 預覽變數代入 | 切到「預覽」會用範例資料或當前專案真實值代入 `{{var}}`，並以 Markdown 渲染 |
| 預覽資料來源切換 | 預設「當前專案」（從 useProjectStore 抓真實值），沒專案時自動 fallback 到範例；可切換到「範例資料」 |
| DB 維護工具（dev） | `src/lib/db-maintenance.ts` 掛到 `window.dbDebug`：`inspect()` / `cleanupOrphans()` / `wipeAllExceptBook()` 清舊版孤兒資料 |

### 新增檔案

```
src/
├── lib/
│   ├── prompt-template.ts      # renderTemplate({{var}}) + listTemplateVars
│   ├── prompt-defaults.ts      # 5 條預設 templates + SAMPLES + VARS 說明
│   ├── prompt-preview.ts       # buildLivePromptVars：從專案抓真實預覽變數
│   └── db-maintenance.ts       # window.dbDebug — inspect/cleanupOrphans/wipeAllExceptBook
└── components/common/
    ├── MarkdownView.tsx        # react-markdown 包裝 + .markdown-body 樣式
    └── EditPreviewTabs.tsx     # ✏️ 編輯 / 👁 預覽 共用切換 tabs
```

### Prompt 模板系統

四個 AI 任務全部走 template engine（可在偏好設定編輯）：

| # | 模板 key | 觸發 | 主要變數 |
|---|---------|------|---------|
| 1 | `chapterDraftsTemplate` | ✨ AI 生成章節 | `taskIntro`/`worldSetting`/`mainPlot`/`charactersSection`/`existingChaptersSection`/`continuationRulesSection`/`count`/`beatList` |
| 1.5 | `chapterContinuationRules` | 嵌入 #1 的接續規則段 | （純文字，被 #1 引用） |
| 2 | `chapterContentTemplate` | ✨ 生成本章 / ↩️ 重新生成 | `worldSetting`/`mainPlotSection`/`charactersSection`/`chapterTitle`/`beat`/`points`/`targetWords`/`referenceSection`/`adjustInstructionSection` |
| 3 | `chapterPointsTemplate` | 章節要點 → ✨ 重新生成 | `worldSetting`/`mainPlot`/`charactersSection`/`chapterTitle`/`beat`/`referenceSection`/`currentPointsSection` |
| 4 | `inlineAdjustTemplate` | 右鍵 ✨ 調整內容 | `chapterTitle`/`beat`/`points`/`beforeContext`/`selectedText`/`afterContext`/`adjustInstruction` |

設計約定：
- 模板僅做 `{{var}}` 字串替換，**不支援 if/loop**
- conditional 區段由 caller 預組成完整字串（如 `existingChaptersSection` = `""` 或完整 `## 現有章節\n...` 區塊）再注入
- `useSettingsStore.persist.merge()` 補齊舊使用者缺漏的 prompt 欄位，向後相容

### 偏好設定 → AI 提示詞 UI

```
[🔑 LLM API] [✨ 選取調整] [📜 AI 提示詞]
                              └─ [#1 章節骨架] [#1.5 接續規則] [#2 章節正文] [#3 章節要點] [#4 局部改寫]
                                              ▶ 可用變數（N）
                                              [✏️ 編輯] [👁 預覽]          [↺ 還原預設]
                                              變數來源：[當前專案 | 範例資料]
                                              ┌──────────────────────────────────────┐
                                              │ ... template / 渲染後的 markdown ...  │
                                              └──────────────────────────────────────┘
```

### 套件異動

- `+ react-markdown ^10.1.0` — Markdown 渲染

---

## 2026-05-11 Phase 2 功能強化

### 完成功能

| 功能 | 說明 |
|------|------|
| 書本管理首頁 | 首頁書本 Grid、BookCard（字數/更新時間）、NewBookModal、重命名/刪除、AppView 路由切換 |
| 多 LLM Provider | 新增 Google Gemini 支援；`isLLMReady()` 依 provider 判斷；Vite proxy 條件轉發 Authorization header |
| 角色成長弧線 | Character 新增 `arc` 欄位；AI 生成角色規則：主線提到的名字必生成、主角弧線對應主線劇情 |
| 章節編號徽章 | 章節列表項目左側顯示 `01`/`02` 數字徽章，依 array index 自動計算 |
| 章節拖曳排序 | HTML5 原生 DnD；上/下半部插入位置判斷（before/after）；`reorderChapters()` 批次更新 DB |
| 多選刪除章節 | Checkbox 多選、全選（含 indeterminate）、bulk-actions 動作列、批次刪除 |
| 參考章節持久化 | `referenceChapterId` 補入 Chapter type / DB 預設 / useEffect 載入 / handleSave / onChange 即時存 |
| AI 章節接續生成 | `ExistingChapterSummary`（index/title/beat/points）；接續模式傳最後 8 章給 AI；prompt 明確說明從第 N+1 章接續 |
| Prompt 除錯日誌 | `promptLogPlugin`（vite）+ `logPromptToTemp()` helper；每次「生成本章」自動寫 `temp/chapter-gen-TIMESTAMP.txt` |

### 架構更新

```
src/
├── lib/
│   ├── llm.ts            # 新增 Google Gemini branch、isLLMReady()
│   ├── ai-tasks.ts       # ExistingChapterSummary、接續生成 prompt、角色弧線規則
│   └── prompt-log.ts     # ★ 新增：logPromptToTemp() — 寫 prompt 到 temp/
├── stores/
│   └── uiStore.ts        # AppView = 'home' | 'editor'
└── components/
    └── home/             # ★ 新增資料夾：HomePage、BookCard、NewBookModal
vite.config.ts            # promptLogPlugin（POST /log-prompt → temp/）
```

### Bug 修正

| 問題 | 原因 | 修正 |
|------|------|------|
| 建立按鈕無反應 | `disabled={!title.trim()}` 且缺少 catch | 改為 always enabled + inline validation |
| KeyPath updatedAt not indexed | `loadAllBooks` 用 `orderBy('updatedAt')` 但 DB schema 未索引 | Dexie v3 migration 補 `updatedAt` 索引 |
| Google 401 ACCESS_TOKEN_TYPE_UNSUPPORTED | proxy 總是轉發 `Authorization: Bearer <key>` | Google branch 不送 Authorization；proxy 僅在非空時轉發 |
| 參考章節未儲存 | `referenceChapterId` 只是 local state | 加入 Chapter type / DB / useEffect / handleSave / onChange 即時存 |

---

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
- 多 LLM provider 支援（Google ✅ 已完成；Ollama、Grok 等待實作）
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

### 架構（截至 2026-05-11）

```
src/
├── main.tsx / App.tsx              # 入口 + 殼層 + AppView 路由（home / editor）
├── index.css                        # 全域 CSS（變數 + Apple 風格 dark mode）
├── types/index.ts                   # TypeScript interfaces
├── lib/
│   ├── db.ts                        # Dexie.js IndexedDB schema（v3）
│   ├── llm.ts                       # LLM adapter：custom / google；isLLMReady()
│   ├── ai-tasks.ts                  # AI 批次生成：章節骨架（含接續模式）、角色卡
│   ├── context-budget.ts            # Prompt 預算分配
│   └── prompt-log.ts                # Dev 除錯：logPromptToTemp() → temp/
├── stores/
│   ├── projectStore.ts              # 書本/章節/角色/版本 CRUD；reorderChapters
│   ├── settingsStore.ts             # LLM 設定（persist）
│   └── uiStore.ts                   # AppView、tab、選中章節、pane 寬度
└── components/
    ├── Toolbar.tsx                  # 頂部工具列 + 設定 Modal
    ├── layout/ResizablePane.tsx
    ├── common/                      # Button、Modal、ContextMenu 等
    ├── home/                        # HomePage、BookCard、NewBookModal
    ├── outline/OutlinePanel.tsx
    ├── characters/CharactersPanel.tsx
    └── chapters/{ChaptersPanel,ChapterEditor,VersionPanel,AdjustContentModal}.tsx
vite.config.ts                       # llmProxyPlugin（CORS 繞過）+ promptLogPlugin（dev log）
```

### Git 重構紀錄

本次同時處理了 git repo 結構問題：原本 git repo root 誤設於 `C:\`（C 槽根目錄），導致每次 git 操作需掃描整個磁碟，且 worktree 路徑錯位。已重新在 `C:\Leo\Project\novel-generator\` 建立乾淨 repo。

### Git History

```
714769d feat: Phase 1 implementation — full novel generator MVP
03f43dc chore: initial commit
```
