import { complete } from './llm';
import { logPromptToTemp } from './prompt-log';
import { renderTemplate } from './prompt-template';
import { useSettingsStore, getPromptPair, getBuiltInAIPrompts } from '../stores/settingsStore';
import {
  resolveBeatLabel,
  type WritingLanguage,
} from './language-policy';

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
  /** 漫畫/插圖生成時避免此角色跑偏的 negative prompt。 */
  visualNegativePrompt: string;
}

export const VISUAL_NEGATIVE_PROMPT_GUIDANCE = `角色 Negative Prompt 是「生圖時要排除的錯誤外觀」，不是角色描述。
- 不要填入角色應該保留的正向外貌特徵、服裝、道具或氣質。
- 請根據外貌欄位，寫出「相反或常見跑偏」的錯誤特徵。
- 若外貌是 young / slender / dirty apron，negative 可寫 old, overweight, clean elegant dress，但不要寫 dirty apron，也不要寫 no young。
- 用英文逗號分隔，避免整句中文敘述。`;

export const VISUAL_NEGATIVE_PROMPT_GUIDANCE_EN = `A character negative prompt lists incorrect visual traits to exclude during image generation; it is not a character description.
- Do not include positive appearance traits, clothing, props, or qualities that should remain.
- Derive opposite or commonly mistaken traits from the Appearance field.
- If the appearance is young / slender / dirty apron, the negative prompt may say old, overweight, clean elegant dress; do not include dirty apron or "no young."
- Separate terms with English commas instead of writing full sentences.`;

const BEAT_LIST = '引入 (Inciting Incident) / 衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡';

/**
 * 把 0-100 的故事進度數值，轉成給 AI 看的進度指示。
 * 0 = 故事剛開始；100 = 結局。
 */
