# 開發日誌

## 2026-06-21 - Comic workspace resume

- Added per-book ComicModal workspace resume state so `轉漫畫` reopens the last edited chapter and panel.
- Persisted the active comic chapter/panel through panel selection, chapter switching, and panel edits using the existing `StorageAdapter.appMeta` store.
- Auto-scroll the ComicModal reference-image picker to the current chapter group when editing a panel, reducing manual scrolling in large reference libraries.

**Verification**
- `vitest run src/lib/comic/comic-workspace-state.test.ts` passed: 1 file, 3 tests.
- `tsc -b` passed.

## 2026-06-21 - Comic single-panel video export

- Fixed scene visual deletion so project-wide panel references are detected, users get a warning before deleting referenced scenes, and ComicModal scene lists refresh after deletion.
- Fixed the ComicModal reference-image section so chapter group labels and thumbnail alt text use 1-based chapter numbering.
- Fixed the ComicModal chapter selector display so chapter numbering starts at 1 instead of showing the internal 0-based order.
- Reordered the ComicModal right sidebar so `場景` sits next to `場景視覺設定`, with `參考圖` above them.
- Fixed storyboard normalization so generated panels always start with `durationSec: 0`; manual seconds now remain user-entered only.
- Added a panel-scoped `單格輸出 MP4` flow that validates only the selected comic panel and writes reusable TTS/segment metadata.
- Moved full-chapter video controls into a footer-level `整章影片設定` popup plus `整章輸出 MP4` action.
- Updated chapter video rendering to reuse matching panel segments instead of regenerating every TTS/audio segment on each full export.
- Added responsive popup/footer styling so global video settings do not crowd the selected-panel editor.

**Verification**
- `vitest run src/lib/scene-visuals.test.ts` passed: 1 file, 5 tests.
- `vitest run src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts` passed: 2 files, 20 tests.
- `vitest run src/lib/comic/video/video-renderer.test.ts` passed: 1 file, 3 tests.
- `tsc -b` passed.

## 2026-06-16 - Comic TTS video MVP

- Added panel-level TTS metadata, chapter video status metadata, and timing helpers where `durationSec: 0` uses measured TTS duration and manual estimates never truncate audio.
- Updated comic storyboard generation so `panels[].narration` is a chapter-complete spoken script distributed across ordered panels.
- Added Edge-TTS/ffprobe/ffmpeg Tauri command wrappers, concat-list generation, per-panel segment rendering orchestration, app-data media root resolution, and concat mp4 export.
- Added data URL image materialization before ffmpeg segment rendering, and constrained desktop file write/delete/render paths to the Tauri app-data media root.
- Added cleanup for panel-owned TTS and segment files when a panel is deleted, on rerender, and when regenerating a storyboard; existing chapter video metadata is reset when panels are replaced.
- Added ComicModal controls for narration editing, manual duration fallback, voice/padding/bin settings, and MP4 export.

**Verification**
- `vitest run src/lib/comic/video/timing.test.ts src/lib/comic/video/concat-list.test.ts src/lib/comic/video/panel-cleanup.test.ts src/lib/comic/video/video-renderer.test.ts src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts src/lib/comic/storage-types.test.ts src/lib/tauri-migrations.test.ts` passed: 8 files, 30 tests.
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- Browser visual QA opened ComicModal at `http://127.0.0.1:5173/`; empty/modal state remained usable, but selected-panel video controls could not be visually exercised because the local browser profile had no existing comic panels and no API key to generate a storyboard.

## 2026-06-16 - Comic TTS video implementation plan

- Added the implementation plan for the comic TTS video MVP: `docs/superpowers/plans/2026-06-16-comic-tts-video.md`.
- Planned the work across timing/types, storyboard narration updates, storage migration, Tauri Edge-TTS/ffmpeg commands, video rendering helpers, panel media cleanup, ComicModal UI, frontend visual QA, and final verification.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- Ran plan placeholder/self-review scan and `git diff --check`.

## 2026-06-14 - Comic TTS video MVP design

