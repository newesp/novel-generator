import { describe, expect, it } from 'vitest';
import { buildOlderChapterSummaryFromWiki } from './wiki-summary-loader';
import type { WikiPage } from '../types';

function page(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? partial.slug ?? 'p',
    bookId: 'book',
    type: partial.type ?? 'summary',
    slug: partial.slug ?? 'ch-1',
    title: partial.title ?? 'Chapter',
    aliases: partial.aliases ?? [],
    relatedSlugs: partial.relatedSlugs ?? [],
    description: partial.description ?? '',
    contentMd: partial.contentMd ?? '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('wiki summary loader', () => {
  it('formats previous summary pages in chapter order and ignores current or future summaries', () => {
    const result = buildOlderChapterSummaryFromWiki({
      wikiPages: [
        page({ slug: 'ch-4', title: 'Current', contentMd: 'Current chapter summary.' }),
        page({ slug: 'ch-3', title: 'Third', contentMd: 'Third chapter summary.' }),
        page({ slug: 'ch-1', title: 'First', contentMd: 'First chapter summary.' }),
        page({ slug: 'ch-7', title: 'Future', contentMd: 'Future chapter summary.' }),
        page({ type: 'entity', slug: 'hero', title: 'Hero', contentMd: 'Not a summary.' }),
      ],
      currentChapterOrder: 3,
      title: 'Current',
      points: '',
      beat: '',
      characterNames: [],
    });

    expect(result).toContain('### 近期章節摘要');
    expect(result.indexOf('第 1 章「First」')).toBeLessThan(result.indexOf('第 3 章「Third」'));
    expect(result).not.toContain('Current chapter summary');
    expect(result).not.toContain('Future chapter summary');
    expect(result).not.toContain('Not a summary');
  });

  it('keeps an old selected reference summary when full reference content is unavailable', () => {
    const result = buildOlderChapterSummaryFromWiki({
      wikiPages: [
        page({ slug: 'ch-2', title: 'Old Hook', contentMd: 'The comet promise is made.' }),
        page({ slug: 'ch-8', title: 'Recent', contentMd: 'Recent bridge.' }),
      ],
      currentChapterOrder: 9,
      referenceChapterOrder: 1,
      referenceChapterHasFullContent: false,
      title: 'Return',
      points: '',
      beat: '',
      characterNames: [],
    });

    expect(result).toContain('### 指定參考章節摘要');
    expect(result).toContain('第 2 章「Old Hook」：The comet promise is made.');
  });

  it('does not duplicate the selected reference summary when full reference content is already loaded', () => {
    const result = buildOlderChapterSummaryFromWiki({
      wikiPages: [
        page({ slug: 'ch-2', title: 'Old Hook', contentMd: 'The comet promise is made.' }),
        page({ slug: 'ch-8', title: 'Recent', contentMd: 'Recent bridge.' }),
      ],
      currentChapterOrder: 9,
      referenceChapterOrder: 1,
      referenceChapterHasFullContent: true,
      title: 'Return',
      points: '',
      beat: '',
      characterNames: [],
    });

    expect(result).not.toContain('指定參考章節摘要');
    expect(result).not.toContain('The comet promise is made.');
    expect(result).toContain('Recent bridge.');
  });

  it('adds relevant distant summaries beyond the recent window', () => {
    const result = buildOlderChapterSummaryFromWiki({
      wikiPages: [
        page({ slug: 'ch-1', title: 'Comet Oath', contentMd: 'Aster swears by the blue comet.' }),
        page({ slug: 'ch-2', title: 'Market', contentMd: 'A quiet trade scene.' }),
        page({ slug: 'ch-5', title: 'Recent One', contentMd: 'Recent context one.' }),
        page({ slug: 'ch-6', title: 'Recent Two', contentMd: 'Recent context two.' }),
      ],
      currentChapterOrder: 6,
      title: 'The blue comet returns',
      points: 'Aster remembers the oath.',
      beat: '',
      characterNames: ['Aster'],
      recentCount: 2,
    });

    expect(result).toContain('### 遠期伏筆摘要');
    expect(result).toContain('第 1 章「Comet Oath」：Aster swears by the blue comet.');
    expect(result).not.toContain('A quiet trade scene.');
  });

  it('respects a character budget while preserving the selected reference first', () => {
    const result = buildOlderChapterSummaryFromWiki({
      wikiPages: [
        page({ slug: 'ch-1', title: 'Reference', contentMd: 'Reference summary.'.repeat(20) }),
        page({ slug: 'ch-8', title: 'Recent', contentMd: 'Recent summary.'.repeat(20) }),
      ],
      currentChapterOrder: 9,
      referenceChapterOrder: 0,
      referenceChapterHasFullContent: false,
      title: '',
      points: '',
      beat: '',
      characterNames: [],
      maxChars: 180,
    });

    expect(result.length).toBeLessThanOrEqual(180);
    expect(result).toContain('指定參考章節摘要');
    expect(result).toContain('Reference summary.');
  });
});
