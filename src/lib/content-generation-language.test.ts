import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rewriteSelection } from './inline-edit';
import { complete } from './llm';

vi.mock('./llm', () => ({
  complete: vi.fn(),
}));

describe('Chapter Content & Inline Adjust Language Boundary (Ticket #21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends Traditional Chinese System Prompt for zh-Hant books during inline edit', async () => {
    vi.mocked(complete).mockResolvedValue('這是改寫後的繁中文章片段。');

    const result = await rewriteSelection({
      chapter: { title: '第一章', beat: 'inciting_incident', points: '發生衝突' },
      fullContent: '這是原本的段落內容。',
      selectionStart: 0,
      selectionEnd: 9,
      adjustInstruction: '加強氣氛',
      contextMode: 'full',
      contextChars: 500,
      writingLanguage: 'zh-Hant',
    });

    expect(result.raw).toBe('這是改寫後的繁中文章片段。');
    const lastCallPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(lastCallPrompt).toContain('你是專業小說編輯與精修作家，請直接輸出修改後的文字片段');
    expect(lastCallPrompt).toContain('引入 (Inciting Incident)');
  });

  it('prepends English System Prompt and resolves beat in English for en books', async () => {
    vi.mocked(complete).mockResolvedValue('This is the revised English passage.');

    const result = await rewriteSelection({
      chapter: { title: 'Chapter 1', beat: 'inciting_incident', points: 'A conflict occurs' },
      fullContent: 'Original passage text here.',
      selectionStart: 0,
      selectionEnd: 15,
      adjustInstruction: 'Enhance atmosphere',
      contextMode: 'full',
      contextChars: 500,
      writingLanguage: 'en',
    });

    expect(result.raw).toBe('This is the revised English passage.');
    const lastCallPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(lastCallPrompt).toContain('You are a professional prose editor. Output only the revised text snippet in English.');
    expect(lastCallPrompt).toContain('Inciting Incident');
  });
});