- Added the design spec for the Phase 6 comic narration video MVP: `docs/superpowers/specs/2026-06-14-comic-tts-video-design.md`.
- Scoped the first implementation to one chapter, pure narration, one Edge-TTS voice, per-panel TTS audio, ffmpeg panel segments, and concat-list mp4 export.
- Defined timing rules: `durationSec` can extend a panel but never truncates TTS; each panel duration is `max(audioDurationMs, durationSec * 1000) + panelPauseMs`.
- Updated the design after review: removed the single-filter-graph option, moved browser ffmpeg.wasm to future consideration, required panel deletion cleanup for related media files, and required `frontend-visual-qa` for future ComicModal UI work.
- Updated `skills/novel-to-storyboard` so generated narration is chapter-complete across ordered panels, with sentence density based on panel count instead of a fixed 1-3 sentence rule.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- Cross-checked against `package.json`, `src/types/index.ts`, `src/lib/storage/types.ts`, `src/lib/comic/storyboard*.ts`, `skills/novel-to-storyboard`, and current Tauri config.

## 2026-06-14 - Documentation refresh against code

- Updated README, module docs, specs, AI loading guides, and storyboard skill schema against current `package.json`, `src/types`, storage adapters, and Phase 6 comic implementation.
- Clarified that pure Markdown-only changes do not require `tsc -b`; code changes still use the existing focused TypeScript verification rule.
- Marked historical superpowers specs/plans as records rather than current-state docs, and corrected stale storage, backup, deployment, LLM provider, Graph, and comic image provider descriptions.

**Verification**
- Documentation-only change; skipped `tsc -b`.
- Ran Markdown/code consistency spot checks with `rg`.
- `git diff --check` passed with only existing line-ending normalization warnings.

## 2026-06-13 - Wiki toolbar fit fix

- Changed the Wiki toolbar from right-aligned flex buttons to a fixed six-column grid so every action remains visible on one row.
- Removed per-button minimum widths that caused the leftmost toolbar actions to be clipped in narrower panes.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Wiki operation log popup

- Removed the redundant Wiki label from the Wiki panel toolbar so actions fit on one row.
- Added a `📜 紀錄` toolbar button that opens operation history in a popup.
- Removed the always-visible operation history footer from the Wiki panel.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Wiki toolbar and editor layout polish

- Updated Wiki navigation/actions to use fixed-size icon-plus-text buttons with tooltip labels.
- Moved `改 slug` into the Wiki editor action bar and aligned it with `刪除` and `儲存`.
- Split the Wiki list/editor columns to 50/50 and added full-name tooltips for truncated list entries.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic upload and CJK search fixes

- Prevented manually uploaded comic panel images from appearing twice in the panel history.
- New comic panels now start with an empty negative prompt instead of inheriting the selected panel's text.
- Added a CJK `LIKE` fallback for desktop full-text search when FTS returns no results.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic image download feedback

- Added visible feedback when downloading comic panel images from the panel editor or preview modal.
- Download links now switch to a started state and the comic modal message explains that the browser download has begun.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic panel image upload

- Added an `上傳圖片` action next to `重生此格` in the comic panel editor.
- Uploaded panel images are saved as comic panel media assets, selected as the current panel image, and added to the panel history variants.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic panel title and drag affordance

- Moved the selected comic panel title editor into the panel header so inserted panels such as `#9 新增分鏡` can be renamed directly.
- Added a visible drag handle, dragging state, and insertion line feedback to the comic panel rail.

**Verification**
- `tsc -b` passed.

## 2026-06-13 - Comic panel drag and title editing

- Replaced native drag/drop in the comic panel rail with pointer-based reordering so dragging works inside the full-screen comic modal.
- Added a selected-panel title field so newly inserted panels such as `#9 新增分鏡` can be renamed.

**Verification**
- `tsc -b` passed.

## 2026-06-12 - Comic panel editing follow-up

- Restored the comic prompt expansion backdrop to the previous translucent overlay while keeping the editor surface opaque.
- Added an icon-only close button to the top-right of the full-screen comic modal.
- Fixed storyboard drag-and-drop reordering by moving drag handlers off the interactive button and onto a dedicated draggable panel row.

**Verification**
- `tsc -b` passed.

## 2026-06-12 - Comic panel editing controls

