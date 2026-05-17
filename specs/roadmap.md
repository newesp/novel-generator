# 規格｜開發階段規劃

---

## Phase 1 — 能跑的最小版本（✅ 已完成，2026-05-10）
> 目標：可以完整生成一本小說，哪怕品質普通

1. ✅ 書本管理（CRUD、首頁書本列表）→ 00-book
2. ✅ 單一 LLM provider（先支援自定義 API）→ 08-llm-adapter
3. ✅ 大綱生成 + 用戶編輯 → 01-outline
4. ✅ 角色系統 CRUD → 02-characters
5. ✅ 章節續寫（單 Agent，Writer 直接生成）→ 03-chapters
6. ✅ Context Budget Manager 基礎版（固定比例分配）→ 07-context-budget
7. ✅ IndexedDB 存儲 + 章節版本管理（3 版 + 釘選）→ 05-versions

---

## Phase 2 — 記憶與一致性（⚠️ 部分完成）

1. ❌ LLM Wiki 完整功能（存入 + 未存入提醒機制）→ 04-knowledge
2. ❌ Vector RAG（Ollama embedding + LanceDB）→ 04-knowledge
3. ❌ 角色關係圖視覺化（JSON 圖模式）→ 02-characters（角色弧線欄位 ✅ 已加，圖視覺化未做）
4. ✅ 多 LLM provider 支援（Google Gemini / Grok / 自定義 OpenAI-compatible）→ 08-llm-adapter

---

## Phase 2.5 — 結構強化（❌ 未開始）

1. ❌ Graph 關係層（JSON 圖完整功能：多跳查詢、事件因果）→ 04-knowledge
2. ❌ Context Budget Manager 動態版（摘要壓縮、RAG 整合）→ 07-context-budget
3. ❌ 一致性 Lint（矛盾偵測、交叉引用檢查）→ 04-knowledge

---

## Phase 3 — 輸出與體驗（❌ 未開始）

1. ❌ 導出功能（.txt / .html / .epub）→ specs/output-formats
2. ❌ 內容潤色器 → 06-polish
3. ⚠️ UI 美化與使用體驗優化（持續進行，基礎樣式已完成）

---

## Phase 4 — 選做功能（❌ 未開始）

1. ❌ Multi-Agent 協作引擎（Planner / Writer / Critic / Editor）→ 09-multi-agent
2. ❌ 多媒體生成（封面圖、語音朗讀、漫畫分鏡）→ 10-multimedia

---

## Phase 5 — 桌面化與儲存重構（✅ 已完成，2026-05）

> 目標：解決瀏覽器儲存的天生限制（無痕模式清資料、配額上限、無法存大量 binary），同時為 Phase 6 影片功能鋪路。
> **核心原則：先做抽象、後做平台實作。確保未來仍可回頭部署 Web 版。**

### 背景

純瀏覽器環境下，IndexedDB / OPFS / localStorage 在無痕模式關閉後**全部會被清空**，「換 SQLite (WASM)」也救不了，因為 WASM SQLite 仍然要靠 IndexedDB 或 OPFS 持久化。真正能徹底解決的方向只有：
- **包成桌面 App（Tauri）** — 跳出瀏覽器沙盒，用真正的 SQLite + 本機檔案
- 或加雲端後端（違反「本機優先」定位，暫不採用）

### 架構：Adapter 抽象層

```
React UI（不動）
      ↓ 只依賴抽象介面
StorageAdapter / MediaAdapter (interface)
      ↓
┌─ TauriSqliteAdapter（桌面）─┐    ┌─ WebAdapter（瀏覽器備援）─┐
│ - SQLite (native)           │    │ - wa-sqlite + OPFS         │
│ - 本機檔案系統               │    │ - IndexedDB Blob / OPFS    │
│ - ffmpeg sidecar            │    │ - ffmpeg.wasm（功能降級）   │
└─────────────────────────────┘    └────────────────────────────┘
```

**UI / business logic 不知道自己跑在哪個平台。**

### 任務

