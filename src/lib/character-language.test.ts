import { describe, it, expect } from 'vitest';
import { buildCharacterDraftsPrompt } from './ai-tasks';

describe('Character Drafts LLM Language Boundary (Ticket #22)', () => {
  it('formats prompt in Traditional Chinese for zh-Hant books', () => {
    const prompt = buildCharacterDraftsPrompt({
      count: 2,
      worldSetting: '修仙世界',
      mainPlot: '逆天改命',
      existingNames: ['張三'],
      writingLanguage: 'zh-Hant',
    });

    expect(prompt).toContain('你是一位小說角色設定專家');
    expect(prompt).toContain('已存在的角色');
    expect(prompt).toContain('張三');
  });

  it('formats prompt in English for English books (writingLanguage: en)', () => {
    const prompt = buildCharacterDraftsPrompt({
      count: 2,
      worldSetting: 'Cyberpunk City',
      mainPlot: 'Overthrow the Megacorp',
      existingNames: ['John Doe'],
      writingLanguage: 'en',
    });

    expect(prompt).toContain('You are a character design expert skilled in creating multi-dimensional');
    expect(prompt).toContain('Existing characters (avoid duplicate names): John Doe');
    expect(prompt).toContain('Cyberpunk City');
  });
});
