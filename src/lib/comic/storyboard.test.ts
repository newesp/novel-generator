import { describe, expect, it } from 'vitest';
import { normalizeStoryboardDraft } from './storyboard';

describe('normalizeStoryboardDraft', () => {
  it('turns storyboard json into ordered comic panel drafts', () => {
    const result = normalizeStoryboardDraft({
      chapterTitle: '迷霧中的平衡點',
      storyboardStyle: 'manga',
      visualContinuityBible: { characters: { 阿飛: 'black hair, worn coat' } },
      panels: [
        {
          panelNumber: 2,
          beat: '衝突',
          characters: ['阿飛'],
          setting: '霧潮街口',
          action: '阿飛拔出短刀',
          emotion: '緊張',
          shotType: 'medium shot',
          cameraAngle: 'low angle',
          visualPrompt: 'manga panel, 阿飛, black hair',
          negativePrompt: 'extra fingers',
          narration: '霧壓低了街聲。',
          dialogue: [{ character: '阿飛', text: '退後。' }],
          durationSec: 4,
        },
      ],
      qualityChecks: { notes: [] },
    });

    expect(result.panels[0]).toMatchObject({
      order: 1,
      beat: '衝突',
      characters: ['阿飛'],
      location: '霧潮街口',
      visualPrompt: expect.stringContaining('阿飛'),
      negativePrompt: 'extra fingers',
      dialogue: '阿飛：退後。',
      narration: '霧壓低了街聲。',
      durationSec: 4,
      status: 'draft',
    });
  });

  it('clamps duration and fills missing prompt fallbacks', () => {
    const result = normalizeStoryboardDraft({
      chapterTitle: '測試章',
      panels: [{ panelNumber: 1, beat: '開場', action: '主角看見城市', durationSec: 30 }],
    });

    expect(result.panels[0].durationSec).toBe(12);
    expect(result.panels[0].visualPrompt).toContain('主角看見城市');
    expect(result.visualContinuityBibleJson).toContain('測試章');
  });

  it('normalizes recurring extra groups separately from named characters', () => {
    const result = normalizeStoryboardDraft({
      panels: [
        {
          panelNumber: 1,
          beat: 'market crowd',
          characters: ['A Fei'],
          extraGroups: [
            {
              label: 'dock residents',
              count: 16,
              role: 'civilians',
              prompt: 'worn city clothes, anxious faces, middle ground',
              visualPriority: 'low',
            },
          ],
        },
      ],
    });

    expect(result.panels[0].characters).toEqual(['A Fei']);
    expect(result.panels[0].extraGroupsJson).toBe(JSON.stringify([
      {
        label: 'dock residents',
        count: 16,
        role: 'civilians',
        prompt: 'worn city clothes, anxious faces, middle ground',
        visualPriority: 'low',
      },
    ]));
  });
});
