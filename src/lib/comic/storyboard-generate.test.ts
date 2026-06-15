import { describe, expect, it } from 'vitest';
import { buildStoryboardPrompt, generateStoryboardDraft, parseJsonFromLLM } from './storyboard-generate';
import type { Character, Chapter, Project, WikiPage } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

const chapter: Chapter = {
  id: 'ch1',
  projectId: 'book',
  order: 0,
  title: '迷霧中的平衡點',
  targetWords: null,
  beat: '中點轉折',
  points: '阿飛遇見老趙',
  content: '阿飛走入迷霧潮汐，老趙在鐵匠鋪門前等待。',
  referenceChapterId: null,
  wikiSyncedAt: null,
  wikiSyncedHash: null,
  wikiSyncStatus: 'unsynced',
  createdAt: 1,
  updatedAt: 1,
};

const project: Project = {
  id: 'book',
  title: '霧潮',
  genre: '奇幻',
  style: '冷峻',
  worldSetting: '星塵市被迷霧潮汐包圍。',
  mainPlot: '阿飛尋找失落真相。',
  chapterOutline: '',
  createdAt: 1,
  updatedAt: 1,
};

describe('buildStoryboardPrompt', () => {
  it('includes chapter, characters, wiki, style, and strict json instruction', () => {
    const prompt = buildStoryboardPrompt({
      project,
      chapter,
      characters: [{ name: '阿飛', appearance: '黑髮少年' } as Character],
      wikiPages: [{ type: 'entity', slug: 'a-fei', title: '阿飛', description: '主角' } as WikiPage],
      stylePreset: '黑白漫畫',
      targetPanelCount: 8,
    });

    expect(prompt).toContain('迷霧中的平衡點');
    expect(prompt).toContain('黑髮少年');
    expect(prompt).toContain('entity/a-fei');
    expect(prompt).toContain('"extraGroups"');
    expect(prompt).toContain('one-off background extras');
    expect(prompt).toContain('ordered panels[].narration');
    expect(prompt).toContain('complete spoken chapter script');
    expect(prompt).toContain('panels[].narration 是影片旁白腳本，不是短摘要');
    expect(prompt).toContain('旁白句數依目標格數與內容密度調整');
    expect(prompt).toContain('可把純視覺描述交給 visualPrompt');
    expect(prompt).toContain('主要事件、因果、情緒轉折、關鍵線索、重要對白含義、章末 hook 必須留在 narration');
    expect(prompt).toContain('"durationSec": 0');
    expect(prompt).toContain('黑白漫畫');
    expect(prompt).toContain('只輸出 JSON');
  });

  it('includes previous panels as avoid-copy context when regenerating', () => {
    const prompt = buildStoryboardPrompt({
      project,
      chapter,
      characters: [],
      wikiPages: [],
      stylePreset: '黑白漫畫',
      targetPanelCount: 8,
      previousPanels: [
        { order: 1, beat: '舊開場', visualPrompt: 'old panel prompt' },
      ],
    });

    expect(prompt).toContain('重新生成分鏡');
    expect(prompt).toContain('不要沿用上一版');
    expect(prompt).toContain('old panel prompt');
  });

  it('renders the configurable comic storyboard template', () => {
    const original = useSettingsStore.getState().aiPrompts.comicStoryboardTemplate;
    useSettingsStore.getState().setAiPrompts({
      comicStoryboardTemplate: '漫畫模板 {{projectSection}} / {{chapterSection}} / {{characterCardsSection}} / {{wikiSection}} / {{regenerationSection}} / {{chapterContent}}',
    });

    try {
      const prompt = buildStoryboardPrompt({
        project,
        chapter,
        characters: [{ name: '阿飛', appearance: '黑髮少年' } as Character],
        wikiPages: [{ type: 'entity', slug: 'a-fei', title: '阿飛', description: '主角' } as WikiPage],
        stylePreset: '黑白漫畫',
        targetPanelCount: 8,
        previousPanels: [{ order: 1, beat: '舊開場', visualPrompt: 'old panel prompt' }],
      });

      expect(prompt).toContain('漫畫模板');
      expect(prompt).toContain('書名：霧潮');
      expect(prompt).toContain('標題：迷霧中的平衡點');
      expect(prompt).toContain('黑髮少年');
      expect(prompt).toContain('entity/a-fei');
      expect(prompt).toContain('old panel prompt');
      expect(prompt).toContain('panels[].characters must use these exact names');
      expect(prompt).toContain('阿飛走入迷霧潮汐');
    } finally {
      useSettingsStore.getState().setAiPrompts({ comicStoryboardTemplate: original });
    }
  });

});

describe('generateStoryboardDraft', () => {
  it('parses fenced json responses into normalized panels', async () => {
    const draft = await generateStoryboardDraft({
      project,
      chapter,
      characters: [],
      wikiPages: [],
      stylePreset: 'manga',
      targetPanelCount: 4,
    }, async () => '```json\n{"chapterTitle":"迷霧中的平衡點","panels":[{"panelNumber":1,"beat":"開場","action":"阿飛走入霧中"}]}\n```');

    expect(draft.panels).toHaveLength(1);
    expect(draft.panels[0].visualPrompt).toContain('阿飛走入霧中');
  });
  it('requests JSON mode and a larger output budget for storyboard generation', async () => {
    const calls: unknown[] = [];
    await generateStoryboardDraft({
      project,
      chapter,
      characters: [],
      wikiPages: [],
      stylePreset: 'manga',
      targetPanelCount: 10,
      previousPanels: [{ order: 1, beat: 'old beat', visualPrompt: 'old prompt' }],
    }, async (_prompt, options) => {
      calls.push(options);
      return '{"chapterTitle":"A","panels":[]}';
    });

    expect(calls[0]).toMatchObject({
      maxTokens: 8192,
      temperature: 0.2,
      responseFormat: 'json_object',
    });
  });
});

