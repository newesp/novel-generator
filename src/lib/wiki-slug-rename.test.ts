import { describe, expect, it } from 'vitest';
import type { WikiPage } from '../types';
import { renameWikiSlugInPages } from './wiki-slug-rename';

const basePage = (overrides: Partial<WikiPage>): WikiPage => ({
  id: 'page',
  bookId: 'book',
  type: 'entity',
  slug: 'page',
  title: 'Page',
  aliases: [],
  relatedSlugs: [],
  description: '',
  contentMd: '',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('renameWikiSlugInPages', () => {
  it('renames the selected page and rewrites inbound references', () => {
    const pages: WikiPage[] = [
      basePage({
        id: 'aiya',
        slug: 'aiya',
        title: '艾利亞',
        contentMd: '# 艾利亞\n',
      }),
      basePage({
        id: 'tie-bi',
        slug: 'tie-bi',
        title: '鐵臂',
        relatedSlugs: [
          { type: 'entity', slug: 'aiya' },
          { type: 'entity', slug: 'a-fei' },
        ],
        contentMd: [
          '# 鐵臂',
          '[艾利亞](../entity/aiya), [平面連結](entity/aiya#bio)',
          '[阿飛](../entity/a-fei)',
          'aiya 只是純文字，不應被改。',
        ].join('\n'),
      }),
    ];

    const plan = renameWikiSlugInPages({ pages, pageId: 'aiya', newSlug: 'ai-li-ya', now: 100 });

    const renamed = plan.updatedPages.find((page) => page.id === 'aiya');
    const referencing = plan.updatedPages.find((page) => page.id === 'tie-bi');

    expect(renamed?.slug).toBe('ai-li-ya');
    expect(renamed?.updatedAt).toBe(100);
    expect(referencing?.relatedSlugs).toEqual([
      { type: 'entity', slug: 'ai-li-ya' },
      { type: 'entity', slug: 'a-fei' },
    ]);
    expect(referencing?.contentMd).toContain('[艾利亞](../entity/ai-li-ya)');
    expect(referencing?.contentMd).toContain('[平面連結](entity/ai-li-ya#bio)');
    expect(referencing?.contentMd).toContain('[阿飛](../entity/a-fei)');
    expect(referencing?.contentMd).toContain('aiya 只是純文字，不應被改。');
    expect(plan.changedPages.map((page) => page.id)).toEqual(['aiya', 'tie-bi']);
  });

  it('rejects a slug collision within the same book and type', () => {
    const pages: WikiPage[] = [
      basePage({ id: 'aiya', slug: 'aiya' }),
      basePage({ id: 'existing', slug: 'ai-li-ya' }),
    ];

    expect(() => renameWikiSlugInPages({ pages, pageId: 'aiya', newSlug: 'ai-li-ya' }))
      .toThrow(/already exists/i);
  });

  it('rejects invalid slugs', () => {
    const pages: WikiPage[] = [basePage({ id: 'aiya', slug: 'aiya' })];

    expect(() => renameWikiSlugInPages({ pages, pageId: 'aiya', newSlug: '(aiya)' }))
      .toThrow(/invalid slug/i);
  });
});
