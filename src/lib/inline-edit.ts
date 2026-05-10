import { complete } from './llm';
import type { Chapter } from '../types';
import type { InlineEditContextMode } from '../stores/settingsStore';

export interface RewriteSelectionInput {
  chapter: Pick<Chapter, 'title' | 'beat' | 'points'>;
  fullContent: string;
  selectionStart: number;
  selectionEnd: number;
  adjustInstruction: string;
  contextMode: InlineEditContextMode;
  /** window 模式下，前後各取多少字（full 模式忽略此值） */
  contextChars: number;
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
  opts: RewriteSelectionInput
): Promise<RewriteSelectionResult> {
  const {
    chapter, fullContent, selectionStart, selectionEnd,
    adjustInstruction, contextMode, contextChars,
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
  });

  const raw = (await complete(prompt)).trim();

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
}): string {
  const { chapter, selectedText, beforeContext, afterContext, adjustInstruction } = args;

  return `你是中文小說作者，需要重寫一段被選取的文字。

## 章節背景
- 標題：${chapter.title || '(未命名)'}
- 節拍：${chapter.beat || '自定義'}
- 要點：${chapter.points || '無'}

## 上文（請保持銜接，不可改寫）
${beforeContext || '(無)'}

## 待重寫的段落（必須完全替換）
"""
${selectedText}
"""

## 下文（請保持銜接，不可改寫）
${afterContext || '(無)'}

## ⚠️ 用戶調整指令（最高優先級，必須遵守）
${adjustInstruction}

## 輸出要求
1. 僅輸出重寫後的內容，不加任何說明、引號、標題或前綴
2. 字數應與原段落相近（±30%）
3. 風格、人稱、時態必須與上下文一致
4. 結果與上文末句、下文首句必須能順暢銜接
5. 嚴格遵守「用戶調整指令」`;
}
