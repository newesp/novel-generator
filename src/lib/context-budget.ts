import type { Character } from '../types';
import { renderTemplate } from './prompt-template';
import { useSettingsStore } from '../stores/settingsStore';

export interface BudgetInputs {
  worldSetting: string;
  mainPlot: string;
  characters: string;
  beat: string;
  chapterPoints: string;
  referenceChapterTitle: string;
  referenceChapterContent: string;
  olderChapterSummary: string;
  wikiSection: string;
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
        c.arc && `成長弧線：${c.arc}`,
      ]
        .filter(Boolean)
        .join('；');
      return `- ${c.name || '(未命名)'}${head ? ` (${head})` : ''}${detail ? `：${detail}` : ''}`;
    })
    .join('\n');
}

/**
 * 依 chapterContentTemplate（可在偏好設定編輯）組裝章節正文 prompt。
 *
 * 模板使用 `{{var}}` 語法。conditional 區塊由本函式預先組成完整字串再注入，
 * 例如沒有主線劇情時，`mainPlotSection` 就是空字串。
 */
export function buildGenerationPrompt(
  budget: BudgetAllocation,
  chapterTitle: string,
  targetWords: number | null,
  adjustInstruction = ''
): string {
  const { aiPrompts } = useSettingsStore.getState();

  const mainPlotSection = budget.mainPlot
    ? `\n\n### 主線劇情\n${budget.mainPlot}`
    : '';

  const charactersSection = budget.characters
    ? `\n\n### 主要角色\n${budget.characters}`
    : '';

  const referenceSection = budget.referenceChapterContent
    ? `\n\n## 前文（參考章節：${budget.referenceChapterTitle || '前一章'}）\n${budget.referenceChapterContent}`
    : '';

  const olderSummarySection = budget.olderChapterSummary
    ? `\n\n## 更早章節摘要\n${budget.olderChapterSummary}`
    : '';

  const adjustInstructionSection = adjustInstruction
    ? `\n\n## ⚠️ 用戶調整指令（最高優先級，必須遵守）\n${adjustInstruction}`
    : '';

  const adjustInstructionRule = adjustInstruction ? '與「用戶調整指令」' : '';

  return renderTemplate(aiPrompts.chapterContentTemplate, {
    worldSetting: budget.worldSetting || '(未設定)',
    mainPlotSection,
    charactersSection,
    wikiSection: budget.wikiSection || '',
    chapterTitle: chapterTitle || '(未命名)',
    beat: budget.beat || '自定義',
    points: budget.chapterPoints || '無',
    targetWords: targetWords ?? '由你自行決定',
    referenceSection,
    olderSummarySection,
    adjustInstructionSection,
    adjustInstructionRule,
  });
}
