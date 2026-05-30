import { describe, expect, it } from 'vitest';
import type { Character } from '../types';
import { formatCharacters } from './context-budget';

describe('formatCharacters', () => {
  it('uses appearance for story prompts without comic-only visual fields', () => {
    const character: Character = {
      id: 'char-a-fei',
      projectId: 'project-1',
      name: '阿飛',
      gender: '',
      age: '',
      race: '',
      personality: '',
      background: '',
      appearance: '短黑髮、藍灰色舊工作服',
      abilities: '',
      relations: '',
      arc: '',
      visualNegativePrompt: 'no glasses',
      referenceAssetIds: ['asset-a-fei-front'],
      createdAt: 1,
    };

    const result = formatCharacters([character]);

    expect(result).toContain('外貌：短黑髮、藍灰色舊工作服');
    expect(result).not.toContain('no glasses');
    expect(result).not.toContain('asset-a-fei-front');
  });
});
