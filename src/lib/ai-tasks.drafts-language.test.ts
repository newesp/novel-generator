import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateChapterDrafts } from './ai-tasks';
import { complete } from './llm';

vi.mock('./llm', () => ({
  complete: vi.fn(),
  isLLMReady: vi.fn(() => true),
}));

describe('Outline & Chapter Drafts LLM Language Boundary (Ticket #20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats prompt in Traditional Chinese for zh-Hant books', async () => {
    const mockOutput = `
##CH_START##
TITLE: 第一章：降臨
BEAT: inciting_incident
POINTS: 主角降臨神秘異界，展開玄幻旅程。
##CH_END##
    `;
    vi.mocked(complete).mockResolvedValue(mockOutput);

    const result = await generateChapterDrafts({
      count: 1,
      worldSetting: '修仙世界',
      mainPlot: '踏上至尊路',
      existingChapters: [],
      writingLanguage: 'zh-Hant',
    });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('第一章：降臨');

    const lastCallPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(lastCallPrompt).toContain('你是一位資深小說架構師與策劃專家');
    expect(lastCallPrompt).toContain('根據以下世界觀與主線劇情，為一本中文小說規劃開頭 1 個章節');
  });

  it('formats prompt in English for English books (writingLanguage: en)', async () => {
    const mockOutput = `
##CH_START##
TITLE: Chapter 1: The Arrival
BEAT: inciting_incident
POINTS: The hero arrives in the mystical realm and begins their epic journey.
##CH_END##
    `;
    vi.mocked(complete).mockResolvedValue(mockOutput);

    const result = await generateChapterDrafts({
      count: 1,
      worldSetting: 'Cultivation Realm',
      mainPlot: 'Path to Supremacy',
      existingChapters: [
        { index: 1, title: 'Prologue', beat: 'setup', points: 'World introduction' },
      ],
      writingLanguage: 'en',
    });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Chapter 1: The Arrival');

    const lastCallPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(lastCallPrompt).toContain('You are a senior web novel architect and plotting expert');
    expect(lastCallPrompt).toContain('Existing Chapters');
    expect(lastCallPrompt).toContain('Chapter 1: Prologue');
    expect(lastCallPrompt).toContain('Beat: Setup / Transition');
  });
});