- Made the comic prompt expansion dialog fully opaque and added an icon-only close button in the upper-right corner while keeping the existing close action.
- Added dynamic storyboard panel insertion, per-panel deletion, and drag-and-drop reordering in the comic modal panel rail.
- Added storage support for deleting a single comic panel and kept remaining panel order synchronized after insert/delete/reorder.
- Added focused panel order helper coverage for reindex, move, and remove behavior.

**Verification**
- `tsc -b` passed.

## 2026-06-12 - Google Gemini image provider

- Added a dedicated Google Gemini Image provider for comic image generation using the Gemini `generateContent` image API.
- Added independent Google image provider settings in preferences, with default model `gemini-3.1-flash-image` and a button to copy the API key from the active Google LLM settings.
- Enabled Google Gemini Image reference image support with `maxReferenceImages` set to 14.
- Added focused provider tests for Gemini response normalization, request payload shape, and provider registry exposure.
- Removed unsupported REST `generationConfig` image fields from the Google Gemini image request payload.

## 2026-06-10 - Comic sidebar interaction fixes

- Applied the shared sidebar search to scene visual settings as well as characters, panel references, and scene pickers.
- Added image preview behavior for history, character, reference, and scene thumbnails.
- Made scene visual names editable while keeping stable slugs, and updated scene fields optimistically to avoid input cursor jumps.
- Added inline history feedback when trying to delete the current selected panel image variant.
- Added a multi-image scene reference grid with preview and per-image removal.
- Persist generated images from remote provider URLs as data URLs so expiring signed URLs do not break history thumbnails.

## 2026-06-10 - Comic modal mockup alignment

- Reworked the comic modal into a three-column workspace closer to `docs/comic-ui-static-mockup.html`: chapter/panel rail, selected panel editor, and shared selectors/sidebar.
- Replaced remaining visible `??` comic modal labels with Chinese titles and moved scene/character/reference controls into the sidebar.
- Backfilled current panel images into history variants when existing panels predate `ComicPanelImageVariant`, so the history grid is visible for previously generated panels.

## 2026-06-07 - Comic image history and full-screen workflow

- Added `ComicPanelImageVariant` storage so every generated panel image is kept as a selectable history variant while `ComicPanel.assetId` remains the current adopted image.
- Added Dexie / SQLite adapter support, Tauri migration `006_comic_panel_image_variants.sql`, backup import/export support, and focused tests for variant row conversion and migration registration.
- Updated the comic modal to full-screen mode with per-panel history thumbnails, set-current and delete-old-image controls, prompt expansion, shared selector search, and scene visual deletion.
- Regenerating storyboard now removes old panel variants and generated comic image assets; regenerating a panel keeps history and creates a new variant.
- Added the design spec `docs/superpowers/specs/2026-06-06-comic-image-history-design.md`.

## 2026-06-04 - Explicit comic panel reference picker

- Replaced the continuity-only interaction with a broader per-panel reference workflow while retaining the automatic previous-panel option.
- Added a reference image picker grouped by chapter and panel order. Explicit selections persist on each target panel and are sent as real provider image inputs.
- Reference bindings now merge character, scene, selected panel, and automatic previous-panel images in deterministic order with duplicate assets removed.

## 2026-06-03 - Phase 6 reference images, scene visuals, and continuity references

**Changed**
- Added project-level scene visual settings for comic generation. Panels can select a reusable scene, and scene prompt / negative prompt / reference images are composed into final image generation.
- Added provider reference-image plumbing. Character, scene, and continuity reference assets are resolved before image generation and skipped with warnings when the selected provider does not support image references.
- Added DeepInfra FLUX-2-pro image provider support with `input_image`, `input_image_2`, ... request fields.
- Added panel-level `useContinuityReference` so a panel can use the previous generated panel image; chapter first panels can fall back to the previous chapter's latest final comic panel.
- Added ComfyUI reference image node mapping.
- Added per-panel character multi-select dropdown in the comic UI so selected characters automatically contribute their visual prompts and uploaded reference images.

- Fixed generated panel prompt snapshots / warnings being overwritten after successful batch generation.
- Aligned Dexie and SQLite uniqueness for scene slugs.

**Verification**
- `tsc -b` passed.
- Focused Vitest coverage passed for providers, prompt composer, scene visuals, storage rows, and Tauri migration registration.

