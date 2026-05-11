import { complete } from './llm';
import { logPromptToTemp } from './prompt-log';
import { renderTemplate } from './prompt-template';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * AI 批次生成的章節骨架（不含正文）。
 */
export interface AIChapterDraft {
  title: string;
  beat: string;
  points: string;
}

/**
 * AI 批次生成的角色骨架。
 */
export interface AICharacterDraft {
  name: string;
  gender: string;
  age: string;
  race: string;
  personality: string;
  background: string;
  appearance: string;
  abilities: string;
  relations: string;
  /** 成長弧線（主角必填，且需與主線劇情相呼應） */
  arc: string;
}

const BEAT_LIST = '引入 (Inciting Incident) / 衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡';

/**
 * 為單一章節重新生成「章節要點」。
 * AI 會綜合：世界觀、主線劇情、角色清單、參考章節（內容摘要）、本章故事節拍 → 寫出 2-4 句要點。
 */
export async function regenerateChapterPoints(args: {
  worldSetting: string;
  mainPlot: string;
  charactersList?: string;
  chapterTitle: string;
  beat: string;
  /** 參考章節（通常是上一章或使用者選定的章節） */
  referenceChapter?: { title: string; content: string };
  /** 目前的要點（若有，AI 可參考方向但不必沿用） */
  currentPoints?: string;
}): Promise<string> {
  const {
    worldSetting, mainPlot, charactersList,
    chapterTitle, beat, referenceChapter, currentPoints,
  } = args;
  const { aiPrompts } = useSettingsStore.getState();

  const refContent = referenceChapter?.content ?? '';
  const refTail = refContent.length > 1500 ? `（前略...）\n${refContent.slice(-1500)}` : refContent;

  const referenceSection = referenceChapter && refContent.trim()
    ? `\n\n## 參考章節（${referenceChapter.title}）\n${refTail}`
    : referenceChapter
      ? `\n\n## 參考章節\n${referenceChapter.title}（無正文，僅供參考標題）`
      : '';

  const charactersSection = charactersList && charactersList.trim()
    ? `\n\n## 已建立的角色（章節要點只能使用以下角色名字，不可自編新人物）\n${charactersList}`
    : '';

  const currentPointsSection = currentPoints && currentPoints.trim()
    ? `\n\n## 目前的要點（僅供參考，請寫出更貼合節拍/參考章節的新版本）\n${currentPoints}`
    : '';

  const prompt = renderTemplate(aiPrompts.chapterPointsTemplate, {
    worldSetting: worldSetting || '(未指定)',
    mainPlot: mainPlot || '(未指定)',
    charactersSection,
    chapterTitle: chapterTitle || '(尚未命名)',
    beat: beat || '(未指定)',
    referenceSection,
    currentPointsSection,
  });

  void logPromptToTemp('chapter-points', prompt, {
    chapterTitle,
    beat,
    hasReference: !!referenceChapter,
    hasCurrentPoints: !!(currentPoints && currentPoints.trim()),
  });

  const result = await complete(prompt, { maxTokens: 1024 });
  return result.trim();
}

export interface ExistingChapterSummary {
  index: number;   // 1-based
  title: string;
  beat: string;
  points: string;
}

/**
 * 從世界觀 + 主線劇情批次生成章節大綱。
 * 若提供 existingChapters，AI 會在現有章節後接續生成。
 */
