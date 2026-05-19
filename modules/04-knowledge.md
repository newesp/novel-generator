> **Phase 2 LLM Wiki 已實作（2026-05-18）。** 設計與實作細節見：
> - 規格：`docs/superpowers/specs/2026-05-17-llm-wiki-design.md`
> - 實作計畫：`docs/superpowers/plans/2026-05-17-llm-wiki-phase-2.md`
>
> 本檔（modules/04）保留為高層模組描述。

# 模組 04｜知識管理系統（LLM Wiki + 全文檢索 + Graph 關係層）

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)（子系統 Phase：Wiki→2、FTS→2、Graph→2.5）

## 混合記憶架構

| 子系統 | 定位 | Phase |
|--------|------|-------|
| LLM-Wiki | 高階結構化知識（世界觀、角色、劇情線、年表等） | 2 |
| 全文檢索（FTS5） | 原始章節細節檢索（對話、細節描述、伏筆） | 2 |
| Graph 關係層 | 實體關係、因果鏈、時間線與約束推理 | 2.5 |

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

走 SQLite 內建 FTS5 + bigram tokenizer，毫秒級延遲，零新增依賴，與既有 `.db` 共存。原規劃的 Vector RAG（Ollama embedding + LanceDB）已放棄：Wiki 層已覆蓋概念導向檢索的核心需求，剩餘對白/伏筆/物品出處等定點查詢用 FTS5 更直接。未來真有 vector 需求改用 sqlite-vec，不引入 Ollama / LanceDB。

| 項目 | 說明 |
|------|------|
| 索引引擎 | SQLite FTS5（`tauri-plugin-sql`，桌面版；Phase 7 Web 版走 wa-sqlite + OPFS） |
| 分詞 | bigram tokenizer（適合中文，無需外部斷詞器） |
| 觸發時機 | 章節寫入 / 更新時同步重建該章索引 |
| 檢索時機 | 生成新章節前，Context Budget Manager 以關鍵字檢索相關段落 |

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
- 人物關係網視覺化（D3.js 或 React Flow 渲染）
- 基本多跳查詢（透過 JS 遍歷 JSON 圖）
- 提供 Critic Agent（Phase 4）結構化審核依據

---

## 完整運作流程

```
生成章節 → 用戶點擊"存入 Wiki"
    ↓
AI 提取章節關鍵資訊
    ↓
整理進 Wiki + 同步 FTS5 索引 + 更新 Graph JSON
    ↓
進行 Lint：找出矛盾、缺少交叉引用（Phase 2.5）
    ↓
下次生成時 → Context Budget Manager 自動載入相關 Wiki + FTS5 檢索結果
```
