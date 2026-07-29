import { describe, expect, it } from 'vitest';
import { brokenLinkCheck } from './broken-link';
import type { LintContext } from '../types';
import type { WikiPage } from '../../../types';

function page(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? partial.slug ?? 'p',
    bookId: 'book',
    type: partial.type ?? 'entity',
    slug: partial.slug ?? 'tie-bi',
    title: partial.title ?? '鐵臂',
    aliases: partial.aliases ?? [],
    relatedSlugs: partial.relatedSlugs ?? [],
    description: '',
    contentMd: partial.contentMd ?? '',
    createdAt: 0,
    updatedAt: 0,
  };
}

function ctx(pages: WikiPage[]): LintContext {
  return {
    bookId: 'book',
    chapters: [],
    characters: [],
    pages,
    aiPrompts: {} as LintContext['aiPrompts'],
    prefs: {} as LintContext['prefs'],
    lintBatchId: 'lint-batch',
    signal: undefined,
  };
}

describe('broken link check', () => {
  it('reports broken markdown wiki links even when relatedSlugs is already clean', async () => {
    const result = await brokenLinkCheck.run(ctx([
      page({
        id: 'tie-bi',
        slug: 'tie-bi',
        contentMd: '> **Related:** [艾莉亞](../entity/ai-li-ya.md), [阿飛](../entity/a-fei)',
      }),
      page({ id: 'a-fei', slug: 'a-fei', title: '阿飛' }),
    ]));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].title).toContain('entity/ai-li-ya');
    expect(result.issues[0].fix).toEqual({
      kind: 'removeRelatedSlug',
      pageId: 'tie-bi',
      target: { type: 'entity', slug: 'ai-li-ya' },
    });
  });

  it('suggests renaming a matching page when a broken markdown link points at its canonical slug', async () => {
    const result = await brokenLinkCheck.run(ctx([
      page({
        id: 'tie-bi',
        slug: 'tie-bi',
        contentMd: '> **Related:** [艾莉亞](../entity/ai-li-ya)',
      }),
      page({ id: 'aiya', slug: 'aiya', title: '艾莉亞' }),
    ]));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].fix).toEqual({
      kind: 'renameWikiSlug',
      pageId: 'aiya',
      newSlug: 'ai-li-ya',
    });
  });

  it('presents issue text in English for the English interface', async () => {
    const pages = [
      page({
        id: 'source',
        slug: 'source',
        title: 'Source',
        relatedSlugs: [{ type: 'entity', slug: 'missing' }],
      }),
    ];
    const result = await brokenLinkCheck.run({ ...ctx(pages), interfaceLocale: 'en' });

    expect(result.issues[0].title).toBe(
      'entity/source has a relatedSlugs reference to missing page entity/missing',
    );
    expect(result.issues[0].detail).not.toMatch(/[\u3400-\u9fff]/);
  });
});
