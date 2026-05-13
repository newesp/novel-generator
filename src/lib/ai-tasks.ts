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
 * 把 0-100 的故事進度數值，轉成給 AI 看的進度指示。
 * 0 = 故事剛開始；100 = 結局。
 */
function buildProgressInstruction(progress: number): string {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  let phase: string;
  if (p <= 15)      phase = '故事的「引入期」：主角剛被捲入主要衝突，世界觀與關鍵角色正開始展開';
  else if (p <= 35) phase = '故事的「鋪陳期」：衝突開始升級，角色關係與伏筆逐步建立';
  else if (p <= 55) phase = '故事的「中段」：抵達或接近中點轉折，故事方向出現重大變化';
  else if (p <= 75) phase = '故事的「衝突高張期」：各條線索匯流，衝突急劇升級，邁向高潮';
  else if (p <= 90) phase = '故事的「高潮期」：主要衝突進入決定性對決階段';
  else              phase = '故事的「結局期」：主要衝突已落幕或正在收束，伏筆要逐一回收';

  return `## 本批章節的劇情進度目標

本批章節「寫完之後」，整個故事的劇情進度應該達到約 **${p}%**（0% = 故事剛開始，100% = 全書結局）。
也就是說，這批章節的最後一章寫完時，故事應處於：**${phase}**。

請依此安排本批各章節的節拍、衝突強度與情節展開速度，讓劇情自然推進到此進度（不要過快或過慢）。`;
}

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
  /** 本批章節寫完時，整個故事的劇情進度（0-100）。0=故事剛開始，100=結局 */
  targetProgress?: number;
}): Promise<AIChapterDraft[]> {
  const { count, worldSetting, mainPlot, existingChapters, charactersList, targetProgress } = args;
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

  const progressText = typeof targetProgress === 'number' ? buildProgressInstruction(targetProgress) : '';
  const taskIntroBase = isContinuation
    ? `你正在**為一本已開始的小說規劃後續章節**。現在故事已經寫到第 ${existingChapters.length} 章，請接續規劃第 ${existingChapters.length + 1} 章到第 ${existingChapters.length + count} 章（共 ${count} 章新章節）。`
    : `根據以下世界觀與主線劇情，為一本中文小說規劃開頭 ${count} 個章節。`;
  const taskIntro = progressText ? `${taskIntroBase}\n\n${progressText}` : taskIntroBase;

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

/**
 * 根據已填欄位，補完單一角色的其餘空白欄位。
 * 只回傳「原本為空」的欄位內容；已填欄位不會被覆蓋。
 */
export async function completeCharacterFields(args: {
  current: AICharacterDraft;
  worldSetting: string;
  mainPlot: string;
  otherCharacters?: { name: string; personality?: string; background?: string }[];
}): Promise<Partial<AICharacterDraft>> {
  const { current, worldSetting, mainPlot, otherCharacters } = args;

  const FIELD_LABELS: Record<keyof AICharacterDraft, string> = {
    name: '姓名',
    gender: '性別',
    age: '年齡',
    race: '種族',
    personality: '性格',
    background: '背景',
    appearance: '外貌',
    abilities: '能力',
    relations: '關係',
    arc: '成長弧線',
  };
  const KEYS: (keyof AICharacterDraft)[] = ['name','gender','age','race','personality','background','appearance','abilities','relations','arc'];

  const filled = KEYS.filter((k) => (current[k] ?? '').trim().length > 0);
  const empty = KEYS.filter((k) => (current[k] ?? '').trim().length === 0);
  if (empty.length === 0) return {};

  const filledPart = filled.map((k) => `- ${FIELD_LABELS[k]}：${current[k]}`).join('\n');
  const emptyKeys = empty.map((k) => `${k.toUpperCase()}（${FIELD_LABELS[k]}）`).join('、');

  const othersPart = otherCharacters && otherCharacters.length
    ? `\n\n## 故事中其他角色（可作為「關係」欄位參考）\n${otherCharacters.map((c) => `- ${c.name}${c.personality ? `：${c.personality}` : ''}`).join('\n')}`
    : '';

  const outputLines = empty.map((k) => `${k.toUpperCase()}: <對應內容>`).join('\n');

  const prompt = `你是中文小說角色設定師。下方是「一個角色」已填寫的欄位，請依此推斷並補完「未填欄位」，要與已填內容、世界觀、主線劇情邏輯一致。

## 世界觀
${worldSetting || '(未指定)'}

## 主線劇情
${mainPlot || '(未指定)'}${othersPart}

## 此角色已填寫的欄位
${filledPart || '(目前所有欄位都空白，請自由發想一個能融入此世界觀的角色)'}

# 規則
1. 只輸出「未填欄位」：${emptyKeys}。已填欄位請勿輸出。
2. 內容必須與已填欄位一致（不可與已填內容衝突）。
3. 性格 1-2 句；背景 2-3 句；外貌、能力、關係各 1-2 句；成長弧線可較長，主角應對應主線劇情各階段轉變。
4. 「關係」欄位若有其他角色，請優先引用其名字。

# 輸出格式（嚴格遵守，不可有前言或結尾）
##FIELDS_START##
${outputLines}
##FIELDS_END##`;

  const result = await complete(prompt, { maxTokens: 2048 });
  const block = result.match(/##FIELDS_START##([\s\S]*?)##FIELDS_END##/)?.[1] ?? result;

  const out: Partial<AICharacterDraft> = {};
  for (const k of empty) {
    const re = new RegExp(`${k.toUpperCase()}:\\s*([\\s\\S]+?)(?=\\n[A-Z]+:|##FIELDS_END##|$)`);
    const v = block.match(re)?.[1]?.trim();
    if (v) out[k] = v;
  }
  return out;
}