function buildProgressInstruction(progress: number, writingLanguage: WritingLanguage): string {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  if (writingLanguage === 'en') {
    let phase: string;
    if (p <= 15) phase = 'the introduction: the protagonist is entering the central conflict while the world and key characters are established';
    else if (p <= 35) phase = 'early development: conflict is escalating while relationships and foreshadowing are established';
    else if (p <= 55) phase = 'the middle: the story is reaching or passing a midpoint turn that changes its direction';
    else if (p <= 75) phase = 'high tension: plot threads converge and the conflict accelerates toward the climax';
    else if (p <= 90) phase = 'the climax: the central conflict enters its decisive confrontation';
    else phase = 'the resolution: the central conflict is ending and planted threads should be resolved';

    return `## Target Story Progress for This Batch

After this batch is complete, the overall story should be approximately **${p}%** finished (0% = the story begins; 100% = the novel ends).
At the end of the final chapter in this batch, the story should be in **${phase}**.

Plan the beats, conflict intensity, and pacing so the story reaches this point naturally without moving too quickly or too slowly.`;
  }

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
  writingLanguage?: WritingLanguage;
}, signal?: AbortSignal): Promise<string> {
  const {
    worldSetting, mainPlot, charactersList,
    chapterTitle, beat, referenceChapter, currentPoints, writingLanguage = 'zh-Hant',
  } = args;
  const { aiPrompts } = useSettingsStore.getState();
  const isEn = writingLanguage === 'en';

  const refContent = referenceChapter?.content ?? '';
  const refTail = refContent.length > 1500
    ? `${isEn ? '(Earlier content omitted...)' : '（前略...）'}\n${refContent.slice(-1500)}`
    : refContent;

  const referenceSection = referenceChapter && refContent.trim()
    ? `\n\n## ${isEn ? `Reference Chapter (${referenceChapter.title})` : `參考章節（${referenceChapter.title}）`}\n${refTail}`
    : referenceChapter
      ? `\n\n## ${isEn ? 'Reference Chapter' : '參考章節'}\n${referenceChapter.title}${isEn ? ' (no prose; title only)' : '（無正文，僅供參考標題）'}`
      : '';

  const charactersSection = charactersList && charactersList.trim()
    ? `\n\n## ${isEn ? 'Existing Characters (use only these names; do not invent named characters)' : '已建立的角色（章節要點只能使用以下角色名字，不可自編新人物）'}\n${charactersList}`
    : '';

  const currentPointsSection = currentPoints && currentPoints.trim()
    ? `\n\n## ${isEn ? 'Current Key Points (reference only; create a better version for the beat and reference chapter)' : '目前的要點（僅供參考，請寫出更貼合節拍/參考章節的新版本）'}\n${currentPoints}`
    : '';

  const template = isEn
    ? getBuiltInAIPrompts('en').chapterPointsTemplate
    : aiPrompts.chapterPointsTemplate;
  const prompt = renderTemplate(template, {
    worldSetting: worldSetting || (isEn ? '(Unspecified)' : '(未指定)'),
    mainPlot: mainPlot || (isEn ? '(Unspecified)' : '(未指定)'),
    charactersSection,
    chapterTitle: chapterTitle || (isEn ? '(Untitled)' : '(尚未命名)'),
    beat: beat || (isEn ? '(Unspecified)' : '(未指定)'),
    referenceSection,
    currentPointsSection,
  });

  void logPromptToTemp('chapter-points', prompt, {
    chapterTitle,
    beat,
    hasReference: !!referenceChapter,
    hasCurrentPoints: !!(currentPoints && currentPoints.trim()),
  });

  const result = await complete(prompt, { maxTokens: 1024, writingLanguage }, signal);
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
  /** 書籍不可變的創作語言 */
  writingLanguage?: WritingLanguage;
}, signal?: AbortSignal): Promise<AIChapterDraft[]> {
  const { count, worldSetting, mainPlot, existingChapters, charactersList, targetProgress, writingLanguage = 'zh-Hant' } = args;
  const { aiPrompts } = useSettingsStore.getState();
  const locale = writingLanguage === 'en' ? 'en' : 'zh-TW';

  const isContinuation = existingChapters.length > 0;

  // 傳給 AI 現有章節的摘要；若超過 8 章，只取最後 8 章以節省 token
  const contextChapters = isContinuation ? existingChapters.slice(-8) : [];

  const existingChaptersSection = isContinuation
    ? (writingLanguage === 'en'
        ? `\n\n## Existing Chapters (Total ${existingChapters.length} chapters, showing last ${contextChapters.length} for reference; new chapters MUST continue plot lines and foreshadowing)\n` +
          contextChapters.map((c) => {
            const resolvedBeat = resolveBeatLabel(c.beat, 'en');
            const lines = [`Chapter ${c.index}: ${c.title}`, `Beat: ${resolvedBeat || '(Unspecified)'}`];
            if (c.points) lines.push(`Key Points: ${c.points}`);
            return lines.join('\n');
          }).join('\n\n')
        : `\n\n## 現有章節（共 ${existingChapters.length} 章，以下列出最後 ${contextChapters.length} 章供參考；新章節必須延續這些章節的情節與伏筆）\n` +
          contextChapters.map((c) => {
            const resolvedBeat = resolveBeatLabel(c.beat, 'zh-TW');
            const lines = [`第 ${c.index} 章：${c.title}`, `節拍：${resolvedBeat || '(未指定)'}`];
            if (c.points) lines.push(`要點：${c.points}`);
            return lines.join('\n');
          }).join('\n\n'))
    : '';

  const charactersSection = charactersList && charactersList.trim()
    ? (writingLanguage === 'en'
        ? `\n\n## Existing Characters (**Only use names from this list in chapter points**; if additional minor roles are needed, refer to them by title/relation like "barista" or "her colleague")\n${charactersList}`
        : `\n\n## 已建立的角色（**章節要點中只能使用以下角色名字，不可自行創造新名字**；若需提到的角色不在此列，請改用「咖啡館老闆」「她的同事」等職稱或關係代稱）\n${charactersList}`)
    : '';

  // 接續模式：排除「引入」節拍
  const beatList = isContinuation
    ? (writingLanguage === 'en'
        ? 'Rising Action / Midpoint Twist / Climax / Resolution / Setup / Transition'
        : '衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡')
    : (writingLanguage === 'en'
        ? 'Inciting Incident / Rising Action / Midpoint Twist / Climax / Resolution / Setup / Transition'
        : BEAT_LIST);

  const progressText = typeof targetProgress === 'number'
    ? buildProgressInstruction(targetProgress, writingLanguage)
    : '';
  const taskIntroBase = isContinuation
    ? (writingLanguage === 'en'
        ? `You are outlining upcoming chapters for an ongoing novel. The story has reached chapter ${existingChapters.length}. Outline chapters ${existingChapters.length + 1} to ${existingChapters.length + count} (${count} new chapters in English).`
        : `你正在**為一本已開始的小說規劃後續章節**。現在故事已經寫到第 ${existingChapters.length} 章，請接續規劃第 ${existingChapters.length + 1} 章到第 ${existingChapters.length + count} 章（共 ${count} 章新章節）。`)
    : (writingLanguage === 'en'
        ? `Outline the opening ${count} chapters for a novel in English based on the world setting and main plot.`
        : `根據以下世界觀與主線劇情，為一本中文小說規劃開頭 ${count} 個章節。`);

  const taskIntro = progressText ? `${taskIntroBase}\n\n${progressText}` : taskIntroBase;

  const rulesText = writingLanguage === 'en'
    ? getBuiltInAIPrompts('en').chapterContinuationRules.trim()
    : aiPrompts.chapterContinuationRules?.trim() ?? '';
  const continuationRulesSection = isContinuation && rulesText
    ? `\n\n# ${writingLanguage === 'en' ? 'Continuation Rules' : '接續規劃的硬性規則'}\n\n${rulesText}`
    : '';

  const pointsExtraHint = isContinuation
    ? (writingLanguage === 'en' ? '; only use established character names' : '；只能使用已建立的角色名字')
    : '';

  const promptPair = getPromptPair(aiPrompts, 'chapterDrafts', locale);
  const systemPrompt = promptPair.systemPrompt;

  const chapterDraftsTemplate = writingLanguage === 'en'
    ? getBuiltInAIPrompts('en').chapterDraftsTemplate
    : aiPrompts.chapterDraftsTemplate;
  const userPrompt = renderTemplate(chapterDraftsTemplate, {
    taskIntro,
    worldSetting: worldSetting || (writingLanguage === 'en' ? '(Unspecified)' : '(未指定)'),
    mainPlot: mainPlot || (writingLanguage === 'en' ? '(Unspecified)' : '(未指定)'),
    charactersSection,
    existingChaptersSection,
    continuationRulesSection,
    count,
    beatList,
    pointsExtraHint,
  });

  const prompt = `${systemPrompt}\n\n${userPrompt}`;

  void logPromptToTemp('chapter-drafts', prompt, {
    mode: isContinuation ? 'continuation' : 'fresh',
    existingChapterCount: existingChapters.length,
    requestCount: count,
    hasCharacters: !!(charactersList && charactersList.trim()),
  });

  const result = await complete(prompt, { maxTokens: 4096 }, signal);

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
  writingLanguage?: WritingLanguage;
}, signal?: AbortSignal): Promise<AICharacterDraft[]> {
  const prompt = buildCharacterDraftsPrompt(args);

  const result = await complete(prompt, { maxTokens: 6144 }, signal);

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
      visualNegativePrompt: fieldOf(b, 'VISUAL_NEGATIVE_PROMPT'),
    };
    if (draft.name) drafts.push(draft);
  }
  return drafts;
}