describe('parseJsonFromLLM', () => {
  it('extracts fenced json even when the model adds prose around it', () => {
    const parsed = parseJsonFromLLM('好的，以下是分鏡：\n```json\n{"chapterTitle":"A","panels":[]}\n```\n請確認。');
    expect(parsed).toEqual({ chapterTitle: 'A', panels: [] });
  });

  it('extracts the first json object when no fence exists', () => {
    const parsed = parseJsonFromLLM('result:\n{"chapterTitle":"B","panels":[]}');
    expect(parsed).toEqual({ chapterTitle: 'B', panels: [] });
  });

  it('repairs missing commas between array objects from LLM output', () => {
    const parsed = parseJsonFromLLM(`{
      "chapterTitle": "C",
      "panels": [
        {"panelNumber": 1, "beat": "first"}
        {"panelNumber": 2, "beat": "second"}
      ]
    }`);

    expect(parsed).toEqual({
      chapterTitle: 'C',
      panels: [
        { panelNumber: 1, beat: 'first' },
        { panelNumber: 2, beat: 'second' },
      ],
    });
  });

  it('repairs missing commas between array strings from LLM output', () => {
    const parsed = parseJsonFromLLM('{"panels":[{"characters":["阿飛" "居民"],"beat":"crowd"}]}');

    expect(parsed).toEqual({
      panels: [
        { characters: ['阿飛', '居民'], beat: 'crowd' },
      ],
    });
  });

  it('repairs an unclosed extraGroups array before the next panel field', () => {
    const parsed = parseJsonFromLLM(`{
      "panels": [
        {
          "panelNumber": 1,
          "extraGroups": [
            {"label": "residents", "role": "civilians", "prompt": "background crowd", "visualPriority": "low"}
          "narration": "crowd watches",
          "durationSec": 4
        }
      ]
    }`);

    expect(parsed).toEqual({
      panels: [
        {
          panelNumber: 1,
          extraGroups: [
            { label: 'residents', role: 'civilians', prompt: 'background crowd', visualPriority: 'low' },
          ],
          narration: 'crowd watches',
          durationSec: 4,
        },
      ],
    });
  });

  it('repairs missing commas after array-valued panel fields', () => {
    const parsed = parseJsonFromLLM(`{
      "panels": [
        {
          "panelNumber": 1,
          "characters": ["阿飛", "老趙"]
          "setting": "鐵匠鋪",
          "dialogue": [{"character":"老趙","text":"跟我來"}]
          "durationSec": 4
        }
      ]
    }`);

    expect(parsed).toEqual({
      panels: [
        {
          panelNumber: 1,
          characters: ['阿飛', '老趙'],
          setting: '鐵匠鋪',
          dialogue: [{ character: '老趙', text: '跟我來' }],
          durationSec: 4,
        },
      ],
    });
  });

  it('repairs missing commas after string-valued panel fields', () => {
    const parsed = parseJsonFromLLM(`{
      "chapterTitle": "C"
      "panels": [
        {
          "panelNumber": 1,
          "beat": "Afei notices the signal"
          "action": "Afei turns toward the alley"
          "emotion": "tense"
          "visualPrompt": "Afei in a misty alley"
          "negativePrompt": "modern city"
          "durationSec": 4
        }
      ]
    }`);

    expect(parsed).toEqual({
      chapterTitle: 'C',
      panels: [
        {
          panelNumber: 1,
          beat: 'Afei notices the signal',
          action: 'Afei turns toward the alley',
          emotion: 'tense',
          visualPrompt: 'Afei in a misty alley',
          negativePrompt: 'modern city',
          durationSec: 4,
        },
      ],
    });
  });

  it('strips an opening markdown json fence even when the closing fence is missing', () => {
    const parsed = parseJsonFromLLM('```json\n{"chapterTitle":"D","panels":[]}');
    expect(parsed).toEqual({ chapterTitle: 'D', panels: [] });
  });

  it('repairs adjacent values without whitespace between them', () => {
    const parsed = parseJsonFromLLM('{"panels":[{"panelNumber":1,"beat":"first""action":"next"}{"panelNumber":2,"beat":"second"}]}');

    expect(parsed).toEqual({
      panels: [
        { panelNumber: 1, beat: 'first', action: 'next' },
        { panelNumber: 2, beat: 'second' },
      ],
    });
  });

  it('repairs an unterminated string before the next property key', () => {
    const parsed = parseJsonFromLLM(`{
      "panels": [
        {
          "panelNumber": 1,
          "beat": "Afei notices the signal
          "action": "Afei turns toward the alley",
          "durationSec": 4
        }
      ]
    }`);

    expect(parsed).toEqual({
      panels: [
        {
          panelNumber: 1,
          beat: 'Afei notices the signal',
          action: 'Afei turns toward the alley',
          durationSec: 4,
        },
      ],
    });
  });

  it('escapes raw newlines inside a continued string value', () => {
    const parsed = parseJsonFromLLM(`{
      "panels": [
        {
          "panelNumber": 1,
          "visualPrompt": "Afei in a misty alley
low angle shot, blue lantern light",
          "durationSec": 4
        }
      ]
    }`);

    expect(parsed).toEqual({
      panels: [
        {
          panelNumber: 1,
          visualPrompt: 'Afei in a misty alley\nlow angle shot, blue lantern light',
          durationSec: 4,
        },
      ],
    });
  });
});
