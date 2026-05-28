/**
 * 各種 AI 生成任務的 prompt 預設模板。
 * 使用者可在「偏好設定 → AI 提示詞」中編輯。
 *
 * 約定：
 *   - 所有 conditional 段落由 caller 預先組成完整字串（包含 header / 空行）
 *     再以 `{{xxxSection}}` 變數注入。模板本身**不做** if/else。
 *   - 一般欄位直接以 `{{var}}` 插入，未填則替換為空字串。
 */

// ─── #1. 章節骨架（AI 生成章節 — drafts） ───────────────────────────
export const DEFAULT_CHAPTER_DRAFTS_TEMPLATE = `{{taskIntro}}

## 世界觀
{{worldSetting}}

## 主線劇情
{{mainPlot}}{{charactersSection}}{{existingChaptersSection}}{{continuationRulesSection}}

# 輸出格式

請輸出 {{count}} 個章節，每個章節嚴格使用以下格式（不可省略標記）：

##CH_START##
TITLE: <章節標題（不要寫第N章，只寫標題）>
BEAT: <從以下選一個：{{beatList}}>
POINTS: <本章核心情節要點，2-4 句話，含主要事件、角色互動、章末懸念{{pointsExtraHint}}>
##CH_END##

直接輸出 {{count}} 段 ##CH_START##...##CH_END##，不要任何前言、編號或結尾總結。`;

// ─── #1.5 接續硬性規則（被插入到 #1 的 {{continuationRulesSection}}）──
export const DEFAULT_CHAPTER_CONTINUATION_RULES = `1. **不可重啟故事**：新章節必須直接延續「現有章節」最後一章的情節線、人物狀態與未解伏筆。不可寫「初次相遇」「故事開端」「主角第一次得知...」等開場式內容（這些已在前面章節發生）。
2. **不可重用「引入」節拍**：故事已經引入，後續章節節拍應從「衝突升級 / 中點轉折 / 高潮 / 結局 / 鋪墊/過渡」中挑選，依故事進程合理安排。
3. **必須使用既有角色名字**：章節要點中提到的人物必須是「已建立的角色」中列出的名字，**絕對不可自編新人物名稱**（例如不可把「咖啡館老闆」寫成不存在的「顧辰」，而應使用既有角色名單中的對應角色）。
4. **情節要承接上一章末尾**：新章節的開頭應該銜接上一章的結尾，可在 POINTS 開頭簡述「承接...」。`;

// ─── #2. 章節正文 ──────────────────────────────────────────────────
export const DEFAULT_CHAPTER_CONTENT_TEMPLATE = `## 背景資訊

### 世界觀
{{worldSetting}}{{mainPlotSection}}{{charactersSection}}{{wikiSection}}

## 本章要求
- 章節標題：{{chapterTitle}}
- 故事節拍：{{beat}}
- 章節要點：{{points}}
- 目標字數：{{targetWords}}{{referenceSection}}{{olderSummarySection}}{{adjustInstructionSection}}

---
請開始撰寫本章正文。要求：
1. 嚴格遵守上述「本章要求」{{adjustInstructionRule}}
2. 保持文風一致，與前文順暢銜接，不要複述前文
3. 直接從前文結尾處繼續創作
4. 直接輸出小說正文，不要加任何說明、標題或註解`;

// ─── #3. 重新生成章節要點 ──────────────────────────────────────────
export const DEFAULT_CHAPTER_POINTS_TEMPLATE = `你是中文小說的章節規劃師。請為以下章節重新撰寫「章節要點」——一段 2-4 句的核心情節摘要，作為後續 AI 生成本章正文的指引。

## 世界觀
{{worldSetting}}

## 主線劇情
{{mainPlot}}{{charactersSection}}

## 本章資訊
- 章節標題：{{chapterTitle}}
- 故事節拍：{{beat}}{{referenceSection}}{{currentPointsSection}}

# 撰寫要求

1. **2-4 句**，總長控制在 80-200 字之間
2. 必須包含：主要事件、角色互動（用既有角色名字）、章末懸念或情緒收束
3. 必須符合「故事節拍」的階段定位（例如「衝突升級」就要寫出張力提升、矛盾加深）
4. 若有參考章節，本章要承接其結尾或呼應其伏筆
5. 不要寫成大綱式條列，用流暢的中文敘述

# 輸出格式

只輸出要點本身，不要任何前言、標題、引號或結尾說明。`;

