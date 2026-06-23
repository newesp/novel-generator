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

## Phase 2 — 記憶與一致性（✅ MVP 完成：Wiki ✅、全文檢索 ✅、角色關係圖 ✅）

1. ✅ LLM Wiki 完整功能（2026-05-18）→ `docs/superpowers/specs/2026-05-17-llm-wiki-design.md`
2. ✅ 全文檢索（SQLite FTS5 + trigram tokenizer，2026-05-28）→ `docs/superpowers/specs/2026-05-26-fts5-search-design.md`
3. ✅ 角色關係圖視覺化 MVP（2026-05-28，從 Character.relations 推導）→ 02-characters；Wiki 面板另有 characters + wiki pages 的 Graph 查詢
4. ✅ 多 LLM provider 支援（Google Gemini / Grok / 自定義 OpenAI-compatible）→ 08-llm-adapter

---

## Phase 2.5 — 結構強化（✅ MVP Complete / Advanced polish remaining）

1. ✅ Graph 關係層 MVP（JSON 圖基礎 + 2-hop 查詢 ✅；事件因果 / 時間線 MVP ✅）→ 04-knowledge
   - ⏳ Advanced polish：進階事件抽取、因果推理強化、時間線視覺化深化
2. ✅ Context Budget Manager 動態版 MVP（Wiki 章節摘要注入 ✅；deterministic pick-pages ✅；摘要品質/重建 ✅）→ 07-context-budget
   - ✅ 2026-05-28：章節生成會從 Wiki `summary/ch-N` 組出 `olderChapterSummary`
   - ✅ 參考章節優先：已有全文時不重複塞同章摘要；無正文時用 Wiki summary 補位
   - ✅ 2026-05-28：大型 Wiki 以 deterministic pick-pages 降級；Wiki Query UI 可直接問 Wiki
   - ⏳ 待補：LLM pick-pages、批次摘要重建排程、摘要品質趨勢報表
3. ✅ 一致性 Lint（2026-05-19）→ `docs/superpowers/specs/2026-05-19-consistency-lint-design.md`
   - 7 個 check：broken-link / orphan / alias-dup / summary-mismatch / unrecorded（hybrid） / wiki-contradict（LLM batch） / wiki-vs-chapter（LLM batch）
   - 所有 fix 走 `wiki_log` 補償，保留未來整批 undo 能力
   - LLM 修改建議 preview + 兩欄純文字 diff + 套用同步 metadata
4. ✅ Wiki 存在完整性防線（2026-05-28）
   - related refs sanitize、刪除 cascade、slug rename/canonicalize
   - Wiki ingest 必建角色 entity guard：角色庫已有且本章出現但 Wiki 缺頁時，prompt 注入候選並在 LLM plan 漏掉時自動補 create op

**Advanced polish remaining**
- LLM pick-pages
- 批次摘要重建排程
- 摘要品質趨勢報表
- Graph 進階事件抽取 / 因果推理深化
- Lint 整批 undo UI

---

## Phase 3 — 輸出與體驗（❌ 未開始）

1. ❌ 導出功能（.txt / .html / .epub）→ specs/output-formats
2. ❌ 內容潤色器 → 06-polish
3. ⚠️ UI 美化與使用體驗優化（持續進行，基礎樣式已完成）

---

## Phase 4 — 選做功能（❌ 未開始；部分多媒體能力已提前併入 Phase 6）

1. ❌ Multi-Agent 協作引擎（Planner / Writer / Critic / Editor）→ 09-multi-agent
2. ❌ 封面圖、語音朗讀、影片合成 → 10-multimedia

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
StorageAdapter（已實作）/ MediaAdapter（後續大量 binary polish）
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
5. ✅ **媒體儲存規則**：`media_assets`、`scene_visuals`、`comic_panel_image_variants` 等 metadata 表已建；大型 binary 移往本機檔案系統仍屬後續 polish
6. ✅ **Windows 發布**：`npm run tauri build` → MSI（4.25 MB，`Novel Generator_0.1.0_x64_en-US.msi`）；macOS / Linux 之後再補

### SQLite schema 原則

- Schema 與 Dexie tables 對齊：`projects`、`chapters`、`versions`、`characters`、`appMeta`、`wiki_pages`、`wiki_log`、`comics`、`comic_panels`、`comic_panel_image_variants`、`media_assets`、`scene_visuals`
- **大型 binary 不進 SQLite**（避免 DB 膨脹）— 改放檔案系統
- Schema 設計時考量「Web 版用 wa-sqlite 也能執行相同 SQL」

---

## Phase 6 — 漫畫圖片 / TTS / MP4（🟡 chapter workflow implemented；advanced polish remaining）