## 2026-05-29 — LLM Provider 設定切換 Hotfix

**修正**
- 修正「偏好設定 → LLM API」切換提供商時，Base URL / 模型名稱仍沿用最後一次儲存值的問題。
- 將 LLM provider 預設值集中到 `src/lib/llm-provider-defaults.ts`，切換 provider 時會套用該 provider 的預設顯示名稱、Base URL 與模型。
- API Key 目前仍維持單一 active LLM 設定共用；若未來要每個 provider 各自保存 key，需再升級為 provider profile 架構。

**驗證**
- `vitest run`：113 tests passed
- `tsc -b`：passed
- `eslint`：passed
- `vite build`：passed（保留既有 chunk size warning）

## 2026-05-29 — Phase 6.1 Visual Bible / Extras 規劃與 MVP 切片

> Phase 6.1 Visual Bible 設計已新增：`docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`。核心決策是角色與場景提示詞作為 Project 層級資產、跨章節引用，漫畫生成時保存 snapshot。

**新增 / 更新**
- 新增 Prompt Composer MVP：生圖前集中組合 final image prompt，並保存 `finalPromptSnapshot` / `finalNegativePromptSnapshot`。
- 新增龍套/群眾混合策略：Named characters 進 Visual Bible；跨多格 recurring groups 進 `extraGroupsJson`；一次性背景龍套留在 panel `visualPrompt`。
- Storyboard prompt schema 增加 `extraGroups`，避免把 100 個龍套塞進 active characters。
- ComicModal 每格可編輯 extras JSON，Final prompt 可展開檢查。

**驗證**
- `vitest run`：108 tests passed
- `tsc -b`：passed
- `vite build`：passed（保留既有 chunk size warning）

## 2026-05-28 — Phase 2: SQLite FTS5 全文檢索

> Phase 2.5 已標記為 **MVP Complete / Advanced polish remaining**。主幹可用，剩餘 LLM pick-pages、批次摘要重建排程、摘要品質趨勢報表、Graph 進階事件抽取與 Lint 整批 undo UI 作為後續 polish。
> Phase 6 漫畫圖片 MVP 設計已完成：`docs/superpowers/specs/2026-05-28-phase-6-comic-images-design.md`。範圍鎖定「選擇章節 → 可編輯分鏡 → 批次生成連續漫畫圖片」，本地優先 ComfyUI HTTP API，線上支援 OpenAI-compatible image provider。

**新增功能**
- Tauri SQLite adapter 掛上 optional `storage.search`，桌面版啟用 FTS5；Dexie/Web 版維持 undefined 並自動隱藏 UI
- 工具列新增「🔎 全文搜尋」modal，可搜尋章節與 Wiki，結果支援 snippet 高亮並可跳到章節或 Wiki 頁
- Wiki ingest create 會用 FTS5 從全書章節抓取最多 3 段相關片段，注入 `{{ftsExcerptsSection}}`，提升新 Wiki 頁跨章節脈絡
- Wiki 列表 summary 頁改依 `ch-N` 數字排序；超過 50 章自動分段，並提供「跳到章節」輸入
- 角色分頁新增「列表 / 關係圖」切換；關係圖從 `Character.relations` 推導角色連線，點節點可開啟角色編輯
- Wiki 分頁新增 `◎ Graph` 查詢 modal，可用角色/Wiki 名稱查 2-hop 關聯節點與路徑
- Wiki ingest 新增「必建角色 entity」三層防線：prompt 明示、程式預檢角色庫中本章出現但 Wiki 缺頁的角色、LLM plan 漏掉時自動補 create op，避免主角未進 Wiki 卻只建立路人 entity

**底層**
- 沿用 `003_fts.sql`：`chapters_fts` / `wiki_pages_fts` virtual table、trigram tokenizer、trigger 同步與 backfill
- 新增 `wiki-ingest-fts` helper 與單元測試
- 新增 `character-graph` helper 與單元測試；先用 SVG circular layout，完整 Graph JSON 留 Phase 2.5
- 新增 `knowledge-graph` helper 與單元測試：characters + wiki pages → serializable JSON graph，支援 label lookup 與 multi-hop neighborhood
- 新增 `wiki-character-entities` helper 與單元測試，將角色庫與 Wiki entity 存在性檢查從 LLM prompt 中抽成 deterministic guard