// ─── #4. 局部段落改寫（右鍵 → 調整內容） ───────────────────────────
export const DEFAULT_INLINE_ADJUST_TEMPLATE = `你是中文小說作者，需要重寫一段被選取的文字。

## 章節背景
- 標題：{{chapterTitle}}
- 節拍：{{beat}}
- 要點：{{points}}

## 上文（請保持銜接，不可改寫）
{{beforeContext}}

## 待重寫的段落（必須完全替換）
"""
{{selectedText}}
"""

## 下文（請保持銜接，不可改寫）
{{afterContext}}

## ⚠️ 用戶調整指令（最高優先級，必須遵守）
{{adjustInstruction}}

## 輸出要求
1. 僅輸出重寫後的內容，不加任何說明、引號、標題或前綴
2. 字數應與原段落相近（±30%）
3. 風格、人稱、時態必須與上下文一致
4. 結果與上文末句、下文首句必須能順暢銜接
5. 嚴格遵守「用戶調整指令」`;

// ─── #5. Wiki Ingest — Plan pass ─────────────────────────────────
export const DEFAULT_WIKI_INGEST_PLAN_TEMPLATE = `你是這本中文小說 Wiki 的維護者。請根據新加入的章節內容，提出 Wiki 更新計畫（**只輸出嚴格 JSON，不要 markdown fence、不要註解**）。

## 當前 Wiki 索引（{{indexCount}} 頁）
{{indexJson}}

## 已知角色（角色庫，**不要重複建立**）
{{knownCharactersList}}

## 本章資訊
- 序號：第 {{chapterOrdinal}} 章
- 標題：{{chapterTitle}}
- 章節摘要建議 slug：\`{{chapterSummarySlug}}\`（若要建 summary 頁，**必須**使用此 slug 以避免與其他章節衝突）

## 本章內容
{{chapterContent}}

## 輸出格式（嚴格 JSON）
{
  "operations": [
    {
      "action": "create",
      "type": "concept|entity|summary|compare|synthesis",
      "slug": "ascii-kebab-case",
      "title": "可中文",
      "aliases": ["別名1"],
      "description": "1 句 index 用描述（可選，缺則 fallback prose 開頭）",
      "reason": "為何要建這頁",
      "content_brief": "頁面內容 brief（給後續 Apply 用）"
    },
    {
      "action": "update",
      "type": "entity",
      "slug": "existing-slug",
      "reason": "為何要更新",
      "change_brief": "要怎麼改"
    }
  ],
  "log_entry": "ingest chapter=X pages_created=Y pages_updated=Z",
  "unrecorded_characters": [
    { "name": "王芳", "sourceExcerpt": "原文片段約 30-60 字" }
  ]
}

## 規則
1. **不要對已存在的 slug 做 create**（會自動降級為 update，但會浪費 token）。
2. **已知角色不代表已有 Wiki entity**：若角色庫已有角色、但「當前 Wiki 索引」沒有對應 entity，本章又出現足夠資訊，應建立 entity 頁；只有當 Wiki 索引已存在該 entity 時才用 update。
3. **不要把章節摘要做為 entity**；章節摘要請用 type=summary、slug = 上方「章節摘要建議 slug」（\`{{chapterSummarySlug}}\`）。**絕對不要把每章的 summary 都叫 \`ch-1\`**。
4. **章節摘要 (\`summary/{{chapterSummarySlug}}\`) 的 \`title\` 欄位必須完全等於本章 title（即「{{chapterTitle}}」），不要加「第 N 章：」「Chapter N -」「Ch.N」之類前綴**——之後章節改名重新 ingest 時 lint 才能正確對齊。description 與 content_brief 可自由發揮。
5. unrecorded_characters 是本章出現、但**不在已知角色清單也不在 wiki 中**的人物（不論 entity 是否要建頁）。
6. 若本章沒任何值得 ingest 的，operations 可以是空陣列；但 unrecorded_characters 仍可填。
`;