export function buildCharacterDraftsPrompt(args: {
  count: number;
  worldSetting: string;
  mainPlot: string;
  existingNames: string[];
  writingLanguage?: WritingLanguage;
}): string {
  const { count, worldSetting, mainPlot, existingNames, writingLanguage = 'zh-Hant' } = args;
  const { aiPrompts } = useSettingsStore.getState();
  const locale = writingLanguage === 'en' ? 'en' : 'zh-TW';

  const existingNamesSection = existingNames.length
    ? (writingLanguage === 'en'
        ? `\n\nExisting characters (avoid duplicate names): ${existingNames.join(', ')}`
        : `\n\n已存在的角色（請避免重複，但若主線劇情仍提到他們，請略過此名字並改補其他角色）：${existingNames.join('、')}`)
    : '';

  const promptPair = getPromptPair(aiPrompts, 'characterProfile', locale);
  const systemPrompt = promptPair.systemPrompt;

  const userPrompt = renderTemplate(aiPrompts.characterDraftsTemplate || promptPair.userPromptTemplate, {
    worldSetting: worldSetting || (writingLanguage === 'en' ? '(Unspecified)' : '(未指定)'),
    mainPlot: mainPlot || (writingLanguage === 'en' ? '(Unspecified)' : '(未指定)'),
    existingNamesSection,
    count,
    visualNegativePromptGuidance: VISUAL_NEGATIVE_PROMPT_GUIDANCE,
  });

  return `${systemPrompt}\n\n${userPrompt}`;
}

export function filterNewCharacterDrafts(drafts: AICharacterDraft[], existingNames: string[]): AICharacterDraft[] {
  const seen = new Set(existingNames.map(normalizeCharacterName).filter(Boolean));
  const out: AICharacterDraft[] = [];
  for (const draft of drafts) {
    const key = normalizeCharacterName(draft.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...draft, name: draft.name.trim() });
  }
  return out;
}