1. ✅ **設計 `StorageAdapter` interface** — `src/lib/storage/types.ts`（Phase 5a）
2. ✅ **加 Tauri shell** — `src-tauri/`，React + Vite UI 不動
3. ✅ **`TauriSqliteAdapter`** — `src/lib/storage/tauri-sqlite-adapter.ts`；DB 位於 `%AppData%\com.novelgenerator.app\novel-generator.db`
4. ⚠️ **資料遷移**：採手動方案（瀏覽器版匯出 JSON → 桌面版匯入），未做自動偵測 IndexedDB；跨平台 round-trip 已驗證 bit-perfect
5. ✅ **媒體儲存規則**：`media_assets` 表已建為 Phase 6 佔位；binary 存本機檔案系統原則已訂（Phase 6 實作）
6. ✅ **Windows 發布**：`npm run tauri build` → MSI（4.25 MB，`Novel Generator_0.1.0_x64_en-US.msi`）；macOS / Linux 之後再補

### SQLite schema 原則

- Schema 與 Dexie tables 對齊：`projects`、`chapters`、`versions`、`characters`、`settings`、`appMeta`、（Phase 6 增加）`media_assets`
- **大型 binary 不進 SQLite**（避免 DB 膨脹）— 改放檔案系統
- Schema 設計時考量「Web 版用 wa-sqlite 也能執行相同 SQL」

---

## Phase 6 — 漫畫 + AI 念稿 + 影片生成（⏳ 規劃中，前置：Phase 5 ✅）

> 目標：選擇章節 → 生成連續漫畫圖片 → 配 AI TTS → 合成影片（mp4）

### 任務

1. ❌ **`MediaAdapter` interface**（saveImage / saveAudio / renderVideo）
2. ❌ **漫畫分鏡 pipeline**：章節文本 → LLM 拆鏡 → 各鏡呼叫圖像生成 API → 存檔
3. ❌ **TTS pipeline**：章節旁白 / 對話拆段 → TTS API → 存檔（多角色不同音色可選）
4. ❌ **影片合成**（Tauri 桌面端優先）：
   - 桌面：呼叫 ffmpeg sidecar，組合圖片 + 音檔 + 轉場 → mp4
   - Web：可選用 ffmpeg.wasm（慢但可用）或顯示「請使用桌面版」
5. ❌ **UI 整合**：章節工具列「轉漫畫」「轉影片」按鈕；預覽 + 重新生成單一面板

> 前置工作：`skills/novel-to-storyboard/` 已建立（分鏡 skill 骨架：SKILL.md + openai.yaml + 參考文件），可作為 Phase 6 設計起點。

### 為何強烈傾向桌面

- 一章可能十幾~幾十張 PNG（每張 1-3 MB），全本累積會到 GB 級 — 瀏覽器配額卡死
- ffmpeg.wasm 跑影片合成慢且耗記憶體；Tauri 用 native ffmpeg 快 10x+
- 大檔案（>2GB mp4）走瀏覽器下載流程不可靠，本機檔案系統直接寫出最穩

---

## Phase 7 — Web 版回部署（⏳ 可選 / 未來，前置：Phase 5 ✅）

> Phase 5 抽象做對的話，這個 phase 就是「加實作」而不是「砍掉重寫」。

### 任務

1. **`WaSqliteAdapter`**（wa-sqlite + OPFS）— 與桌面共用 SQL schema
2. **`WebMediaAdapter`**（OPFS 存圖片 / ffmpeg.wasm 合影片，或介接後端 API）
3. **PWA 部署**（離線可用、安裝到桌面）
4. **降級提示**：影片功能在 Web 版若以 ffmpeg.wasm 實作則明確標示效能限制；或將「匯出影片」設為桌面專屬

### 預期限制（不是 bug，是平台天生差異）

- 無痕模式：OPFS 仍會被清（無解）— 提示使用者
- 大檔案下載：瀏覽器有限制 — 大型影片建議使用桌面版
- 多裝置同步：需要後端，不在此 phase 範圍