// ─── #6. Wiki Ingest — Apply create ─────────────────────────────
export const DEFAULT_WIKI_INGEST_CREATE_TEMPLATE = `根據以下資訊撰寫一頁完整的 Wiki markdown 頁面。

## 頁面類型 / slug
{{type}} / {{slug}}

## 顯示標題
{{title}}

## 別名
{{aliasesList}}

## 撰寫意圖（reason）
{{reason}}

## 內容 brief
{{contentBrief}}

## 本章節相關片段（資料來源）
{{chapterExcerpt}}
{{ftsExcerptsSection}}

## 輸出格式（嚴格遵守）

第一行 H1 為顯示標題；接著 \`> \` blockquote 含 Type/Aliases/Related（無 related 可省略 Related 整行）；Related 只能連到已存在或本次計畫會建立的 Wiki 頁，且連結格式用 \`../type/slug\`，不要加 \`.md\`；空一行後正文 ## 段落；最後 \`## 出處\` 段標註來源章節。範例：

\`\`\`markdown
# <顯示標題>

> **Type:** {{type}}
> **Aliases:** {{aliasesList}}
> **Related:** [其他頁](../entity/other)

## 概述

…正文…

## 出處

- 第 X 章「章節標題」
\`\`\`

只輸出 markdown 本身，不要任何前言或結尾說明。
`;

// ─── #7. Wiki Ingest — Apply update ─────────────────────────────
export const DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE = `根據新章節資訊，把現有 Wiki 頁面更新到「合併新資訊後」的完整版本。

## 頁面類型 / slug
{{type}} / {{slug}}

## 現有頁面全文
\`\`\`markdown
{{existingMarkdown}}
\`\`\`

## 本次更新理由
{{reason}}

## 改動 brief
{{changeBrief}}

## 本章節相關片段（資料來源）
{{chapterExcerpt}}

## 輸出要求
- 輸出**完整新版頁面 markdown**（不是 diff）
- 保留既有 H1 標題與整體結構，僅在必要處新增或修改段落
- 若 aliases / related 有變動，更新 blockquote 的對應行
- 保留 \`## 出處\` 區段並追加本章來源
- 只輸出 markdown 本身，不要任何前言或結尾說明
`;

// ─── #8. Wiki Query — Answer（Phase 2.5 預留；UI 入口此版未開）─────
export const DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE = `你是這本小說的 Wiki 助理。請根據以下 Wiki 頁面回答使用者的問題；引用時標註頁面 type/slug。若 Wiki 沒有相關內容，誠實說「Wiki 中無此資訊」。

## 使用者問題
{{question}}

## 相關 Wiki 頁面
{{pagesMarkdown}}
`;

// ─── #9. Lint — Unrecorded verify（Phase 2.5）─────────────────────
export const DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE = `你是小說的角色清點助手。下面是程式預先掃出的「可能未登錄角色」候選名單，連同章節節錄。

請判斷每個候選是否為「應該記錄」的角色（曾經有名有姓、有戲份或敘事相關）。普通虛詞、形容詞、地名、概念名請排除。

已登錄角色名：
{{knownNamesList}}

候選清單（JSON）：
{{candidatesJson}}

請只輸出嚴格 JSON：
{
  "newCharacters": [
    { "name": "<候選名>", "isMainEnough": true, "chapterRefs": ["<chapterId>"] }
  ],
  "rejected": ["<被排除的候選名>"]
}
`;

// ─── #10. Lint — Wiki 內部矛盾（Phase 2.5）──────────────────────────
export const DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE = `你是小說資料一致性檢查員。下面是同一類 wiki 頁的精簡 digest，請找出彼此衝突的事實（例如角色年齡 / 武器 / 能力、概念規則 / 限制、時間線等）。

Page type：{{pageType}}

頁面 digest（JSON array）：
{{digestsJson}}

請只輸出嚴格 JSON：
{
  "conflicts": [
    {
      "pages": ["<type/slug>", "<type/slug>"],
      "field": "<衝突欄位名，例：年齡 / 武器 / 規則>",
      "detail": "<具體說明 A 頁說 X、B 頁說 Y>"
    }
  ]
}

若沒有任何衝突，輸出 {"conflicts": []}。
`;

