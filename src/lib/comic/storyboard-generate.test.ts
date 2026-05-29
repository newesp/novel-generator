import { describe, expect, it } from 'vitest';
import { buildStoryboardPrompt, generateStoryboardDraft } from './storyboard-generate';
import type { Character, Chapter, Project, WikiPage } from '../../types';

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
    expect(prompt).toContain('黑白漫畫');
    expect(prompt).toContain('只輸出 JSON');
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
});
