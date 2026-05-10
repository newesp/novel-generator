import { complete } from './llm';

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
}

const BEAT_LIST = '引入 (Inciting Incident) / 衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡';

/**
 * 從世界觀 + 主線劇情批次生成章節大綱。
 */
export async function generateChapterDrafts(args: {
  count: number;
  worldSetting: string;
  mainPlot: string;
  existingChapters: string[];
}): Promise<AIChapterDraft[]> {
  const { count, worldSetting, mainPlot, existingChapters } = args;

  const existingPart = existingChapters.length
    ? `\n\n已存在的章節（請延續其後）：\n${existingChapters.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';

  const prompt = `根據以下世界觀與主線劇情，為一本中文小說規劃接下來 ${count} 個章節。

## 世界觀
${worldSetting || '(未指定)'}

## 主線劇情
${mainPlot || '(未指定)'}${existingPart}

請輸出 ${count} 個章節，每個章節嚴格使用以下格式（不可省略標記）：

##CH_START##
TITLE: <章節標題（不要寫第N章，只寫標題）>
BEAT: <從以下選一個：${BEAT_LIST}>
POINTS: <本章核心情節要點，2-4 句話，含主要事件、角色互動、章末懸念>
##CH_END##

直接輸出 ${count} 段 ##CH_START##...##CH_END##，不要任何前言、編號或結尾總結。`;

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
 */
export async function generateCharacterDrafts(args: {
  count: number;
  worldSetting: string;
  mainPlot: string;
  existingNames: string[];
}): Promise<AICharacterDraft[]> {
  const { count, worldSetting, mainPlot, existingNames } = args;

  const existingPart = existingNames.length
    ? `\n\n已存在的角色（請避免重複）：${existingNames.join('、')}`
    : '';

  const prompt = `根據以下世界觀與主線劇情，為一本中文小說設計 ${count} 個角色。

## 世界觀
${worldSetting || '(未指定)'}

## 主線劇情
${mainPlot || '(未指定)'}${existingPart}

請輸出 ${count} 個角色，每個角色嚴格使用以下格式（不可省略標記，所有欄位都要填寫）：

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
##CHAR_END##

直接輸出 ${count} 段 ##CHAR_START##...##CHAR_END##，不要任何前言、編號或結尾總結。`;

  const result = await complete(prompt, { maxTokens: 4096 });

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
    };
    if (draft.name) drafts.push(draft);
  }
  return drafts;
}
