import { describe, expect, it } from 'vitest';
import { buildCharacterGraph, layoutCharacterGraph } from './character-graph';
import type { Character } from '../types';

function character(partial: Partial<Character>): Character {
  return {
    id: partial.id ?? partial.name ?? 'c',
    projectId: 'book',
    name: partial.name ?? '未命名',
    gender: '',
    age: '',
    race: '',
    personality: '',
    background: '',
    appearance: '',
    abilities: '',
    relations: partial.relations ?? '',
    arc: '',
    createdAt: 0,
  };
}

describe('character graph helpers', () => {
  it('creates a node for every character', () => {
    const graph = buildCharacterGraph([
      character({ id: 'a', name: '艾莉' }),
      character({ id: 'b', name: '蘇沐陽' }),
    ]);

    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('creates edges when relations mention another character name', () => {
    const graph = buildCharacterGraph([
      character({ id: 'a', name: '艾莉', relations: '信任蘇沐陽，也常和林語桐交換情報。' }),
      character({ id: 'b', name: '蘇沐陽' }),
      character({ id: 'c', name: '林語桐' }),
    ]);

    expect(graph.edges).toEqual([
      { id: 'a->b', sourceId: 'a', targetId: 'b', label: '信任蘇沐陽，也常和林語桐交換情報。' },
      { id: 'a->c', sourceId: 'a', targetId: 'c', label: '信任蘇沐陽，也常和林語桐交換情報。' },
    ]);
  });

  it('deduplicates reciprocal mentions into a single undirected edge', () => {
    const graph = buildCharacterGraph([
      character({ id: 'a', name: '艾莉', relations: '信任蘇沐陽' }),
      character({ id: 'b', name: '蘇沐陽', relations: '保護艾莉' }),
    ]);

    expect(graph.edges).toEqual([
      { id: 'a->b', sourceId: 'a', targetId: 'b', label: '信任蘇沐陽 / 保護艾莉' },
    ]);
  });

  it('ignores self mentions and blank names', () => {
    const graph = buildCharacterGraph([
      character({ id: 'a', name: '艾莉', relations: '艾莉開始理解自己。' }),
      character({ id: 'b', name: '', relations: '艾莉' }),
    ]);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toEqual([]);
  });

  it('places nodes on a stable circle', () => {
    const graph = buildCharacterGraph([
      character({ id: 'a', name: '艾莉' }),
      character({ id: 'b', name: '蘇沐陽' }),
      character({ id: 'c', name: '林語桐' }),
    ]);

    const layout = layoutCharacterGraph(graph, 300, 300);

    expect(layout.nodes).toHaveLength(3);
    expect(layout.nodes[0]).toMatchObject({ id: 'a', x: 260, y: 150 });
  });
});