> 目標：選擇章節 → 生成可編輯分鏡 → 批次生成連續漫畫圖片。  
> 設計：`docs/superpowers/specs/2026-05-28-phase-6-comic-images-design.md`  
> Phase 6.1 Visual Bible：`docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`  
> 2026-06 已補上桌面版 Edge-TTS / ffmpeg MP4 輸出、單格 segment、整章影片與章節內影片庫。

### 任務

1. ✅ **Comic / Media 資料模型**：ChapterComic、ComicPanel、MediaAsset metadata；binary 不進 DB
2. ✅ **ImageGenerationProvider interface**：Provider Adapter First，pipeline 不直接依賴單一模型
3. ✅ **本地圖片模型**：ComfyUI HTTP API（workflow JSON + node mapping + submit/poll/download）
4. ✅ **線上圖片模型**：OpenAI-compatible image provider（endpoint/model/API key）
5. ✅ **漫畫分鏡 pipeline**：章節文本 + 角色卡 + Wiki → 可編輯 storyboard
6. ✅ **UI 整合**：章節工具列「轉漫畫」→ storyboard editor → batch progress → comic preview
7. ✅ **單格重生、手動上傳、圖片歷史與單圖下載**：panel variant history、目前圖片切換、目前圖片保護、上傳圖片與下載回饋已接入
8. 🟡 **Visual Bible / Prompt Composer**：角色/場景 reference、scene visuals、continuity reference、`extraGroupsJson`、final prompt snapshot 已接入；完整 Visual Bible 管理仍待 polish
9. ✅ **TTS / MP4 / SRT MVP（桌面）**：Edge-TTS、ffmpeg sidecar、單格 MP4 segment、整章 MP4 concat、旁掛 SRT 字幕、輸出驗證與章節內影片庫已接入

### 2026-06 Phase 6 progress

- Added `SceneVisual` as a project-level scene visual setting store for reusable locations.
- Added provider reference-image capability metadata and request plumbing.
- Added DeepInfra FLUX-2-pro provider for image generation with reference images.
- Added Google Gemini Image provider with separate image-generation settings.
- Added panel-level continuity reference control so a panel can use the previous panel image, including previous-chapter fallback for chapter-opening panels.
- Added an explicit per-panel reference image picker grouped by chapter and panel order. Selected generated panels are persisted on the target panel, merged with character/scene/automatic previous-panel references, and sent as real image inputs to reference-capable providers.
- Added panel insertion, deletion, pointer-based reordering, title editing, manual panel image upload, per-panel image history, and download feedback.
- Added panel narration / timing metadata, `MediaAsset(kind='tts_audio' | 'video' | 'subtitle')`, `ComicPanel.segmentAssetId`, `ChapterComic.videoAssetId`, and `ChapterComic.subtitleAssetId`.
- Added panel-scoped `單格輸出 MP4` and full-chapter `整章輸出 MP4`; full export reuses compatible panel segments where possible and writes a YouTube-ready sidecar SRT.
- Added full-chapter MP4 input validation with a dismissible top notice for missing panel images or narration.
- Added ComicModal chapter-scoped `影片庫` popup with open, reveal in folder, delete, and rerender actions for MP4 and SRT assets.
- Remaining advanced polish: richer Visual Bible management UI, provider-specific reference weighting controls, bulk image/video package download, full-book media library, video orphan cleanup, and Web ffmpeg.wasm fallback.

### Phase 6.1 Visual Bible 重點

- 角色與場景提示詞獨立成 Project 層級 Visual Bible entries，跨章節引用。
- 每次漫畫生成保存 visual bible / final prompt snapshot，舊漫畫可追蹤與重生。
- 龍套採混合策略：Named characters 進 Visual Bible；跨多格 recurring groups 進 `extraGroupsJson`；一次性背景龍套留在 panel `visualPrompt`。
- ComfyUI reference image / IP-Adapter workflow 先保留 capability 與資料流，MVP 可 prompt-only 降級。

> 前置工作：`skills/novel-to-storyboard/` 已建立（分鏡 skill 骨架：SKILL.md + openai.yaml + 參考文件），可作為 Phase 6 設計起點。

### 後續延伸

- 新增全書級「媒體庫」：跨章節彙整圖片、TTS、單格 MP4 segment、整章 MP4、SRT 字幕，支援搜尋 / 篩選、開啟 / 定位、刪除、孤兒檔清理與批次匯出。
- 進一步擴充 TTS pipeline：章節旁白 / 對話拆段、多角色音色、provider 切換與批次管理。
- Web 版影片合成以 ffmpeg.wasm 降級或提示使用桌面版。

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