export async function generateChapterDrafts(args: {
  count: number;
  worldSetting: string;
  mainPlot: string;
  existingChapters: ExistingChapterSummary[];
  /** 已建立的角色（formatCharacters 輸出），用於避免 AI 自編人名 */
  charactersList?: string;
}): Promise<AIChapterDraft[]> {
  const { count, worldSetting, mainPlot, existingChapters, charactersList } = args;
  const { aiPrompts } = useSettingsStore.getState();

  const isContinuation = existingChapters.length > 0;

  // 傳給 AI 現有章節的摘要；若超過 8 章，只取最後 8 章以節省 token
  const contextChapters = isContinuation ? existingChapters.slice(-8) : [];

  const existingChaptersSection = isContinuation
    ? `\n\n## 現有章節（共 ${existingChapters.length} 章，以下列出最後 ${contextChapters.length} 章供參考；新章節必須延續這些章節的情節與伏筆）\n` +
      contextChapters.map((c) => {
        const lines = [`第 ${c.index} 章：${c.title}`, `節拍：${c.beat || '(未指定)'}`];
        if (c.points) lines.push(`要點：${c.points}`);
        return lines.join('\n');
      }).join('\n\n')
    : '';

  const charactersSection = charactersList && charactersList.trim()
    ? `\n\n## 已建立的角色（**章節要點中只能使用以下角色名字，不可自行創造新名字**；若需提到的角色不在此列，請改用「咖啡館老闆」「她的同事」等職稱或關係代稱）\n${charactersList}`
    : '';

  // 接續模式：排除「引入」節拍
  const beatList = isContinuation
    ? '衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡'
    : BEAT_LIST;

  const taskIntro = isContinuation
    ? `你正在**為一本已開始的小說規劃後續章節**。現在故事已經寫到第 ${existingChapters.length} 章，請接續規劃第 ${existingChapters.length + 1} 章到第 ${existingChapters.length + count} 章（共 ${count} 章新章節）。`
    : `根據以下世界觀與主線劇情，為一本中文小說規劃開頭 ${count} 個章節。`;

  const rulesText = aiPrompts.chapterContinuationRules?.trim() ?? '';
  const continuationRulesSection = isContinuation && rulesText
    ? `\n\n# 接續規劃的硬性規則（必須遵守）\n\n${rulesText}`
    : '';

  const pointsExtraHint = isContinuation ? '；只能使用已建立的角色名字' : '';

  const prompt = renderTemplate(aiPrompts.chapterDraftsTemplate, {
    taskIntro,
    worldSetting: worldSetting || '(未指定)',
    mainPlot: mainPlot || '(未指定)',
    charactersSection,
    existingChaptersSection,
    continuationRulesSection,
    count,
    beatList,
    pointsExtraHint,
  });

  void logPromptToTemp('chapter-drafts', prompt, {
    mode: isContinuation ? 'continuation' : 'fresh',
    existingChapterCount: existingChapters.length,
    requestCount: count,
    hasCharacters: !!(charactersList && charactersList.trim()),
  });

  const result = await complete(prompt, { maxTokens: 4096 });

  const drafts: AIChapterDraft[] = [];
  const blocks = [...result.matchAll(/##CH_START##([\s\S]*?)##CH_END##/g)];
  for (const m of blocks) {
    const block = m[1];
    const title = block.match(/TITLE:\s*(.+)/)?.[1]?.trim() ?? '';
    const beat  = block.match(/BEAT:\s*(.+)/)?.[1]?.trim() ?? '';
    const points = block.match(/POINTS:\s*([\s\S]+?)(?=\n[A-Z]+:|$)/)?.[1]?.trim() ?? '';
    if (title) drafts.push({ title, beat, points });
  }
  return drafts;
}

/**
 * 從世界觀 + 主線劇情批次生成角色。
 *
 * 規則：
 *  1. 必須先把「主線劇情」中所有以名字提及的人物全部生成為角色卡（不可遺漏）
 *  2. 之後再補足配角，使輸出角色數 ≥ count
 *  3. 第一個角色視為主角（protagonist），其「成長弧線」必須與主線劇情每階段相呼應
 */
export async function generateCharacterDrafts(args: {
  count: number;
  worldSetting: string;
  mainPlot: string;
  existingNames: string[];
}): Promise<AICharacterDraft[]> {
  const { count, worldSetting, mainPlot, existingNames } = args;

  const existingPart = existingNames.length
    ? `\n\n已存在的角色（請避免重複，但若主線劇情仍提到他們，請略過此名字並改補其他角色）：${existingNames.join('、')}`
    : '';

  const prompt = `你是一位中文小說的角色設定師。請根據世界觀與主線劇情，為小說設計角色卡。

## 世界觀
${worldSetting || '(未指定)'}

## 主線劇情
${mainPlot || '(未指定)'}${existingPart}

# 強制規則（必須遵守）

1. **凡是主線劇情中以「名字」明確提到的人物，都必須建立角色卡** —— 不可遺漏任何被點名的人物（主角、反派、關鍵配角皆然）。即使是只提到一兩次的名字也要建立。
2. 從主線劇情提取出來的角色「必須擺在輸出的最前面」，越關鍵的角色越前面，**第一個輸出的就是主角**。
3. 若主線劇情提取出的角色少於 ${count}，請補滿其他配角；若已達到或超過 ${count}，仍須輸出全部提取出來的角色（最終數量可大於 ${count}）。
4. **主角（第一個角色）的「成長弧線」必須與主線劇情各階段（開頭→中段→高潮→結局）相呼應**，明確說出主角從什麼狀態轉變為什麼狀態，與主線劇情的關鍵節點如何對應。
5. 其他角色的成長弧線可較簡略，但仍需反映其在主線劇情中的功能。

# 輸出格式

每個角色嚴格使用以下格式（不可省略任何欄位）：

##CHAR_START##
NAME: <角色姓名>
GENDER: <性別>
AGE: <年齡，數字或描述>
RACE: <種族>
PERSONALITY: <性格特徵，1-2 句>
BACKGROUND: <背景故事，2-3 句>
APPEARANCE: <外貌描述，1-2 句>
ABILITIES: <能力或技能，1-2 句>
RELATIONS: <與其他角色或勢力的關係，1-2 句>
ARC: <成長弧線。主角必須詳細描述從開頭→中段→高潮→結局的內在轉變，並對應主線劇情的關鍵節點；其他角色可較簡略>
##CHAR_END##

直接輸出多段 ##CHAR_START##...##CHAR_END##，不要任何前言、編號或結尾總結。至少輸出 ${count} 段，但主線劇情提到的角色不可遺漏（即使因此超出 ${count} 段）。`;

  const result = await complete(prompt, { maxTokens: 6144 });

  const drafts: AICharacterDraft[] = [];
  const blocks = [...result.matchAll(/##CHAR_START##([\s\S]*?)##CHAR_END##/g)];
  const fieldOf = (block: string, key: string) =>
    block.match(new RegExp(`${key}:\\s*([\\s\\S]+?)(?=\\n[A-Z]+:|$)`))?.[1]?.trim() ?? '';

  for (const m of blocks) {
    const b = m[1];
    const draft: AICharacterDraft = {
      name: fieldOf(b, 'NAME'),
      gender: fieldOf(b, 'GENDER'),
      age: fieldOf(b, 'AGE'),
      race: fieldOf(b, 'RACE'),
      personality: fieldOf(b, 'PERSONALITY'),
      background: fieldOf(b, 'BACKGROUND'),
      appearance: fieldOf(b, 'APPEARANCE'),
      abilities: fieldOf(b, 'ABILITIES'),
      relations: fieldOf(b, 'RELATIONS'),
      arc: fieldOf(b, 'ARC'),
    };
    if (draft.name) drafts.push(draft);
  }
  return drafts;
}
