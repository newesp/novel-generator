import { describe, expect, it } from 'vitest';
import { buildWikiQueryPrompt, selectWikiPagesForQuery } from './wiki-query';
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
    updatedAt: 0,
  };
}

describe('wiki query', () => {
  it('selects pages relevant to a natural-language question', () => {
    const pages = selectWikiPagesForQuery({
      question: 'What did Aster promise under the comet?',
      pages: [
        page({ slug: 'aster', title: 'Aster', aliases: ['Star'], contentMd: 'Aster promised to guard the comet key.' }),
        page({ slug: 'market', title: 'Market', contentMd: 'A quiet trading place.' }),
        page({ type: 'summary', slug: 'ch-2', title: 'Comet Night', contentMd: 'The comet key appears again.' }),
      ],
      maxPages: 2,
    });

    expect(pages.map((p) => p.slug)).toEqual(['aster', 'ch-2']);
  });

  it('renders the wiki query answer prompt with selected pages', () => {
    const prompt = buildWikiQueryPrompt({
      question: 'Where is the comet key?',
      pages: [page({ type: 'entity', slug: 'aster', title: 'Aster', contentMd: 'Aster holds the comet key.' })],
      template: 'Q={{question}}\nPAGES={{pagesMarkdown}}',
    });

    expect(prompt).toContain('Q=Where is the comet key?');
    expect(prompt).toContain('entity/aster');
    expect(prompt).toContain('Aster holds the comet key.');
  });
});
