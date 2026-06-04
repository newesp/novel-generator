import { describe, expect, it } from 'vitest';
import type { Character, ComicPanel, SceneVisual } from '../../types';
import { canonicalizePanelCharacterTokens, composeComicImagePrompt } from './prompt-composer';

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

  it('includes every selected character visual prompt and reference asset', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        characters: ['A Fei', 'Old Zhao'],
        visualPrompt: 'A Fei smiles while Old Zhao leans into the doorway',
      },
      stylePreset: 'anime',
      characters: [
        {
          id: 'char-a-fei',
          projectId: 'project-1',
          name: 'A Fei',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: 'slim young man, messy black hair, grey work uniform',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-a-fei'],
          createdAt: 1,
        },
        {
          id: 'char-old-zhao',
          projectId: 'project-1',
          name: 'Old Zhao',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: 'short sturdy blacksmith, weathered face, oil-stained work clothes',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-old-zhao'],
          createdAt: 1,
        },
      ],
    });

    expect(result.prompt).toContain('A Fei: slim young man');
    expect(result.prompt).toContain('Old Zhao: short sturdy blacksmith');
    expect(result.referenceAssetIds).toEqual(['asset-a-fei', 'asset-old-zhao']);
    expect(result.warnings).toEqual([]);
  });

  it('warns when a selected panel character is not matched to a project character', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        characters: ['A Fei', 'Old Zhao'],
      },
      stylePreset: 'anime',
      characters: [
        {
          id: 'char-a-fei',
          projectId: 'project-1',
          name: 'A Fei',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: 'slim young man, messy black hair',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-a-fei'],
          createdAt: 1,
        },
      ],
    });

    expect(result.prompt).toContain('A Fei: slim young man');
    expect(result.prompt).not.toContain('Old Zhao:');
    expect(result.warnings).toContain('Panel 1 selected character Old Zhao, but no matching project character was found.');
  });

  it('matches visually identical character names containing invisible characters', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        characters: ['老趙'],
      },
      stylePreset: 'anime',
      characters: [
        {
          id: 'char-old-zhao',
          projectId: 'project-1',
          name: '老趙\u200B',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: '身材矮小但結實，穿著沾滿油污的工作服',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-old-zhao'],
          createdAt: 1,
        },
      ],
    });

    expect(result.prompt).toContain('老趙\u200B: 身材矮小但結實');
    expect(result.referenceAssetIds).toEqual(['asset-old-zhao']);
    expect(result.warnings).toEqual([]);
  });

  it('matches selected panel characters by stable character id', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        characters: ['char-old-zhao'],
      },
      stylePreset: 'anime',
      characters: [
        {
          id: 'char-old-zhao',
          projectId: 'project-1',
          name: '老趙',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: '身材矮小但結實，穿著沾滿油污的工作服',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-old-zhao'],
          createdAt: 1,
        },
      ],
    });

    expect(result.prompt).toContain('Selected panel characters: 老趙');
    expect(result.prompt).toContain('老趙: 身材矮小但結實');
    expect(result.referenceAssetIds).toEqual(['asset-old-zhao']);
    expect(result.warnings).toEqual([]);
  });

  it('resolves a legacy short character token to one unique project character', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        characters: ['老趙'],
      },
      stylePreset: 'anime',
      characters: [
        {
          id: 'char-blacksmith-zhao',
          projectId: 'project-1',
          name: '鐵匠老趙',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: '身材矮小但結實，穿著沾滿油污的工作服',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-old-zhao'],
          createdAt: 1,
        },
      ],
    });

    expect(result.prompt).toContain('Selected panel characters: 鐵匠老趙');
    expect(result.prompt).toContain('鐵匠老趙: 身材矮小但結實');
    expect(result.referenceAssetIds).toEqual(['asset-old-zhao']);
    expect(result.warnings).toEqual([]);
  });

  it('does not guess when a legacy short token matches multiple project characters', () => {
    const characters = ['鐵匠老趙', '商人老趙'].map((name, index) => ({
      id: `char-zhao-${index}`,
      projectId: 'project-1',
      name,
      gender: '',
      age: '',
      race: '',
      personality: '',
      background: '',
      appearance: '角色外貌',
      abilities: '',
      relations: '',
      arc: '',
      visualNegativePrompt: '',
      referenceAssetIds: [`asset-${index}`],
      createdAt: 1,
    }));

    const result = composeComicImagePrompt({
      panel: { ...basePanel, characters: ['老趙'] },
      stylePreset: 'anime',
      characters,
    });

    expect(result.referenceAssetIds).toEqual([]);
    expect(result.warnings).toContain('Panel 1 selected character 老趙, but no matching project character was found.');
  });

  it('returns reference image bindings in generation order', () => {
    const result = composeComicImagePrompt({
      panel: {
        ...basePanel,
        characters: ['A Fei'],
        sceneSlug: 'mist-market',
      },
      stylePreset: 'anime',
      characters: [
        {
          id: 'char-a-fei',
          projectId: 'project-1',
          name: 'A Fei',
          gender: '',
          age: '',
          race: '',
          personality: '',
          background: '',
          appearance: 'slim young man',
          abilities: '',
          relations: '',
          arc: '',
          visualNegativePrompt: '',
          referenceAssetIds: ['asset-a-fei'],
          createdAt: 1,
        },
      ],
      scenes: [
        {
          id: 'scene-1',
          projectId: 'project-1',
          slug: 'mist-market',
          title: 'Mist Market',
          prompt: 'wet stone street',
          negativePrompt: '',
          referenceAssetIds: ['asset-scene'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(result.referenceBindings).toEqual([
      { assetId: 'asset-a-fei', label: 'character A Fei reference image 1' },
      { assetId: 'asset-scene', label: 'scene Mist Market reference image 1' },
    ]);
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

describe('canonicalizePanelCharacterTokens', () => {
  const characters: Character[] = [
    {
      id: 'char-a-fei',
      projectId: 'project-1',
      name: '阿飛',
      gender: '',
      age: '',
      race: '',
      personality: '',
      background: '',
      appearance: '黑髮少年',
      abilities: '',
      relations: '',
      arc: '',
      visualNegativePrompt: '',
      referenceAssetIds: ['asset-a-fei'],
      createdAt: 1,
    },
    {
      id: 'char-blacksmith-zhao',
      projectId: 'project-1',
      name: '鐵匠老趙',
      gender: '',
      age: '',
      race: '',
      personality: '',
      background: '',
      appearance: '矮壯鐵匠',
      abilities: '',
      relations: '',
      arc: '',
      visualNegativePrompt: '',
      referenceAssetIds: ['asset-zhao'],
      createdAt: 1,
    },
  ];

  it('deduplicates aliases that resolve to the same project character', () => {
    expect(canonicalizePanelCharacterTokens(
      ['阿飛', '老趙', '鐵匠老趙', 'char-blacksmith-zhao'],
      characters,
    )).toEqual(['char-a-fei', 'char-blacksmith-zhao']);
  });

  it('removes tokens that do not resolve to a project character', () => {
    expect(canonicalizePanelCharacterTokens(['阿飛', '塵埃民'], characters)).toEqual(['char-a-fei']);
  });

  it('produces no missing-character warning after invalid tokens are canonicalized', () => {
    const canonicalCharacters = canonicalizePanelCharacterTokens(['阿飛', '塵埃民'], characters);
    const result = composeComicImagePrompt({
      panel: { ...basePanel, characters: canonicalCharacters },
      stylePreset: 'anime',
      characters,
    });

    expect(result.warnings).toEqual([]);
    expect(result.prompt).toContain('Selected panel characters: 阿飛');
    expect(result.prompt).not.toContain('塵埃民');
  });
});