**驗證**
- `vitest run`：88 tests passed
- `tsc -b`：passed
- `vite build`：passed（仍有既有 chunk size warning）
- 針對新增 FTS 檔案執行 ESLint：passed；全專案 ESLint 仍受既有檔案與 `src-tauri/target` 產物影響

---

## 2026-05-19 — Phase 2.5 Part 1: 一致性 Lint

完整實作 Phase 2.5 #3（spec：`docs/superpowers/specs/2026-05-19-consistency-lint-design.md`，經 codex review 後修訂；plan：`docs/superpowers/plans/2026-05-19-consistency-lint.md`，16 個 task）。

**新增功能**
- Wiki 分頁加「🔍 執行 Lint」按鈕；專用 LintReportModal 進度列 + 報告版合一
- 6 個 check（可逐一在偏好設定勾選）：
  - ① Broken link — structural，AutoFix 一鍵移除 broken ref
  - ② 孤頁 — structural，info-only（codex review 採納：不提供刪除）
  - ③ 別名重複 — structural error，純報告
  - ④ 未登錄角色 — **hybrid**（structural pre-filter 對話/稱呼語境 + 1 LLM call verify）
  - ⑤ Wiki 內部矛盾 — LLM batch per page type，輸入 `WikiLintDigest`（rule-based markdown parser）
  - ⑥ Wiki vs 章節 — LLM batch per character，aliases 集合搜尋章節
- LLM 修改建議：✏️ 修改 inline 展開「修改方向」textarea → ✨ 生成建議 → 兩欄純文字 diff preview → 套用
- 所有 fix（broken-link auto + LLM）都寫 `wiki_log`（`source='lint:<checkId>'`），與 wiki-ingest 補償模式一致；共用 `lintBatchId` 保留未來整批 undo 能力
- 取消功能：AbortSignal 一路傳到 fetch；中途取消後已完成 check 結果仍展示

**設定擴充**
- 偏好設定 → 📚 Wiki 設定 底部加 Lint 區段：6 checkbox + 4 LLM 上限數字輸入
- 偏好設定 → 📜 AI 提示詞 加 4 個 sub-tab（#9 Unrecorded / #10 矛盾 / #11 vs 章節 / #12 修改建議）
- `setLintPrefs` 用 deep merge 避免 nested `checks` 物件被覆蓋
- `persist.merge` 補齊舊使用者預設值

**Schema 變動**
- 零 SQLite / Dexie schema 變動（lint 結果不持久化、prefs 走 localStorage）
- `wiki_log` 沿用既有 schema，僅 `source` 欄位加 `lint:*` 前綴

**測試**
- 加 vitest + jsdom（前所未有的單元測試 infra）
- 21 個 unit test 全綠：digest.ts (8) + unrecorded pre-filter (7) + wiki-contradict JSON parser & batch (6)

**已知限制**
- 「維持現狀」session-only，重 lint 會再出現
- 孤頁不提供刪除（需從 wiki 編輯器手動刪）
- Lint 整批 undo 未實作（保留 wiki_log batch_id 共用設計，後續可補）
- `complete()` 加 AbortSignal 支援，但既有 wiki-ingest / chapter generation 未串接 cancel UI（僅 lint 用到）

---

## 2026-05-19 — LLM Wiki hotfix + 路線調整

**修補**
- `postToLLMWithRetry`：對 408/425/429/5xx 與 fetch 例外做 3 次指數退避（800/2400/6000ms），緩解 NVIDIA / xAI gateway 偶發 502/ECONNRESET 中斷 ingest 串行呼叫
- WikiPageEditor 重寫成絕對定位 flex 佈局，修「雙層 scrollbar」+ 加 ⛶ 全屏按鈕（同 OutlinePanel 款；ESC 收起）
- ChapterEditor 章節「📚 存入 Wiki」按鈕狀態調整：
  - 空白章節 disabled（tooltip 提示）
  - `synced` 後改顯示「🔄 重新存入 Wiki」並保留 enabled（重新合併變更）
  - `partial` 顯示「⚠️ (N)」，N 為當前 batch 失敗 op 數
