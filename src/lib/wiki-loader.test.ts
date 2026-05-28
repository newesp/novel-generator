import { describe, expect, it } from 'vitest';
import { selectWikiPagesForPrompt } from './wiki-loader';
import type { WikiPage } from '../types';

function page(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? partial.slug ?? 'p',
    bookId: 'book',
    type: partial.type ?? 'entity',
    slug: partial.slug ?? 'page',
    title: partial.title ?? 'Page',
    aliases: partial.aliases ?? [],
    relatedSlugs: partial.relatedSlugs ?? [],
    description: partial.description ?? '',
    contentMd: partial.contentMd ?? '',
    createdAt: 0,
    updatedAt: partial.updatedAt ?? 0,
  };
}

describe('wiki loader pick-pages selection', () => {
  it('keeps relevant pages and recent summaries under a tight budget', () => {
    const selected = selectWikiPagesForPrompt({
      pages: [
        page({ type: 'summary', slug: 'ch-1', title: 'Old', contentMd: 'old bridge '.repeat(50) }),
        page({ type: 'summary', slug: 'ch-8', title: 'Recent', contentMd: 'recent cliffhanger '.repeat(20) }),
        page({ type: 'entity', slug: 'aster', title: 'Aster', aliases: ['Star'], contentMd: 'Aster remembers the comet oath.' }),
        page({ type: 'concept', slug: 'comet-oath', title: 'Comet Oath', contentMd: 'The blue comet oath binds Aster.' }),
        page({ type: 'compare', slug: 'noise', title: 'Noise', contentMd: 'Irrelevant '.repeat(200) }),
      ],
      budgetChars: 520,
      chapterContext: {
        title: 'Aster and the blue comet',
        points: 'Aster must honor the old comet oath.',
        beat: '',
        referenceChapterContent: '',
        characterNames: ['Aster'],
        characterAliases: [],
      },
      mode: 'pick-pages',
    });

    expect(selected.status).toBe('red-truncated');
    expect(selected.pages.map((p) => p.slug)).toEqual(['aster', 'comet-oath', 'ch-8']);
    expect(selected.omittedPages).toBe(2);
  });

  it('uses priority truncation instead of pick-pages when mode is relevance', () => {
    const selected = selectWikiPagesForPrompt({
      pages: [
        page({ type: 'summary', slug: 'ch-9', title: 'Recent', contentMd: 'recent '.repeat(30) }),
        page({ type: 'entity', slug: 'aster', title: 'Aster', contentMd: 'Aster comet oath.' }),
        page({ type: 'compare', slug: 'noise', title: 'Noise', contentMd: 'Irrelevant '.repeat(200) }),
      ],
      budgetChars: 260,
      chapterContext: {
        title: 'Aster',
        points: '',
        beat: '',
        referenceChapterContent: '',
        characterNames: ['Aster'],
        characterAliases: [],
      },
      mode: 'relevance',
    });

    expect(selected.pages.map((p) => p.slug)).toEqual(['aster', 'ch-9']);
    expect(selected.selectionModeUsed).toBe('relevance');
  });
});
