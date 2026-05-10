export interface BudgetInputs {
  worldSetting: string;
  beat: string;
  chapterPoints: string;
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

export function buildGenerationPrompt(
  budget: BudgetAllocation,
  chapterTitle: string,
  targetWords: number | null,
  adjustInstruction = ''
): string {
  return `## 背景資訊
${budget.worldSetting || '(未設定世界觀)'}

## 本章要求
- 標題：${chapterTitle}
- 故事節拍：${budget.beat || '自定義'}
- 章節要點：${budget.chapterPoints || '無'}
- 目標字數：${targetWords ?? '由你自行決定'}

## 前文（參考）
${budget.referenceChapterContent || '（無前文）'}
${budget.olderChapterSummary ? `\n## 更早章節摘要\n${budget.olderChapterSummary}` : ''}
${adjustInstruction ? `\n## 用戶調整要求\n${adjustInstruction}` : ''}

請續寫，保持文風一致，不要複述前文，直接從前文結尾處繼續創作。`;
}
