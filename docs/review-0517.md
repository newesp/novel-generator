# Review: specs/2026-05-17-llm-wiki-design.md

整體評估：這份 `specs/2026-05-17-llm-wiki-design.md` 值得採納，方向比原本 `modules/04-knowledge.md` 明確很多，已經從概念推進到 schema、ingest pipeline、UI、驗收標準。

但不建議原封不動進實作。先修幾個架構風險會比較穩。

## 主要問題

### Undo 分批邏輯太脆弱

spec 用「同一秒內」判斷最近一次 ingest，這很容易誤傷：批次存入、多次快速點擊、重試剩餘操作都可能混在一起。

建議：`wiki_log` 新增 `batch_id` / `ingest_id`，一次 ingest 的所有 op 共用同一個 id。Undo、查看變更、重試剩餘都應該以 `batch_id` 為準。

### DB 寫入順序應該用 transaction

目前設計是先寫 `wiki_log` 再寫 `wiki_pages`，且允許 log 成功但 page 失敗。這會讓 UI、undo、bundle 都遇到「log 說有變更，但頁面不存在或沒更新」的半成功狀態。

建議：每個 op 用 transaction 包住 `wiki_pages + wiki_log`。如果 adapter 不支援 transaction，至少提供補償策略並標記 `status: failed`。

### 全載 Wiki 的 query 策略會很快失效

「全載 + 截斷」在小書可行，但長篇小說一旦 Wiki 超過幾十頁，會大量載入不相關 entity，反而擠掉本章真正需要的設定。

建議：Phase 2 可以不做完整 pick-pages，但至少做「cheap relevance filter」：根據本章標題、章節要點、出場角色、參考章節、slug/alias 命中先篩一輪，再套 type/recency。

### Token 估算偏危險

spec 用 `contextWindowTokens * budgetRatio * 4`，註解寫中文約 4 char/token。這對中文通常過度樂觀，容易讓 prompt 超 budget。

建議：Phase 2 先保守用 `1.2~1.5 char/token`，或直接做 `estimateTokens(text)` 抽象，之後替換成 tokenizer。

### 匯入順序描述自相矛盾

spec 前半說 `wiki_log` 先插入不重要，後半又說遵循「先 pages 後 log」。

建議：明確定義為 `pages -> log`，即使目前無 FK，也符合 UI 解析與未來 FK 擴充。

## 小但該修的點

- Plan JSON 範例含 `//` 註解，嚴格 JSON 不合法。建議移到 JSON 外。
- `wikiSyncedAt` 只看 `chapters.updatedAt > wikiSyncedAt`，但若 wiki 手動改壞、還原、或角色表更新，章節同步狀態可能失真。建議加 `wikiSourceHash` 或 `chapterContentHash`。
- `wiki_log` 只存 before/after content，沒有 before/after metadata 欄位；若 metadata 解析規則變更，undo 可能不完整。可以存 page snapshot JSON。
- `description` 用第一段前 60 字生成不一定適合 index。更好是讓 apply 輸出 `description`，失敗時才 fallback。
- `unrecorded_characters` 只有名字陣列，建議附 `evidence/sourceExcerpt`，避免誤建角色。

## 建議的修正版方向

把 Phase 2 scope 收斂成：

1. `wiki_pages`
2. `wiki_log`，新增 `batch_id`、`op_status`、`page_snapshot_before`、`page_snapshot_after`
3. 手動 ingest
4. cheap relevance wiki loader
5. `wikiSyncedAt + chapterContentHash`
6. Wiki UI + undo
7. Bundle 匯出/匯入
8. prompt debug 可驗證

把這些留到 Phase 2.5：

- 完整 pick-pages
- Lint
- FTS5
- Graph
- 直接問 Wiki
- log 歸檔

## 結論

這份 spec 是好的，可以作為 LLM Wiki Phase 2 的主設計稿；但在進實作前，建議先修「undo batch id」、「transaction」、「cheap relevance filter」這些點。

這幾個補上後，它就會從漂亮草案變成相當能落地的工程規格。
