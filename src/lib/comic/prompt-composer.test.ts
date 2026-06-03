import { describe, expect, it } from 'vitest';
import type { Character, ComicPanel, SceneVisual } from '../../types';
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
  it('uses character appearance as the visual prompt for active characters', () => {
    const characters: Character[] = [
      {
        id: 'char-a-fei',
        projectId: 'project-1',
        name: 'A Fei',
        gender: '',
        age: '',
        race: '',
        personality: '',
        background: '',
        appearance: 'young man, consistent short black hair, worn blue-gray work clothes.',
        abilities: '',
        relations: '',
        arc: '',
        visualNegativePrompt: 'no glasses, no beard',
        referenceAssetIds: ['asset-a-fei-front'],
        createdAt: 1,
      },
    ];

    const result = composeComicImagePrompt({
      panel: basePanel,
      stylePreset: 'black and white manga',
      characters,
    });

    expect(result.prompt).toContain('Character visual references');
    expect(result.prompt).toContain('A Fei: young man, consistent short black hair');
    expect(result.negativePrompt).toContain('bad hands');
    expect(result.negativePrompt).toContain('no glasses, no beard');
    expect(result.referenceAssetIds).toEqual(['asset-a-fei-front']);
  });

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

  it('adds selected scene prompt, negative prompt, and reference assets', () => {
    const scenes: SceneVisual[] = [
      {
        id: 'scene-1',
        projectId: 'project-1',
        slug: 'mist-market',
        title: 'Mist Market',
        prompt: 'wet stone street, hanging lanterns, dense blue mist',
        negativePrompt: 'modern mall, clean supermarket',
        referenceAssetIds: ['asset-scene-1'],
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const result = composeComicImagePrompt({
      panel: { ...basePanel, sceneSlug: 'mist-market' },
      stylePreset: 'manga',
      scenes,
    });

    expect(result.prompt).toContain('Scene visual reference (Mist Market)');
    expect(result.prompt).toContain('wet stone street');
    expect(result.negativePrompt).toContain('modern mall');
    expect(result.referenceAssetIds).toEqual(['asset-scene-1']);
  });
});
