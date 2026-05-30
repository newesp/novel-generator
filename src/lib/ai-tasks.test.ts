import { describe, expect, it } from 'vitest';
import type { AICharacterDraft } from './ai-tasks';
import { VISUAL_NEGATIVE_PROMPT_GUIDANCE, buildCharacterDraftsPrompt, filterNewCharacterDrafts } from './ai-tasks';
import { useSettingsStore } from '../stores/settingsStore';

const draft = (name: string, patch: Partial<AICharacterDraft> = {}): AICharacterDraft => ({
  name,
  gender: '',
  age: '',
  race: '',
  personality: '',
  background: '',
  appearance: '',
  abilities: '',
  relations: '',
  arc: '',
  visualNegativePrompt: '',
  ...patch,
});

describe('filterNewCharacterDrafts', () => {
  it('skips characters that already exist and duplicates in the same AI response', () => {
    const result = filterNewCharacterDrafts(
      [draft('阿飛'), draft('艾莉亞'), draft(' 阿飛 '), draft('鐵臂')],
      ['艾莉亞'],
    );

    expect(result.map((character) => character.name)).toEqual(['阿飛', '鐵臂']);
  });
});

describe('VISUAL_NEGATIVE_PROMPT_GUIDANCE', () => {
  it('tells the model not to negate desired appearance traits', () => {
    expect(VISUAL_NEGATIVE_PROMPT_GUIDANCE).toContain('不要填入角色應該保留的正向外貌特徵');
    expect(VISUAL_NEGATIVE_PROMPT_GUIDANCE).toContain('dirty apron');
    expect(VISUAL_NEGATIVE_PROMPT_GUIDANCE).toContain('不要寫 dirty apron');
  });
});

describe('buildCharacterDraftsPrompt', () => {
  it('renders the configurable character drafts template', () => {
    const original = useSettingsStore.getState().aiPrompts.characterDraftsTemplate;
    useSettingsStore.getState().setAiPrompts({
      characterDraftsTemplate: '角色模板 {{worldSetting}} / {{mainPlot}} / {{existingNamesSection}} / {{count}} / {{visualNegativePromptGuidance}}',
    });

    try {
      const prompt = buildCharacterDraftsPrompt({
        count: 2,
        worldSetting: '霧城',
        mainPlot: '阿飛追查真相',
        existingNames: ['阿飛'],
      });

      expect(prompt).toContain('角色模板 霧城 / 阿飛追查真相');
      expect(prompt).toContain('阿飛');
      expect(prompt).toContain('2');
      expect(prompt).toContain('角色 Negative Prompt');
    } finally {
      useSettingsStore.getState().setAiPrompts({ characterDraftsTemplate: original });
    }
  });
});
