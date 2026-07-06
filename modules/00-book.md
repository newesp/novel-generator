# 模組 00｜書本管理

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)

## 核心概念

書本是整個應用程式的頂層容器。角色、章節、Wiki、版本歷史等所有資料都屬於某一本書。用戶必須先建立或開啟一本書，才能進入其餘的編輯流程。

---

## 書本資料結構

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | string | 唯一識別碼（UUID），在多數文件中語意上等同 `bookId` |
| title | string | 書名 |
| genre | string | 題材（玄幻/都市/仙俠/科幻/言情/懸疑/自定義） |
| style | string | 風格（輕鬆/沉重/黑暗/熱血/幽默/爽文/自定義） |
| worldSetting | string | 世界觀設定 |
| mainPlot | string | 主線劇情 |
| chapterOutline | string | 章節大綱文字 |
| createdAt | timestamp | 建立時間 |
| updatedAt | timestamp | 最後修改時間 |

> 權威型別：`src/types/index.ts` 的 `Project`。目前沒有書本層級 `coverImage`、`defaultLLMProvider`、`defaultLanguageStyle` 欄位；LLM 與圖片 provider 設定走全域 `settingsStore`。

---

## 核心功能（✅ = 已實作）

- ✅ 建立新書
- ✅ 開啟書本
- ✅ 重命名書本
- ✅ 刪除書本（含確認提示，避免誤刪；同時刪除所有章節/版本/角色）
- ✅ **備份/匯出全部**（單檔 JSON snapshot，含書本、章節、版本、角色、Wiki、漫畫、媒體資產、場景視覺）
- ✅ **匯入 JSON**（取代本機資料）
- ✅ **連結同步資料夾**（File System Access API，自動寫入；建議選 OneDrive/Google Drive 同步資料夾）
- ✅ 匯出整本書（成書格式 .txt/.html/.epub，見 specs/output-formats）[Phase 3]
- ❌ 書本層級設定（預設 LLM provider、語言風格等）[Phase 2]；目前 LLM / 圖片 provider 設定仍是全域偏好設定

---

## UI — 首頁（書本列表）

**頁面流程：**

```
應用程式啟動
    ↓
首頁（書本列表）
    ├── [+ 新增書本] → 建立書本表單（彈窗）→ 進入主編輯介面
    ├── 點擊書本卡片  → 進入主編輯介面（specs/UI-layout.md）
    └── 書本卡片 [⋯] → 重命名 / 刪除
```

**首頁佈局：**

```
┌─────────────────────────────────────────┐
│  小說產生器                [+ 新增書本]   │  頂部列 48px
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ 封面圖    │  │ 封面圖    │  │       │ │
│  │          │  │          │  │   +   │ │
│  │ 書名     │  │ 書名     │  │       │ │
│  │ 題材・字數│  │ 題材・字數│  │ 新增  │ │
│  │ 更新時間  │  │ 更新時間  │  │       │ │
│  └──────────┘  └──────────┘  └───────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**書本卡片元件：**
- 封面圖（有則顯示，無則以題材色塊佔位）
- 書名（頁面標題字級）
- 題材 + 目前總字數
- 最後更新時間
- Hover 顯示 `[⋯]` 選單：重命名 / 刪除

**新增書本表單（彈窗）：**
- 書名（文字輸入，必填）
- 題材（文字輸入，點擊出現預設列表：玄幻/都市/仙俠/科幻/言情/懸疑/自定義）
- 風格（文字輸入，點擊出現預設列表：輕鬆/沉重/黑暗/熱血/幽默/爽文/自定義）
- [建立]（主按鈕）/ [取消]（次按鈕）

**刪除確認彈窗：**
- 顯示書名，說明操作不可復原
- [確認刪除]（危險色）/ [取消]

---

## 實作備註

- `AppView = 'home' | 'editor'`（uiStore）控制首頁/編輯器切換
- 書本字數由 `chapters` 陣列的 `content.length` 加總，在首頁載入時計算（非即時）
- `updatedAt` 欄位需在 Dexie schema 中索引才可 `orderBy`（v3 migration 補足）
- `NewBookModal` 按鈕 always enabled，click 時才做 inline validation（書名必填）

---

## 備份與同步（💾 備份）

Toolbar 點「💾 備份」開啟 Modal，提供兩條路徑：

| 方案 | 機制 | 適用 |
|------|------|------|
| **手動匯出/匯入 JSON** | `exportSnapshot()` dump `StorageBundle` 主要資料為單檔；`importSnapshot()` replaceAll 還原 | 全瀏覽器、無痕模式、換機備援 |
| **連結同步資料夾** | File System Access API；handle 存於 Dexie `appMeta` table；訂閱 `projectStore`，2s debounced 寫入 `novel-generator-backup.json` | Chrome/Edge；資料夾選在 OneDrive/iCloud 同步資料夾即可跨機 |

**啟動行為**（`initAutoSync()` 於 `main.tsx` 載入時呼叫）：
- 若已連結資料夾且權限仍 granted：
  - 本機 DB 為空 → 從資料夾 pull 還原
  - 本機 DB 非空 → 立刻 push 一次覆寫資料夾的備份檔
- 訂閱主要書本狀態，變動 2s 後 debounced push

**備份範圍：**
- ✅ projects / chapters / versions / characters
- ✅ wikiPages / wikiLog
- ✅ comics / comicPanels / comicPanelImageVariants / mediaAssets / sceneVisuals
- ❌ settings（含 LLM API key — 避免明文洩漏到雲端硬碟）
- ❌ Zustand persist（偏好設定、prompts — 走 localStorage，不在跨機備份範圍）

**無痕模式限制：**
- IndexedDB 在無痕模式關閉時會被清除（含 `appMeta` 中的資料夾 handle）。Modal 內已加提示，使用者需在關閉前手動「📤 匯出全部」。

**檔案：**
- `src/lib/backup.ts` — snapshot 序列化/反序列化
- `src/lib/fs-sync.ts` — File System Access 包裝 + handle 持久化
- `src/lib/auto-sync.ts` — store 訂閱 + debounced push
- `src/components/BackupModal.tsx` — Toolbar 整合 UI

---

## IndexedDB 資料關聯

所有子資料以書本 ID 為根鍵；目前型別中有些欄位命名為 `projectId`，Wiki 使用 `bookId`，語意上都指向 `Project.id`：

```
books
  └── id / bookId / projectId
        ├── chapters[]        → 05-versions 版本資料掛載於此
        ├── characters[]
        ├── wikiPages[] / wikiLog[]
        ├── comics[] / comicPanels[] / comicPanelImageVariants[]
        ├── mediaAssets[] / sceneVisuals[]
        └── outline data      → Project.worldSetting / mainPlot / chapterOutline
```