- Plan prompt 注入 `chapterOrdinal` / `chapterSummarySlug`，修第 N 章摘要 slug 永遠生成 `ch-1` 的衝突；既有 ch-1 受影響使用者請重新點「🔄 重新存入 Wiki」

**路線調整**
- 正式放棄 Vector RAG（Ollama embedding + LanceDB）。理由：LLM Wiki 已覆蓋「概念導向檢索」主訴求；剩餘「找特定對話／伏筆／物品出處」用 SQLite FTS5 + 中文 bigram tokenizer 解掉 80%，零依賴、毫秒級、就在現有 .db。若未來真需要 vector 改用 sqlite-vec，不引入 Ollama / LanceDB。`roadmap.md` / `modules/04-knowledge.md` / `modules/07-context-budget.md` / `specs/tech-stack.md` / `README.md` / `docs/plan.md` 已同步更新

## 2026-05-18 — Phase 2 Part 1: LLM Wiki

完整實作 LLM 自管知識層（spec：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md`，經 4 輪 codex review；plan：`docs/superpowers/plans/2026-05-17-llm-wiki-phase-2.md`）。

**新增功能**
- 左側 📚 Wiki 分頁：5 種 page type（concept/entity/summary/compare/synthesis）、index、編輯、操作記錄
- 章節「📚 存入 Wiki」按鈕 + 5 種狀態徽章（unsynced/synced/stale/partial/partial_stale）
- Ingest pipeline：Plan + 校驗 + Apply + 補償寫入（無 transaction） + 一鍵還原
- Context Budget 整合：cheap relevance filter（2-4 字滑動窗 + 字頻 top 50）+ 預算截斷預警
- 偏好設定「📚 Wiki 設定」 + 4 個 wiki prompt templates 可編輯
- 跨平台 round-trip：backup schema v2（向後相容 v1）

**Schema 變更**
- SQLite: `002_wiki_tables.sql`（wiki_pages + wiki_log，含 batch_id、op_status、page_snapshot JSON）
- Dexie: v5（wikiPages / wikiLog object stores、chapters 多 `wikiSyncedHash` / `wikiSyncStatus`）

**已知限制 / 範圍**
- Pick-pages 兩段式查詢留 Phase 2.5（已有警告機制）
- Lint（矛盾 / 孤頁 / broken link）留 Phase 2.5
- Wiki 不自動寫入 characters 表，僅在 `unrecorded_characters` 提示
- Wiki 頁手動刪除不進 log（只有 ingest pipeline 的 delete op 才寫 log）

## 2026-05-17 Phase 5b — Tauri Windows 桌面版 + SQLite

把 React app 包成 Tauri 桌面殼，桌面版的儲存層改走原生 SQLite
（`tauri-plugin-sql` + `TauriSqliteAdapter`），徹底解決「無痕視窗 / 瀏覽器配額導致書本消失」的問題。
瀏覽器版同一份 codebase 不受影響（仍走 DexieAdapter）。

**新增：**
- `src-tauri/` Rust 殼（透過 `tauri init`）：tauri 2.x + tauri-plugin-sql + tauri-plugin-log
- `src-tauri/migrations/001_initial.sql`：6 個表（projects/chapters/versions/characters/
  app_meta + Phase 6 用的 media_assets 佔位），與 Dexie v4 schema 1:1 對齊
- `src/lib/platform.ts`：`isTauri()` 偵測（`window.__TAURI_INTERNALS__`）
- `src/lib/storage/sqlite-helpers.ts`：row↔entity 轉換 + JSON 序列化
- `src/lib/storage/tauri-sqlite-adapter.ts`：完整 `StorageAdapter` 實作

**串接：**
- `src/lib/storage/index.ts`：`pickAdapter()` → 桌面回 `tauriSqliteAdapter`、瀏覽器回 `dexieAdapter`
- `src/lib/fs-sync.ts`：`isFsAccessSupported()` 在 Tauri 環境一律回 false
  （桌面版資料即本機檔案，不需 File System Access 自動同步；改走手動 export/import）

**效能修正（途中踩雷）：**
- tauri-plugin-sql v2.x **沒有 transaction API**，每次 `execute()` 取獨立連線；
  搭配 SQLite 預設 `synchronous=FULL` + Windows Defender 掃描 `%AppData%` → 每個 op ~5s、
  replaceAll 卡 60s+ 報「undefined」。
- 修法：`getDb()` 啟動時設 `PRAGMA journal_mode=WAL` + `synchronous=NORMAL`，per-op 降到 <50ms；
  拿掉 replaceAll 內無作用的 BEGIN/COMMIT（接受非 atomic，使用者按下「清空覆蓋」即已確認）。

**跨平台搬遷：** 沿用 5a 的 `backup.ts`：使用者手動 export JSON → 另一平台 import。
驗證：瀏覽器→桌面→桌面 export → JSON bit-perfect 與原始相同（所有 id/內容/順序逐欄一致）。

**指令：**
- `npm run tauri dev` — 桌面開發
- `npm run tauri build` — 產出 Windows MSI 安裝包（`src-tauri/target/release/bundle/msi/`）

**未含：**
- macOS / Linux 打包（YAGNI，之後再加）
- Code signing（首次安裝會跳「Windows 已保護您的電腦」，按「其他資訊→仍要執行」即可）
- 自動 IndexedDB→SQLite 遷移（走手動 export/import）
- 桌面版自動排程 snapshot

---

## 2026-05-15 Phase 5a — StorageAdapter 抽象層

把 Dexie 包進 `StorageAdapter` interface，UI / stores / lib 都改走 `src/lib/storage`
singleton，不再直接 import `db`。功能完全不變，但為 Phase 5b（Tauri + SQLite）
鋪好換實作的路；同時保留未來 Web 回部署（Phase 7，wa-sqlite + OPFS）的彈性。

**新增：**
- `src/lib/storage/types.ts`：`StorageAdapter` interface 與子 store 介面
- `src/lib/storage/dexie-adapter.ts`：Dexie 實作（唯一 import `./db` 的業務檔）
- `src/lib/storage/index.ts`：平台偵測（Phase 5b 接 `window.__TAURI__`）+ `storage` singleton

**遷移：**
- `src/stores/projectStore.ts`、`src/lib/backup.ts`、`src/lib/fs-sync.ts`、
  `src/components/home/HomePage.tsx`：全部改走 `storage.*`
- `src/lib/db-maintenance.ts`：業務邏輯改走 adapter；仍保留 `import db` 以將 Dexie 實例
  掛到 `window.dbDebug.db` 供 dev console 直接戳

**規劃文件：**
- `docs/superpowers/specs/2026-05-15-tauri-sqlite-migration-design.md`：Phase 5 完整設計
- `docs/superpowers/plans/2026-05-15-phase-5a-storage-adapter.md`：本次 implementation plan
- `specs/roadmap.md`：新增 Phase 5/6/7 規劃

---

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
## 2026-05-28 - Context Budget: Wiki summaries

- 章節生成現在會從 Wiki `summary/ch-N` 自動組出 `olderChapterSummary`：近期摘要保留、遠期摘要依本章標題/要點/節拍/角色做輕量相關性挑選。
- 既有「參考章節」仍是最高優先；若已載入參考章節全文，就不再重複塞同章摘要；若參考章節沒有正文，則以對應 Wiki 摘要補位。
## 2026-05-28 - Phase 2.5 Context / Wiki / Graph MVP

- Context Budget 新增 deterministic pick-pages：大型 Wiki 超出預算時會改用相關頁 + 近期 summary 的降級策略；設定中的 pick-pages 開關已可用。
- Wiki 新增「問 Wiki」入口：依問題挑選相關 Wiki pages，使用既有 `wikiQueryAnswerTemplate` 呼叫 LLM 回答並標註來源。
- Wiki 新增「摘要品質檢查」入口：檢查缺失、過短、標題不一致、缺少故事訊號的 `summary/ch-N`，可直接重建並更新 Wiki summary page / 寫入 `wiki_log`。
- Knowledge Graph 新增 `event_sequence` / `causal_hint` / `timeline_reference` 邊，先用 summary 章序與因果關鍵詞建立時間線與因果 MVP。
