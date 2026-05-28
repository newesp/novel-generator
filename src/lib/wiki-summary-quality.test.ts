import { describe, expect, it } from 'vitest';
import { buildSummaryRebuildPlan, evaluateSummaryQuality } from './wiki-summary-quality';
import type { Chapter, WikiPage } from '../types';

function chapter(partial: Partial<Chapter>): Chapter {
  return {
    id: partial.id ?? `ch-${partial.order ?? 0}`,
    projectId: 'book',
    order: partial.order ?? 0,
    title: partial.title ?? 'Chapter',
    targetWords: null,
    beat: '',
    points: '',
    content: partial.content ?? 'Chapter content',
    referenceChapterId: null,
    wikiSyncedAt: null,
    wikiSyncedHash: null,
    wikiSyncStatus: 'synced',
    createdAt: 0,
    updatedAt: 0,
  };
}

function summary(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? partial.slug ?? 's',
    bookId: 'book',
    type: 'summary',
    slug: partial.slug ?? 'ch-1',
    title: partial.title ?? 'Chapter',
    aliases: [],
    relatedSlugs: [],
    description: partial.description ?? '',
    contentMd: partial.contentMd ?? '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('wiki summary quality', () => {
  it('marks missing summary pages as rebuild-required', () => {
    const result = evaluateSummaryQuality({ chapter: chapter({ order: 2, title: 'Return' }), summaryPage: null });

    expect(result.status).toBe('missing');
    expect(result.needsRebuild).toBe(true);
    expect(result.reasons).toContain('missing-summary');
  });

  it('flags title mismatch and thin content', () => {
    const result = evaluateSummaryQuality({
      chapter: chapter({ order: 0, title: 'Correct Title' }),
      summaryPage: summary({ slug: 'ch-1', title: 'Wrong Title', contentMd: 'Too short.' }),
    });

    expect(result.status).toBe('poor');
    expect(result.needsRebuild).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['title-mismatch', 'too-short', 'weak-story-signals']));
  });

  it('accepts summaries with event, character, and hook signals', () => {
    const result = evaluateSummaryQuality({
      chapter: chapter({ order: 0, title: 'Comet Oath' }),
      summaryPage: summary({
        slug: 'ch-1',
        title: 'Comet Oath',
        contentMd: 'Aster makes a promise after the comet falls. The vow changes Mira and leaves a hidden clue for later.',
      }),
    });

    expect(result.status).toBe('good');
    expect(result.needsRebuild).toBe(false);
  });

  it('builds a rebuild plan in chapter order', () => {
    const plan = buildSummaryRebuildPlan({
      chapters: [
        chapter({ id: 'c2', order: 1, title: 'Second' }),
        chapter({ id: 'c1', order: 0, title: 'First' }),
      ],
      summaryPages: [
        summary({ slug: 'ch-1', title: 'First', contentMd: 'Aster makes a promise after the comet falls. The vow changes Mira and leaves a hidden clue for later.' }),
      ],
    });

    expect(plan.map((item) => item.chapter.id)).toEqual(['c2']);
    expect(plan[0].slug).toBe('ch-2');
    expect(plan[0].quality.status).toBe('missing');
  });
});
