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
{{worldSetting}}{{mainPlotSection}}{{charactersSection}}

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
    { var: 'chapterTitle', desc: '本章標題' },
    { var: 'beat', desc: '故事節拍' },
    { var: 'points', desc: '章節要點' },
    { var: 'targetWords', desc: '目標字數（或「由你自行決定」）' },
    { var: 'referenceSection', desc: '參考章節區段（沒設參考章節則空）' },
    { var: 'olderSummarySection', desc: '更早章節摘要區段（目前未實作，永遠為空）' },
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
};
