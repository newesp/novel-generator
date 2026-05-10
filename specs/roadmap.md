# 規格｜開發階段規劃

---

## Phase 1 — 能跑的最小版本
> 目標：可以完整生成一本小說，哪怕品質普通

1. 書本管理（CRUD、首頁書本列表）→ 00-book
2. 單一 LLM provider（先支援自定義 API）→ 08-llm-adapter
3. 大綱生成 + 用戶編輯 → 01-outline
4. 角色系統 CRUD → 02-characters
5. 章節續寫（單 Agent，Writer 直接生成）→ 03-chapters
6. Context Budget Manager 基礎版（固定比例分配）→ 07-context-budget
7. IndexedDB 存儲 + 章節版本管理（3 版 + 釘選）→ 05-versions

---

## Phase 2 — 記憶與一致性

1. LLM Wiki 完整功能（存入 + 未存入提醒機制）→ 04-knowledge
2. Vector RAG（Ollama embedding + LanceDB）→ 04-knowledge
3. 角色關係圖（JSON 圖模式）→ 02-characters
4. 多 LLM provider 支援（Ollama、Google、Grok 等）→ 08-llm-adapter

---

## Phase 2.5 — 結構強化

1. Graph 關係層（JSON 圖完整功能：多跳查詢、事件因果）→ 04-knowledge
2. Context Budget Manager 動態版（摘要壓縮、RAG 整合）→ 07-context-budget
3. 一致性 Lint（矛盾偵測、交叉引用檢查）→ 04-knowledge

---

## Phase 3 — 輸出與體驗

1. 導出功能（.txt / .html / .epub）→ specs/output-formats
2. 內容潤色器 → 06-polish
3. UI 美化與使用體驗優化

---

## Phase 4 — 選做功能

16. Multi-Agent 協作引擎（Planner / Writer / Critic / Editor）→ 09-multi-agent
17. 多媒體生成（封面圖、語音朗讀、漫畫分鏡）→ 10-multimedia
