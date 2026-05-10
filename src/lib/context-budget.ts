import type { Character } from '../types';

export interface BudgetInputs {
  worldSetting: string;
  mainPlot: string;
  characters: string;
  beat: string;
  chapterPoints: string;
  referenceChapterTitle: string;
  referenceChapterContent: string;
  olderChapterSummary: string;
}

export interface BudgetAllocation extends BudgetInputs {
  outputBufferTokens: number;
}

export interface ContextBudgetOptions {
  modelContextWindow?: number;
  referenceDepth?: 'shallow' | 'standard' | 'deep';
}

const DEFAULT_CONTEXT_WINDOW = 128000;
const OUTPUT_BUFFER_RATIO = 0.15;

const approxTokens = (text: string) => Math.ceil(text.length / 4);

export function allocateBudget(
  inputs: BudgetInputs,
  options: ContextBudgetOptions = {}
): BudgetAllocation {
  const window = options.modelContextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const depth = options.referenceDepth ?? 'standard';
  const outputBufferTokens = Math.floor(window * OUTPUT_BUFFER_RATIO);

  let { referenceChapterContent, olderChapterSummary } = inputs;

  if (depth === 'shallow' && referenceChapterContent.length > 1000) {
    referenceChapterContent = referenceChapterContent.slice(0, 1000) + '...(摘要)';
  }

  const fixedTokens =
    approxTokens(inputs.worldSetting) +
    approxTokens(inputs.mainPlot) +
    approxTokens(inputs.characters) +
    approxTokens(inputs.beat) +
    approxTokens(inputs.chapterPoints) +
    approxTokens(referenceChapterContent) +
    outputBufferTokens;

  const availableForOlder = Math.max(0, window - fixedTokens);
  if (approxTokens(olderChapterSummary) > availableForOlder) {
    olderChapterSummary = olderChapterSummary.slice(0, availableForOlder * 4) + '...(摘要)';
  }

  return {
    ...inputs,
    referenceChapterContent,
    olderChapterSummary,
    outputBufferTokens,
  };
}

/**
 * 將角色列表壓縮為 prompt 用的多行字串。
 * 每行：「姓名 (性別/年齡/種族)：性格；背景；能力；關係」
 */
export function formatCharacters(characters: Character[]): string {
  if (characters.length === 0) return '';
  return characters
    .map((c) => {
      const head = [c.gender, c.age && `${c.age}歲`, c.race].filter(Boolean).join('/');
      const detail = [
        c.personality && `性格：${c.personality}`,
        c.background && `背景：${c.background}`,
        c.appearance && `外貌：${c.appearance}`,
        c.abilities && `能力：${c.abilities}`,
        c.relations && `關係：${c.relations}`,
      ]
        .filter(Boolean)
        .join('；');
      return `- ${c.name || '(未命名)'}${head ? ` (${head})` : ''}${detail ? `：${detail}` : ''}`;
    })
    .join('\n');
}

/**
 * 依 modules/03-chapters.md 的「預設提示詞模板」組裝 prompt。
 * 調整指令以「最高優先級」標示並置於最後段，確保 LLM 注意力。
 */
export function buildGenerationPrompt(
  budget: BudgetAllocation,
  chapterTitle: string,
  targetWords: number | null,
  adjustInstruction = ''
): string {
  const sections: string[] = [];

  sections.push('## 背景資訊');
  sections.push('');
  sections.push('### 世界觀');
  sections.push(budget.worldSetting || '(未設定)');
  if (budget.mainPlot) {
    sections.push('');
    sections.push('### 主線劇情');
    sections.push(budget.mainPlot);
  }
  if (budget.characters) {
    sections.push('');
    sections.push('### 主要角色');
    sections.push(budget.characters);
  }

  sections.push('');
  sections.push('## 本章要求');
  sections.push(`- 章節標題：${chapterTitle || '(未命名)'}`);
  sections.push(`- 故事節拍：${budget.beat || '自定義'}`);
  sections.push(`- 章節要點：${budget.chapterPoints || '無'}`);
  sections.push(`- 目標字數：${targetWords ?? '由你自行決定'}`);

  if (budget.referenceChapterContent) {
    sections.push('');
    sections.push(`## 前文（參考章節：${budget.referenceChapterTitle || '前一章'}）`);
    sections.push(budget.referenceChapterContent);
  }

  if (budget.olderChapterSummary) {
    sections.push('');
    sections.push('## 更早章節摘要');
    sections.push(budget.olderChapterSummary);
  }

  if (adjustInstruction) {
    sections.push('');
    sections.push('## ⚠️ 用戶調整指令（最高優先級，必須遵守）');
    sections.push(adjustInstruction);
  }

  sections.push('');
  sections.push('---');
  sections.push('請開始撰寫本章正文。要求：');
  sections.push('1. 嚴格遵守上述「本章要求」'
    + (adjustInstruction ? '與「用戶調整指令」' : ''));
  sections.push('2. 保持文風一致，與前文順暢銜接，不要複述前文');
  sections.push('3. 直接從前文結尾處繼續創作');
  sections.push('4. 直接輸出小說正文，不要加任何說明、標題或註解');

  return sections.join('\n');
}
