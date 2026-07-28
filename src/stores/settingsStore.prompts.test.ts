import { describe, it, expect } from 'vitest';
import { getPromptPair, type AIPromptPrefs } from './settingsStore';
import { DEFAULT_PROMPT_PAIRS_ZH, DEFAULT_PROMPT_PAIRS_EN } from '../lib/language-policy';

describe('Structured System Prompts & Target Pairs (Ticket #19)', () => {
  it('returns default Chinese prompt pairs for all 7 prompt targets', () => {
    const emptyPrefs: AIPromptPrefs = {
      chapterDraftsTemplate: '',
      chapterContinuationRules: '',
      chapterContentTemplate: '',
      chapterPointsTemplate: '',
      characterDraftsTemplate: '',
      inlineAdjustTemplate: '',
      comicStoryboardTemplate: '',
      wikiIngestPlanTemplate: '',
      wikiIngestCreateTemplate: '',
      wikiIngestUpdateTemplate: '',
      wikiQueryAnswerTemplate: '',
      lintUnrecordedVerifyTemplate: '',
      lintWikiContradictTemplate: '',
      lintWikiVsChapterTemplate: '',
      lintFixSuggestTemplate: '',
    };

    const targets = [
      'chapterDrafts',
      'chapterOutline',
      'characterProfile',
      'expandContent',
      'polishContent',
      'summaryGeneration',
      'wikiIngest',
    ] as const;

    for (const target of targets) {
      const pair = getPromptPair(emptyPrefs, target, 'zh-TW');
      expect(pair).toBeTruthy();
      expect(pair.systemPrompt).toBe(DEFAULT_PROMPT_PAIRS_ZH[target].systemPrompt);
      expect(pair.userPromptTemplate).toBe(DEFAULT_PROMPT_PAIRS_ZH[target].userPromptTemplate);
    }
  });

  it('returns default English prompt pairs when locale is en', () => {
    const emptyPrefs: AIPromptPrefs = {
      chapterDraftsTemplate: '',
      chapterContinuationRules: '',
      chapterContentTemplate: '',
      chapterPointsTemplate: '',
      characterDraftsTemplate: '',
      inlineAdjustTemplate: '',
      comicStoryboardTemplate: '',
      wikiIngestPlanTemplate: '',
      wikiIngestCreateTemplate: '',
      wikiIngestUpdateTemplate: '',
      wikiQueryAnswerTemplate: '',
      lintUnrecordedVerifyTemplate: '',
      lintWikiContradictTemplate: '',
      lintWikiVsChapterTemplate: '',
      lintFixSuggestTemplate: '',
    };

    const pair = getPromptPair(emptyPrefs, 'chapterDrafts', 'en');
    expect(pair.systemPrompt).toBe(DEFAULT_PROMPT_PAIRS_EN.chapterDrafts.systemPrompt);
    expect(pair.userPromptTemplate).toBe(DEFAULT_PROMPT_PAIRS_EN.chapterDrafts.userPromptTemplate);
  });

  it('prioritizes user custom prompt pair overrides over defaults', () => {
    const customPrefs: AIPromptPrefs = {
      chapterDrafts: {
        systemPrompt: 'Custom System Prompt for Chapter Drafts',
        userPromptTemplate: 'Custom User Template for Chapter Drafts',
      },
      chapterDraftsTemplate: '',
      chapterContinuationRules: '',
      chapterContentTemplate: '',
      chapterPointsTemplate: '',
      characterDraftsTemplate: '',
      inlineAdjustTemplate: '',
      comicStoryboardTemplate: '',
      wikiIngestPlanTemplate: '',
      wikiIngestCreateTemplate: '',
      wikiIngestUpdateTemplate: '',
      wikiQueryAnswerTemplate: '',
      lintUnrecordedVerifyTemplate: '',
      lintWikiContradictTemplate: '',
      lintWikiVsChapterTemplate: '',
      lintFixSuggestTemplate: '',
    };

    const pair = getPromptPair(customPrefs, 'chapterDrafts', 'zh-TW');
    expect(pair.systemPrompt).toBe('Custom System Prompt for Chapter Drafts');
    expect(pair.userPromptTemplate).toBe('Custom User Template for Chapter Drafts');
  });
});
