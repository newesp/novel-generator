> **已實作：**
> - Phase 2 LLM Wiki（2026-05-18）— 規格 `docs/superpowers/specs/2026-05-17-llm-wiki-design.md`、計畫 `docs/superpowers/plans/2026-05-17-llm-wiki-phase-2.md`
> - Phase 2 FTS5 全文檢索（2026-05-28）— 規格 `docs/superpowers/specs/2026-05-26-fts5-search-design.md`、計畫 `docs/superpowers/plans/2026-05-26-fts5-search.md`
> - Phase 2.5 #3 一致性 Lint（2026-05-19）— 規格 `docs/superpowers/specs/2026-05-19-consistency-lint-design.md`、計畫 `docs/superpowers/plans/2026-05-19-consistency-lint.md`
> - Phase 2.5 Graph JSON 基礎層（2026-05-28）— `src/lib/knowledge-graph.ts`，含 2-hop 查詢 UI；事件因果待補
>
> 本檔（modules/04）保留為高層模組描述。

# 模組 04｜知識管理系統（LLM Wiki + 全文檢索 + Graph 關係層）

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)（子系統 Phase：Wiki→2、FTS→2、Graph→2.5）

## 混合記憶架構

| 子系統 | 定位 | Phase |
|--------|------|-------|
| LLM-Wiki | 高階結構化知識（世界觀、角色、劇情線、年表等） | 2 |
| 全文檢索（FTS5） | 原始章節細節檢索（對話、細節描述、伏筆） | 2 |
| Graph 關係層 | 實體關係、因果鏈、時間線與約束推理 | 2.5（角色關係圖 MVP 已先完成） |

---

## LLM Wiki

**Wiki 內容結構：**

| 類別 | 內容 |
|------|------|
| 世界觀 | 設定、地域、技術、規則 |
| 角色庫 | 所有角色的詳細資訊 |
| 劇情線 | 主線/支線任務進展 |
| 物品/勢力 | 重要物品、組織、勢力 |
| 年表 | 時間線、重要事件 |

**UI 設計：**
- 每個章節旁邊有「存入 Wiki」按鈕
- 獨立的 Wiki 面板，可查看/編輯已存儲的知識
- 生成新章節時，自動載入 Wiki 中的相關內容到上下文

**未存入 Wiki 提醒機制：**
- 章節列表中，未存入的章節顯示橘色警示標記 `⚠️ 未存入 Wiki`
- 頂部通知列提示：`您有 N 個章節尚未存入 Wiki，建議存入以確保生成一致性。[前往檢視]`
- 點擊「導出」或「生成新章節」前，若有未存入章節，彈出確認提示
- 存入狀態欄位：`wikiSyncedAt: timestamp | null`（存於 IndexedDB 章節資料）

---

## 全文檢索（SQLite FTS5）

走 SQLite 內建 FTS5 + trigram tokenizer，毫秒級延遲，零新增依賴，與既有 `.db` 共存。原規劃的 Vector RAG（Ollama embedding + LanceDB）已放棄：Wiki 層已覆蓋概念導向檢索的核心需求，剩餘對白/伏筆/物品出處等定點查詢用 FTS5 更直接。未來真有 vector 需求改用 sqlite-vec，不引入 Ollama / LanceDB。

| 項目 | 說明 |
|------|------|
| 索引引擎 | SQLite FTS5（`tauri-plugin-sql`，桌面版；Phase 7 Web 版走 wa-sqlite + OPFS） |
| 分詞 | trigram tokenizer（適合中文，無需外部斷詞器） |
| 觸發時機 | `chapters` / `wiki_pages` 寫入、更新、刪除時由 SQLite trigger 同步索引 |
| 檢索時機 | 工具列全域搜尋；Wiki ingest create 時補全書相關章節片段 |

---

## Graph 關係層（Phase 2.5）

採用 JSON 圖結構存於 IndexedDB，完全在瀏覽器端運行，不依賴圖資料庫伺服器。

**資料結構：**

```json
{
  "entities": {
    "char_001": { "name": "李明", "type": "character" }
  },
  "relations": [
    { "from": "char_001", "to": "char_002", "type": "師徒", "since": "ch3" }
  ],
  "events": [
    { "id": "evt_001", "chapter": 5, "cause": "evt_000", "effect": "evt_002" }
  ]
}
```

**核心功能：**
- 人物關係網視覺化 MVP 已在角色分頁完成：從 `Character.relations` 推導角色連線，以 SVG circular layout 顯示；完整 Graph JSON 來源待本節後續實作
- 基本多跳查詢（✅ `knowledge-graph.ts`：characters + wiki pages → serializable graph；Wiki 分頁 `◎ Graph` 可查 2-hop neighborhood）
- 提供 Critic Agent（Phase 4）結構化審核依據

---

## 一致性 Lint（Phase 2.5 #3，已實作 2026-05-19）

7 個檢查項，可在偏好設定逐一勾選：

| # | Check | 類型 | 偵測內容 | Fix |
|---|-------|------|----------|-----|
| ① | broken-link | structural | `relatedSlugs` 指向不存在頁 | 一鍵移除 ref |
| ② | orphan | structural (info) | 未被任何頁 / 章節引用的孤頁 | 無（人工） |
| ③ | alias-dup | structural | 多頁共用 alias / title（過濾「(無)」佔位符） | 無（人工） |
| ④ | summary-mismatch | structural | `summary/ch-N` title 與 chapter[N-1].title 不一致或孤兒 | LLM 重寫 |
| ⑤ | unrecorded | hybrid | 章節提及但 wiki/characters 未登錄的人名（anchor-based pre-filter + 1 LLM verify call） | LLM 建議建頁 |
| ⑥ | wiki-contradict | LLM batch | 同 type wiki 頁互相矛盾（每 type 1 call，用 `WikiLintDigest`） | LLM 改寫 |
| ⑦ | wiki-vs-chapter | LLM batch | wiki 角色設定與章節敘述事實衝突（每角色 1 call、aliases 集合搜尋） | LLM 改寫 |

**特點：**
- 手動觸發（Wiki 分頁「🔍 執行 Lint」按鈕，不打擾寫作）
- 結果不持久化（modal 關掉就丟）；「維持現狀」session-only
- 所有 fix 走 `wiki_log`（`source='lint:<checkId>'`），保留未來整批 undo
- LLM 修改走 ✏️ 修改 textarea 可輸入方向 → ✨ 生成建議 → 兩欄純文字 diff preview → 套用同步 title/aliases/relatedSlugs metadata
- 預估成本 ≤15 LLM calls / 整本書

## 完整運作流程

```
生成章節 → 用戶點擊"存入 Wiki"
    ↓
AI 提取章節關鍵資訊
    ↓
整理進 Wiki + 同步 FTS5 索引 + 更新 Graph JSON
    ↓
進行 Lint：找出矛盾、缺少交叉引用（Phase 2.5 ✅）
    ↓
下次生成時 → Context Budget Manager 自動載入相關 Wiki + FTS5 檢索結果
```
