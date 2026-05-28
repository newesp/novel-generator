import { describe, expect, it } from 'vitest';
import type { WikiPage } from '../types';
import { normalizeWikiPageForSave, planDeleteWikiPageCascade } from './wiki-mutations';

const page = (partial: Partial<WikiPage>): WikiPage => ({
  id: partial.id ?? partial.slug ?? 'p',
  bookId: 'book',
  type: partial.type ?? 'entity',
  slug: partial.slug ?? 'page',
  title: partial.title ?? 'Page',
  aliases: partial.aliases ?? [],
  relatedSlugs: partial.relatedSlugs ?? [],
  description: partial.description ?? '',
  contentMd: partial.contentMd ?? '',
  createdAt: partial.createdAt ?? 1,
  updatedAt: partial.updatedAt ?? 1,
});

describe('planDeleteWikiPageCascade', () => {
  it('deletes the target and removes inbound related refs and markdown links', () => {
    const pages = [
      page({ id: 'a-fei', slug: 'a-fei', title: '阿飛' }),
      page({
        id: 'old-zhao',
        slug: 'old-zhao',
        title: '老趙',
        relatedSlugs: [{ type: 'entity', slug: 'a-fei' }],
        contentMd: [
          '# 老趙',
          '',
          '> **Type:** entity',
          '> **Related:** [阿飛](../entity/a-fei.md)',
          '',
          '老趙提到[阿飛](../entity/a-fei.md)。',
        ].join('\n'),
      }),
    ];

    const plan = planDeleteWikiPageCascade({ pages, pageId: 'a-fei', now: 100 });
    const changed = plan.changedPages[0];

    expect(plan.deletedPage.slug).toBe('a-fei');
    expect(changed.relatedSlugs).toEqual([]);
    expect(changed.contentMd).not.toContain('**Related:**');
    expect(changed.contentMd).toContain('老趙提到阿飛。');
    expect(changed.updatedAt).toBe(100);
  });
});

describe('normalizeWikiPageForSave', () => {
  it('parses metadata and removes unavailable wiki links before saving', () => {
    const existingCity = page({ id: 'city', slug: 'xing-chen-shi', title: '星塵市' });
    const draft = page({
      id: 'old-zhao',
      slug: 'old-zhao',
      aliases: ['鐵匠老趙'],
      contentMd: [
        '# 老趙',
        '',
        '> **Type:** entity',
        '> **Aliases:** 趙師傅',
        '> **Related:** [阿飛](../entity/a-fei.md), [星塵市](entity/xing-chen-shi.md)',
        '',
        '他住在[星塵市](entity/xing-chen-shi.md)，認識[阿飛](../entity/a-fei.md)。',
        '',
        '## 概述',
        '老趙是鐵匠。',
      ].join('\n'),
    });

    const normalized = normalizeWikiPageForSave({ page: draft, pages: [draft, existingCity], now: 100 });

    expect(normalized.title).toBe('老趙');
    expect(normalized.aliases).toEqual(['趙師傅']);
    expect(normalized.relatedSlugs).toEqual([{ type: 'entity', slug: 'xing-chen-shi' }]);
    expect(normalized.contentMd).toContain('[星塵市](../entity/xing-chen-shi)');
    expect(normalized.contentMd).toContain('認識阿飛。');
    expect(normalized.contentMd).not.toContain('a-fei');
    expect(normalized.updatedAt).toBe(100);
  });
});