// ─── #11. Lint — Wiki vs 章節（Phase 2.5）───────────────────────────
export const DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE = `你是小說資料一致性檢查員。檢查 wiki 上的角色設定與小說章節敘述是否「在敘事事實上」衝突。

角色：{{characterName}}
別名集合：{{aliasesList}}

Wiki 全文：
{{wikiContent}}

相關章節節錄（JSON array，每筆含 chapterId 與 excerpt）：
{{chapterExcerptsJson}}

# 檢查範圍

**只看敘事事實衝突**，包括但不限於：
- 年齡、性別、外貌特徵（身高、髮色、傷痕）
- 能力 / 武器 / 修為等級 / 戰鬥風格
- 出身、身份、職業、所屬勢力
- 關係（父母、師徒、敵友、上下級）
- 傷勢、死亡、失蹤等狀態變更
- 角色在特定章節做了什麼、說了什麼立場

# 不要當衝突回報

下列情況**絕對不要**列為 conflict：

1. **Wiki Aliases / Type / Related 等 metadata 不檢查**。
   Aliases 是「列出所有可能的稱呼」，章節只用其中一部分稱呼是**正常**的，不是衝突。
   章節用了「艾莉亞長官」而 wiki Aliases 列了「艾莉亞、艾莉亞長官」→ **不是衝突**。

2. **Wiki 寫了 N 件事、章節只提到 M < N 件** — 章節本就無法窮舉所有設定，缺少不是矛盾。

3. **章節用代稱、Wiki 用本名**（或反之）→ 不是衝突，這是寫作風格。

4. **時間順序差異但無明確矛盾** — wiki 不一定按章節順序敘述。

5. **語氣 / 描述顆粒度差異** — 「精通劍術」vs「揮劍如風」是同義加強，不是衝突。

只有當 wiki 與章節**直接互斥**（「wiki 寫精通劍術，但第 5 章寫他從未握過劍」、「wiki 寫 25 歲，但第 3 章主角自稱三十五」這種）才算衝突。

# 輸出

只輸出嚴格 JSON：
{
  "conflicts": [
    {
      "field": "<衝突欄位名（年齡 / 武器 / 能力 / ...，不可為 Aliases / Type / Related）>",
      "wikiSays": "<wiki 的具體說法，含原文片段>",
      "chapterSays": "<章節的具體說法，含原文片段>",
      "chapterRefs": ["<chapterId>"]
    }
  ]
}

若沒有任何衝突，輸出 {"conflicts": []}。寧可漏報、不要誤報。
`;

// ─── #12. Lint — 修改建議（Phase 2.5）───────────────────────────────
export const DEFAULT_LINT_FIX_SUGGEST_TEMPLATE = `你是 wiki 維護助手。下面有一個一致性 issue，請修改原 wiki 頁 markdown 來解決。

Issue 標題：{{issueTitle}}
Issue 細節：{{issueDetail}}

使用者偏好的修改方向（可能為空，空則由你自行判斷）：
{{userDirection}}

原始 markdown：
---
{{originalMarkdown}}
---

請直接輸出修改後的完整 markdown（保留原檔結構：H1 標題、Aliases、Related blockquote、各 section）。不要包 \`\`\`markdown 圍欄，不要解釋。
`;

