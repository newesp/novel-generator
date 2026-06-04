import { describe, expect, it } from 'vitest';
import type { Character } from '../../types';
import { loadComicCharacterSnapshot } from './comic-character-snapshot';

const fallbackCharacters: Character[] = [
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
];

describe('loadComicCharacterSnapshot', () => {
  it('uses freshly loaded project characters before comic generation', async () => {
    const freshCharacters: Character[] = [
      ...fallbackCharacters,
      {
        id: 'char-old-zhao',
        projectId: 'project-1',
        name: '老趙',
        gender: '',
        age: '',
        race: '',
        personality: '',
        background: '',
        appearance: '身材矮小但結實，飽經風霜的臉上佈滿細密皺紋',
        abilities: '',
        relations: '',
        arc: '',
        visualNegativePrompt: '',
        referenceAssetIds: ['asset-old-zhao'],
        createdAt: 2,
      },
    ];

    const snapshot = await loadComicCharacterSnapshot({
      projectId: 'project-1',
      fallbackCharacters,
      listByProject: async () => freshCharacters,
    });

    expect(snapshot.map((character) => character.name)).toEqual(['阿飛', '老趙']);
  });

  it('retains fallback characters when the storage snapshot is incomplete', async () => {
    const oldZhao: Character = {
      id: 'char-old-zhao',
      projectId: 'project-1',
      name: '老趙',
      gender: '',
      age: '',
      race: '',
      personality: '',
      background: '',
      appearance: '身材矮小但結實',
      abilities: '',
      relations: '',
      arc: '',
      visualNegativePrompt: '',
      referenceAssetIds: ['asset-old-zhao'],
      createdAt: 2,
    };

    const snapshot = await loadComicCharacterSnapshot({
      projectId: 'project-1',
      fallbackCharacters: [...fallbackCharacters, oldZhao],
      listByProject: async () => fallbackCharacters,
    });

    expect(snapshot.map((character) => character.name)).toEqual(['阿飛', '老趙']);
    expect(snapshot[1].referenceAssetIds).toEqual(['asset-old-zhao']);
  });

  it('falls back to the provided characters if loading from storage fails', async () => {
    const snapshot = await loadComicCharacterSnapshot({
      projectId: 'project-1',
      fallbackCharacters,
      listByProject: async () => {
        throw new Error('storage unavailable');
      },
    });

    expect(snapshot).toEqual(fallbackCharacters);
  });
});