function normalizeCharacterName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLocaleLowerCase();
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
  writingLanguage?: WritingLanguage;
}, signal?: AbortSignal): Promise<Partial<AICharacterDraft>> {
  const { current, worldSetting, mainPlot, otherCharacters, writingLanguage = 'zh-Hant' } = args;
  const isEn = writingLanguage === 'en';

  const FIELD_LABELS: Record<keyof AICharacterDraft, string> = {
    name: isEn ? 'Name' : '姓名',
    gender: isEn ? 'Gender' : '性別',
    age: isEn ? 'Age' : '年齡',
    race: isEn ? 'Species' : '種族',
    personality: isEn ? 'Personality' : '性格',
    background: isEn ? 'Background' : '背景',
    appearance: isEn ? 'Appearance' : '外貌',
    abilities: isEn ? 'Abilities' : '能力',
    relations: isEn ? 'Relationships' : '關係',
    arc: isEn ? 'Character Arc' : '成長弧線',
    visualNegativePrompt: 'Character Negative Prompt',
  };
  const KEYS: (keyof AICharacterDraft)[] = [
    'name','gender','age','race','personality','background','appearance','abilities','relations','arc','visualNegativePrompt',
  ];

  const filled = KEYS.filter((k) => (current[k] ?? '').trim().length > 0);
  const empty = KEYS.filter((k) => (current[k] ?? '').trim().length === 0);
  if (empty.length === 0) return {};

  const filledPart = filled.map((k) => `- ${FIELD_LABELS[k]}: ${current[k]}`).join('\n');
  const emptyKeys = empty.map((k) => `${k.toUpperCase()} (${FIELD_LABELS[k]})`).join(', ');

  const othersPart = otherCharacters && otherCharacters.length
    ? `\n\n## ${isEn ? 'Other Characters (for relationship references)' : '故事中其他角色（可作為「關係」欄位參考）'}\n${otherCharacters.map((c) => `- ${c.name}${c.personality ? `: ${c.personality}` : ''}`).join('\n')}`
    : '';

  const outputLines = empty.map((k) => `${k.toUpperCase()}: <${isEn ? 'content' : '對應內容'}>`).join('\n');

  const prompt = isEn
    ? `You are an English-language fiction character designer. Complete only the empty fields for the character below. The additions must be consistent with the completed fields, world setting, and main plot.

## World Setting
${worldSetting || '(Unspecified)'}

## Main Plot
${mainPlot || '(Unspecified)'}${othersPart}

## Completed Fields
${filledPart || '(All fields are empty. Invent a character who belongs in this world.)'}

# Rules
1. Output only these empty fields: ${emptyKeys}. Do not output completed fields.
2. Do not contradict any completed field.
3. Personality: 1–2 sentences; Background: 2–3 sentences; Appearance, Abilities, and Relationships: 1–2 sentences each. The Character Arc may be longer and should track the main plot for a protagonist.
4. The Character Negative Prompt must follow:
${VISUAL_NEGATIVE_PROMPT_GUIDANCE_EN}
5. When other characters are available, refer to them by name in Relationships.

# Output Format (exactly; no preface or closing text)
##FIELDS_START##
${outputLines}
##FIELDS_END##`
    : `你是繁體中文小說角色設定師。下方是「一個角色」已填寫的欄位，請依此推斷並補完「未填欄位」，要與已填內容、世界觀、主線劇情邏輯一致。

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
4. 角色 Negative Prompt 必須遵守：
${VISUAL_NEGATIVE_PROMPT_GUIDANCE}
5. 「關係」欄位若有其他角色，請優先引用其名字。

# 輸出格式（嚴格遵守，不可有前言或結尾）
##FIELDS_START##
${outputLines}
##FIELDS_END##`;

  const result = await complete(prompt, { maxTokens: 2048, writingLanguage }, signal);
  const block = result.match(/##FIELDS_START##([\s\S]*?)##FIELDS_END##/)?.[1] ?? result;

  const out: Partial<AICharacterDraft> = {};
  for (const k of empty) {
    const re = new RegExp(`${k.toUpperCase()}:\\s*([\\s\\S]+?)(?=\\n[A-Z]+:|##FIELDS_END##|$)`);
    const v = block.match(re)?.[1]?.trim();
    if (v) out[k] = v;
  }
  return out;
}
