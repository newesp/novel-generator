import type { Character } from '../types';
import { renderTemplate } from './prompt-template';
import { useSettingsStore } from '../stores/settingsStore';
import { getBuiltInAIPrompts } from '../stores/settingsStore';
import type { WritingLanguage } from './language-policy';

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
export function formatCharacters(
  characters: Character[],
  writingLanguage: WritingLanguage = 'zh-Hant',
): string {
  if (characters.length === 0) return '';
  const isEn = writingLanguage === 'en';
  return characters
    .map((c) => {
      const head = [c.gender, c.age && (isEn ? `Age ${c.age}` : `${c.age}歲`), c.race].filter(Boolean).join('/');
      const labelSeparator = isEn ? ': ' : '：';
      const detail = [
        c.personality && `${isEn ? 'Personality' : '性格'}${labelSeparator}${c.personality}`,
        c.background && `${isEn ? 'Background' : '背景'}${labelSeparator}${c.background}`,
        c.appearance && `${isEn ? 'Appearance' : '外貌'}${labelSeparator}${c.appearance}`,
        c.abilities && `${isEn ? 'Abilities' : '能力'}${labelSeparator}${c.abilities}`,
        c.relations && `${isEn ? 'Relationships' : '關係'}${labelSeparator}${c.relations}`,
        c.arc && `${isEn ? 'Character Arc' : '成長弧線'}${labelSeparator}${c.arc}`,
      ]
        .filter(Boolean)
        .join(isEn ? '; ' : '；');
      return `- ${c.name || (isEn ? '(Unnamed)' : '(未命名)')}${head ? ` (${head})` : ''}${detail ? `${isEn ? ': ' : '：'}${detail}` : ''}`;
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
  adjustInstruction = '',
  writingLanguage: WritingLanguage = 'zh-Hant',
): string {
  const { aiPrompts } = useSettingsStore.getState();
  const isEn = writingLanguage === 'en';

  const mainPlotSection = budget.mainPlot
    ? `\n\n### ${isEn ? 'Main Plot' : '主線劇情'}\n${budget.mainPlot}`
    : '';

  const charactersSection = budget.characters
    ? `\n\n### ${isEn ? 'Main Characters' : '主要角色'}\n${budget.characters}`
    : '';

  const referenceSection = budget.referenceChapterContent
    ? `\n\n## ${isEn ? `Previous Context (Reference Chapter: ${budget.referenceChapterTitle || 'Previous Chapter'})` : `前文（參考章節：${budget.referenceChapterTitle || '前一章'}）`}\n${budget.referenceChapterContent}`
    : '';

  const olderSummarySection = budget.olderChapterSummary
    ? `\n\n## ${isEn ? 'Earlier Chapter Summary' : '更早章節摘要'}\n${budget.olderChapterSummary}`
    : '';

  const adjustInstructionSection = adjustInstruction
    ? `\n\n## ⚠️ ${isEn ? 'User Instructions (highest priority; must follow)' : '用戶調整指令（最高優先級，必須遵守）'}\n${adjustInstruction}`
    : '';

  const adjustInstructionRule = adjustInstruction
    ? (isEn ? 'and the User Instructions' : '與「用戶調整指令」')
    : '';

  const template = isEn
    ? getBuiltInAIPrompts('en').chapterContentTemplate
    : aiPrompts.chapterContentTemplate;
  return renderTemplate(template, {
    worldSetting: budget.worldSetting || (isEn ? '(Not set)' : '(未設定)'),
    mainPlotSection,
    charactersSection,
    wikiSection: budget.wikiSection || '',
    chapterTitle: chapterTitle || (isEn ? '(Untitled)' : '(未命名)'),
    beat: budget.beat || (isEn ? 'Custom' : '自定義'),
    points: budget.chapterPoints || (isEn ? 'None' : '無'),
    targetWords: targetWords ?? (isEn ? 'Use your judgment' : '由你自行決定'),
    referenceSection,
    olderSummarySection,
    adjustInstructionSection,
    adjustInstructionRule,
  });
}
