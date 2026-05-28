import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeGraph,
  findGraphNodeIdsByLabel,
  queryGraphNeighborhood,
} from './knowledge-graph';
import type { Character, WikiPage } from '../types';

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

function wikiPage(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? partial.slug ?? 'p',
    bookId: 'book',
    type: partial.type ?? 'entity',
    slug: partial.slug ?? 'page',
    title: partial.title ?? '頁面',
    aliases: partial.aliases ?? [],
    relatedSlugs: partial.relatedSlugs ?? [],
    description: '',
    contentMd: partial.contentMd ?? '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('knowledge graph', () => {
  it('builds serializable graph nodes from characters and wiki pages', () => {
    const graph = buildKnowledgeGraph({
      characters: [character({ id: 'c1', name: '艾莉' })],
      wikiPages: [wikiPage({ id: 'w1', type: 'concept', slug: 'ling-gan', title: '靈感潮汐' })],
    });

    expect(graph.nodes).toEqual([
      { id: 'character:c1', kind: 'character', label: '艾莉', refId: 'c1', meta: { projectId: 'book' } },
      { id: 'wiki:w1', kind: 'wikiPage', label: '靈感潮汐', refId: 'w1', meta: { type: 'concept', slug: 'ling-gan' } },
    ]);
  });

  it('creates character relation edges from relation text mentions', () => {
    const graph = buildKnowledgeGraph({
      characters: [
        character({ id: 'c1', name: '艾莉', relations: '信任蘇沐陽。' }),
        character({ id: 'c2', name: '蘇沐陽' }),
      ],
      wikiPages: [],
    });

    expect(graph.edges).toEqual([
      {
        id: 'character:c1->character:c2:character_relation',
        from: 'character:c1',
        to: 'character:c2',
        type: 'character_relation',
        label: '信任蘇沐陽。',
      },
    ]);
  });

  it('creates wiki related edges when target pages exist', () => {
    const graph = buildKnowledgeGraph({
      characters: [],
      wikiPages: [
        wikiPage({ id: 'w1', type: 'entity', slug: 'tie-bi', title: '鐵臂', relatedSlugs: [{ type: 'concept', slug: 'ling-gan' }] }),
        wikiPage({ id: 'w2', type: 'concept', slug: 'ling-gan', title: '靈感潮汐' }),
      ],
    });

    expect(graph.edges).toEqual([
      {
        id: 'wiki:w1->wiki:w2:wiki_related',
        from: 'wiki:w1',
        to: 'wiki:w2',
        type: 'wiki_related',
        label: 'Related',
      },
    ]);
  });

  it('finds node ids by exact label or wiki alias', () => {
    const graph = buildKnowledgeGraph({
      characters: [character({ id: 'c1', name: '艾莉' })],
      wikiPages: [wikiPage({ id: 'w1', title: '星塵市', aliases: ['星城'] })],
    });

    expect(findGraphNodeIdsByLabel(graph, '艾莉')).toEqual(['character:c1']);
    expect(findGraphNodeIdsByLabel(graph, '星城')).toEqual(['wiki:w1']);
  });

  it('queries a multi-hop neighborhood', () => {
    const graph = buildKnowledgeGraph({
      characters: [
        character({ id: 'c1', name: '艾莉', relations: '信任蘇沐陽。' }),
        character({ id: 'c2', name: '蘇沐陽', relations: '調查星塵市。' }),
      ],
      wikiPages: [wikiPage({ id: 'w1', title: '星塵市', aliases: ['星塵市'] })],
    });

    const result = queryGraphNeighborhood(graph, 'character:c1', 2);

    expect(result.nodes.map((n) => n.id)).toEqual(['character:c1', 'character:c2', 'wiki:w1']);
    expect(result.edges.map((e) => e.id)).toEqual([
      'character:c1->character:c2:character_relation',
      'character:c2->wiki:w1:wiki_mention',
    ]);
  });
});