// ─── 預覽用的範例變數值（讓使用者看到代入後的長相）────────────────
export const PROMPT_TEMPLATE_SAMPLES: Record<string, Record<string, string>> = {
  chapterDraftsTemplate: {
    taskIntro: '你正在**為一本已開始的小說規劃後續章節**。現在故事已經寫到第 1 章，請接續規劃第 2 章到第 3 章（共 2 章新章節）。',
    worldSetting: '在一個咖啡香瀰漫的海濱小鎮「浮光鎮」，少數居民擁有與他人「心靈感應」的隱性能力...',
    mainPlot: '艾莉發現自己擁有心靈感應能力，並在咖啡館遇見能夠引導她的蘇沐陽。隨著兩人深入調查，逐漸揭開鎮上隱藏的真相...',
    charactersSection: '\n\n## 已建立的角色（**章節要點中只能使用以下角色名字，不可自行創造新名字**）\n- 艾莉 (女/22歲/人類)：性格內向但好奇，新搬到浮光鎮的書店店員\n- 蘇沐陽 (男/30歲/人類)：咖啡館老闆，沉穩寡言，似乎知道某些秘密\n- 林語桐 (女/25歲/人類)：艾莉的同事，活潑外向',
    existingChaptersSection: '\n\n## 現有章節（共 1 章，以下列出最後 1 章供參考；新章節必須延續這些章節的情節與伏筆）\n第 1 章：浮光鎮\n節拍：引入 (Inciting Incident)\n要點：艾莉初到浮光鎮，意外感應到陌生人的情緒...',
    continuationRulesSection: '\n\n# 接續規劃的硬性規則（必須遵守）\n\n1. **不可重啟故事**：新章節必須直接延續最後一章...\n2. **不可重用「引入」節拍**...\n3. **必須使用既有角色名字**...\n4. **情節要承接上一章末尾**...',
    count: '2',
    beatList: '衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡',
    pointsExtraHint: '；只能使用已建立的角色名字',
  },
  chapterContentTemplate: {
    worldSetting: '在一個咖啡香瀰漫的海濱小鎮「浮光鎮」...',
    mainPlotSection: '\n\n### 主線劇情\n艾莉發現自己擁有心靈感應能力，並在咖啡館遇見能夠引導她的蘇沐陽...',
    charactersSection: '\n\n### 主要角色\n- 艾莉 (女/22歲)：內向好奇的書店店員\n- 蘇沐陽 (男/30歲)：咖啡館老闆',
    chapterTitle: '咖啡香與書頁的微風',
    beat: '衝突升級 (Rising Action)',
    points: '艾莉走進蘇沐陽的咖啡館，意外感應到他壓抑的情緒。兩人初次對視時，蘇沐陽察覺艾莉的能力，神情瞬間變得警戒...',
    targetWords: '3000',
    referenceSection: '\n\n## 前文（參考章節：浮光鎮）\n艾莉拖著行李走過鎮上唯一的青石小街，海風帶來陣陣咖啡香...',
    olderSummarySection: '',
    adjustInstructionSection: '',
    adjustInstructionRule: '',
    wikiSection: '',
  },
  chapterPointsTemplate: {
    worldSetting: '在一個咖啡香瀰漫的海濱小鎮「浮光鎮」...',
    mainPlot: '艾莉發現自己擁有心靈感應能力...',
    charactersSection: '\n\n## 已建立的角色\n- 艾莉、蘇沐陽、林語桐',
    chapterTitle: '咖啡香與書頁的微風',
    beat: '衝突升級 (Rising Action)',
    referenceSection: '\n\n## 參考章節（浮光鎮）\n（前略...）\n艾莉望著海平面，第一次感受到那種不屬於自己的、淡淡的孤獨...',
    currentPointsSection: '\n\n## 目前的要點（僅供參考，請寫出更貼合節拍/參考章節的新版本）\n艾莉到咖啡館後遇見老闆。',
  },
  inlineAdjustTemplate: {
    chapterTitle: '咖啡香與書頁的微風',
    beat: '衝突升級 (Rising Action)',
    points: '艾莉走進蘇沐陽的咖啡館，意外感應到他壓抑的情緒...',
    beforeContext: '...艾莉推開咖啡館的木門，鈴鐺輕響。',
    selectedText: '蘇沐陽抬起頭，眼神平靜地看著她。',
    afterContext: '「歡迎光臨。」他說。',
    adjustInstruction: '加強蘇沐陽眼神中的警戒感與壓抑的情緒波動',
  },
};

