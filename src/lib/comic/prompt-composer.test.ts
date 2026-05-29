import { describe, expect, it } from 'vitest';
import type { ComicPanel } from '../../types';
import { composeComicImagePrompt } from './prompt-composer';

const basePanel: ComicPanel = {
  id: 'panel-1',
  comicId: 'comic-1',
  order: 1,
  beat: 'A Fei enters the market',
  characters: ['A Fei'],
  location: 'mist market',
  shotType: 'wide shot',
  cameraAngle: 'eye level',
  visualPrompt: 'A Fei walks through a crowded dock market',
  negativePrompt: 'bad hands',
  dialogue: '',
  narration: '',
  durationSec: 4,
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
};

describe('composeComicImagePrompt', () => {
  it('adds recurring extra groups without treating them as named characters', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        extraGroupsJson: JSON.stringify([
          {
            label: 'dock residents',
            count: 16,
            role: 'civilians',
            prompt: 'worn city clothes, anxious faces, middle ground',
            visualPriority: 'low',
          },
        ]),
      },
      stylePreset: 'black and white manga',
    });

    expect(result.prompt).toContain('black and white manga');
    expect(result.prompt).toContain('A Fei walks through a crowded dock market');
    expect(result.prompt).toContain('Extras / crowd');
    expect(result.prompt).toContain('about 16 dock residents');
    expect(result.prompt).toContain('low visual priority');
    expect(result.prompt).toContain('do not make extras look like main characters');
    expect(result.negativePrompt).toContain('bad hands');
    expect(result.warnings).toEqual([]);
  });

  it('warns and ignores malformed extra group JSON', () => {
    const result = composeComicImagePrompt({
      panel: { ...basePanel, extraGroupsJson: 'not json' },
      stylePreset: 'manga',
    });

    expect(result.prompt).not.toContain('Extras / crowd');
    expect(result.warnings).toContain('Panel 1 has invalid extraGroupsJson');
  });
});
