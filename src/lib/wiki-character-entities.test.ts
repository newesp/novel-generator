import { describe, expect, it } from 'vitest';
import type { Character, WikiPage } from '../types';
import { ensureRequiredCharacterEntityOps, findRequiredCharacterEntities } from './wiki-character-entities';
import type { Plan } from './wiki-plan';

const character = (partial: Partial<Character>): Character => ({
  id: partial.id ?? 'c1',
  projectId: 'book',
  name: partial.name ?? '阿飛',
  gender: partial.gender ?? '',
  age: partial.age ?? '',
  race: partial.race ?? '',
  personality: partial.personality ?? '',
  background: partial.background ?? '',
  appearance: partial.appearance ?? '',
  abilities: partial.abilities ?? '',
  relations: partial.relations ?? '',
  arc: partial.arc ?? '',
  createdAt: 1,
});

const page = (partial: Partial<WikiPage>): WikiPage => ({
  id: partial.id ?? partial.slug ?? 'p',
  bookId: 'book',
  type: partial.type ?? 'entity',
  slug: partial.slug ?? 'page',
  title: partial.title ?? 'Page',
  aliases: partial.aliases ?? [],
  relatedSlugs: [],
  description: '',
  contentMd: '',
  createdAt: 1,
  updatedAt: 1,
});

describe('findRequiredCharacterEntities', () => {
  it('requires a character entity when a known character appears in the chapter but has no wiki page', () => {
    const required = findRequiredCharacterEntities({
      chapterContent: '阿飛走進迷霧酒館，聽見老趙敲打鐵砧。',
      characters: [
        character({ id: 'afei', name: '阿飛', personality: '敏捷而衝動', background: '流浪少年' }),
        character({ id: 'unused', name: '艾莉亞' }),
      ],
      pages: [page({ slug: 'old-zhao', title: '老趙' })],
    });

    expect(required).toHaveLength(1);
    expect(required[0]).toMatchObject({
      name: '阿飛',
      suggestedSlug: 'a-fei',
      title: '阿飛',
    });
    expect(required[0].contentBrief).toContain('敏捷而衝動');
    expect(required[0].contentBrief).toContain('流浪少年');
  });

  it('does not require a character entity when a matching page already exists', () => {
    const required = findRequiredCharacterEntities({
      chapterContent: '阿飛走進迷霧酒館。',
      characters: [character({ id: 'afei', name: '阿飛' })],
      pages: [page({ slug: 'a-fei', title: '阿飛' })],
    });

    expect(required).toEqual([]);
  });
});

describe('ensureRequiredCharacterEntityOps', () => {
  it('appends missing create ops for required character entities', () => {
    const plan: Plan = {
      operations: [
        {
          action: 'create',
          type: 'entity',
          slug: 'old-zhao',
          title: '老趙',
          aliases: [],
          reason: 'chapter mention',
          content_brief: '鐵匠老趙',
        },
      ],
      log_entry: 'ingest',
      unrecorded_characters: [],
      warnings: [],
    };

    const next = ensureRequiredCharacterEntityOps({
      plan,
      required: [{
        characterId: 'afei',
        name: '阿飛',
        title: '阿飛',
        suggestedSlug: 'a-fei',
        contentBrief: '角色庫：阿飛；性格：敏捷而衝動',
        reason: '角色庫已有且本章出現，但 Wiki entity 不存在',
      }],
    });

    expect(next.operations.map((op) => `${op.action}:${op.type}/${op.slug}`)).toEqual([
      'create:entity/old-zhao',
      'create:entity/a-fei',
    ]);
    expect(next.warnings).toContain('required entity entity/a-fei was missing from plan; appended create op');
  });
});