// ─── 每個 template 的「可用變數說明」（用於 UI 提示）─────────────────
export const PROMPT_TEMPLATE_VARS: Record<string, { var: string; desc: string }[]> = {
  chapterDraftsTemplate: [
    { var: 'taskIntro', desc: '任務開場語（依「全新」/「接續」自動生成）' },
    { var: 'worldSetting', desc: '世界觀（來自大綱）' },
    { var: 'mainPlot', desc: '主線劇情（來自大綱）' },
    { var: 'charactersSection', desc: '角色清單區段（無角色則空）' },
    { var: 'existingChaptersSection', desc: '現有章節摘要區段（接續模式才有）' },
    { var: 'continuationRulesSection', desc: '接續硬性規則區段（接續模式才有，內容由下方「接續硬性規則」設定）' },
    { var: 'count', desc: '要生成的章節數' },
    { var: 'beatList', desc: 'BEAT 可選清單（接續模式排除「引入」）' },
    { var: 'pointsExtraHint', desc: '接續模式時的 POINTS 附加提示（如「只能使用既有角色名字」）' },
  ],
  chapterContinuationRules: [
    { var: '(無)', desc: '純文字內容，被嵌入 chapterDraftsTemplate 的接續規則區段' },
  ],
  chapterContentTemplate: [
    { var: 'worldSetting', desc: '世界觀' },
    { var: 'mainPlotSection', desc: '主線劇情區段（無則空）' },
    { var: 'charactersSection', desc: '角色清單區段' },
    { var: 'wikiSection', desc: 'Wiki 相關條目區段（Phase 2，若無 wiki 為空字串）' },
    { var: 'chapterTitle', desc: '本章標題' },
    { var: 'beat', desc: '故事節拍' },
    { var: 'points', desc: '章節要點' },
    { var: 'targetWords', desc: '目標字數（或「由你自行決定」）' },
    { var: 'referenceSection', desc: '參考章節區段（沒設參考章節則空）' },
    { var: 'olderSummarySection', desc: '更早章節摘要區段（由 Wiki summary/ch-N 產生，無可用摘要時為空）' },
    { var: 'adjustInstructionSection', desc: '額外調整指令區段（目前未從 UI 傳入）' },
    { var: 'adjustInstructionRule', desc: '若有調整指令，第 1 條規則會附加「與用戶調整指令」' },
  ],
  chapterPointsTemplate: [
    { var: 'worldSetting', desc: '世界觀' },
    { var: 'mainPlot', desc: '主線劇情' },
    { var: 'charactersSection', desc: '角色清單區段' },
    { var: 'chapterTitle', desc: '本章標題' },
    { var: 'beat', desc: '故事節拍' },
    { var: 'referenceSection', desc: '參考章節區段（取尾段 1500 字）' },
    { var: 'currentPointsSection', desc: '目前要點區段（提供 AI 知道目前的方向）' },
  ],
  inlineAdjustTemplate: [
    { var: 'chapterTitle', desc: '本章標題' },
    { var: 'beat', desc: '本章節拍' },
    { var: 'points', desc: '本章要點' },
    { var: 'beforeContext', desc: '選取段落的上文（window 或全章）' },
    { var: 'selectedText', desc: '被選取要重寫的段落' },
    { var: 'afterContext', desc: '選取段落的下文' },
    { var: 'adjustInstruction', desc: '使用者填寫的調整方向' },
  ],
  wikiIngestPlanTemplate: [
    { var: 'indexCount', desc: '當前 wiki 頁數' },
    { var: 'indexJson', desc: 'JSON 陣列：{type, slug, title, description, aliases}' },
    { var: 'knownCharactersList', desc: '角色庫的 name / aliases 清單' },
    { var: 'chapterTitle', desc: '本章標題' },
    { var: 'chapterContent', desc: '本章正文' },
    { var: 'chapterOrdinal', desc: '本章在書內的序號（1-based）' },
    { var: 'chapterSummarySlug', desc: '建議的章節摘要 slug，如 ch-2' },
  ],
  wikiIngestCreateTemplate: [
    { var: 'type', desc: '頁面類型' },
    { var: 'slug', desc: 'ASCII kebab-case' },
    { var: 'title', desc: '顯示標題' },
    { var: 'aliasesList', desc: '逗號分隔別名（可空）' },
    { var: 'reason', desc: '建立原因' },
    { var: 'contentBrief', desc: '內容 brief' },
    { var: 'chapterExcerpt', desc: '相關章節片段' },
    { var: 'ftsExcerptsSection', desc: 'FTS 抓到的全書相關段落（Tauri-only；無命中為空字串）' },
  ],
  wikiIngestUpdateTemplate: [
    { var: 'type', desc: '頁面類型' },
    { var: 'slug', desc: 'ASCII kebab-case' },
    { var: 'existingMarkdown', desc: '既有頁面全文' },
    { var: 'reason', desc: '更新原因' },
    { var: 'changeBrief', desc: '改動 brief' },
    { var: 'chapterExcerpt', desc: '相關章節片段' },
  ],
  wikiQueryAnswerTemplate: [
    { var: 'question', desc: '使用者問題（Phase 2.5）' },
    { var: 'pagesMarkdown', desc: '相關 wiki 頁全文（Phase 2.5）' },
  ],
  lintUnrecordedVerifyTemplate: [
    { var: 'knownNamesList', desc: '已登錄角色名單（用「、」分隔）' },
    { var: 'candidatesJson', desc: '候選清單 JSON，含 name / occurrences / freq' },
  ],
  lintWikiContradictTemplate: [
    { var: 'pageType', desc: 'wiki page type（entity / concept / ...）' },
    { var: 'digestsJson', desc: 'WikiLintDigest JSON array' },
  ],
  lintWikiVsChapterTemplate: [
    { var: 'characterName', desc: '角色名' },
    { var: 'aliasesList', desc: '別名集合（character + entity 合併）' },
    { var: 'wikiContent', desc: '對應 entity 頁完整 markdown' },
    { var: 'chapterExcerptsJson', desc: '章節節錄 JSON array' },
  ],
  lintFixSuggestTemplate: [
    { var: 'issueTitle', desc: 'Issue 標題' },
    { var: 'issueDetail', desc: 'Issue 細節' },
    { var: 'originalMarkdown', desc: '原 wiki 頁 markdown' },
    { var: 'userDirection', desc: '使用者填的修改方向（可空）' },
  ],
};
