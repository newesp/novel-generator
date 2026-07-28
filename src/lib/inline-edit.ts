import { complete } from './llm';
import { renderTemplate } from './prompt-template';
import { useSettingsStore, getPromptPair } from '../stores/settingsStore';
import type { Chapter } from '../types';
import type { InlineEditContextMode } from '../stores/settingsStore';
import { resolveBeatLabel, type WritingLanguage } from './language-policy';

export interface RewriteSelectionInput {
  chapter: Pick<Chapter, 'title' | 'beat' | 'points'>;
  fullContent: string;
  selectionStart: number;
  selectionEnd: number;
  adjustInstruction: string;
  contextMode: InlineEditContextMode;
  /** window 模式下，前後各取多少字（full 模式忽略此值） */
  contextChars: number;
  /** 書籍創作語言 */
  writingLanguage?: WritingLanguage;
}

export interface RewriteSelectionResult {
  /** 替換選取後的完整章節內容 */
  newContent: string;
  /** 真正寫進去的部分（含原選取的前後空白） */
  rewrittenPart: string;
  /** LLM 的原始回傳（已 trim） */
  raw: string;
}

/**
 * 局部段落改寫：取選取文字 + 上下文 → LLM → 替換選取部分。
 *
 * 設計要點：
 * - 上下文使用三引號 """ 圈住「待重寫的段落」，明示 LLM 邊界
 * - 調整指令置於 prompt 末段並標示「最高優先級」
 * - 原選取的前後空白（換行）會被保留，避免破壞文章排版
 */
export async function rewriteSelection(
  opts: RewriteSelectionInput,
  signal?: AbortSignal,
): Promise<RewriteSelectionResult> {
  const {
    chapter, fullContent, selectionStart, selectionEnd,
    adjustInstruction, contextMode, contextChars, writingLanguage = 'zh-Hant',
  } = opts;

  const selectedText = fullContent.substring(selectionStart, selectionEnd);

  const beforeContext = contextMode === 'full'
    ? fullContent.substring(0, selectionStart)
    : fullContent.substring(Math.max(0, selectionStart - contextChars), selectionStart);

  const afterContext = contextMode === 'full'
    ? fullContent.substring(selectionEnd)
    : fullContent.substring(selectionEnd, Math.min(fullContent.length, selectionEnd + contextChars));

  const prompt = buildPrompt({
    chapter,
    selectedText,
    beforeContext,
    afterContext,
    adjustInstruction,
    writingLanguage,
  });

  const isEn = writingLanguage === 'en';
  const systemPrompt = isEn
    ? 'You are a professional prose editor. Output only the revised text snippet in English.'
    : '你是專業小說編輯與精修作家，請直接輸出修改後的文字片段。';

  const raw = (await complete(`${systemPrompt}\n\n${prompt}`, undefined, signal)).trim();

  // 保留原選取的前後空白（換行），避免段落結構被破壞
  const leadingWS  = selectedText.match(/^\s*/)?.[0] ?? '';
  const trailingWS = selectedText.match(/\s*$/)?.[0] ?? '';
  const rewrittenPart = leadingWS + raw + trailingWS;

  const before = fullContent.substring(0, selectionStart);
  const after  = fullContent.substring(selectionEnd);
  const newContent = before + rewrittenPart + after;

  return { newContent, rewrittenPart, raw };
}

function buildPrompt(args: {
  chapter: Pick<Chapter, 'title' | 'beat' | 'points'>;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
  adjustInstruction: string;
  writingLanguage: WritingLanguage;
}): string {
  const { chapter, selectedText, beforeContext, afterContext, adjustInstruction, writingLanguage } = args;
  const { aiPrompts } = useSettingsStore.getState();
  const locale = writingLanguage === 'en' ? 'en' : 'zh-TW';
  const resolvedBeat = resolveBeatLabel(chapter.beat, locale);

  return renderTemplate(aiPrompts.inlineAdjustTemplate, {
    chapterTitle: chapter.title || (writingLanguage === 'en' ? 'Untitled' : '(未命名)'),
    beat: resolvedBeat || (writingLanguage === 'en' ? 'Unspecified' : '自定義'),
    points: chapter.points || (writingLanguage === 'en' ? 'None' : '無'),
    beforeContext: beforeContext || (writingLanguage === 'en' ? '(None)' : '(無)'),
    selectedText,
    afterContext: afterContext || (writingLanguage === 'en' ? '(None)' : '(無)'),
    adjustInstruction,
  });
}
