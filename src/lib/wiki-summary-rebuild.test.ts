import { describe, expect, it } from 'vitest';
import { buildSummaryRebuildPrompt } from './wiki-summary-rebuild';
import type { Chapter } from '../types';

function chapter(partial: Partial<Chapter>): Chapter {
  return {
    id: partial.id ?? 'c1',
    projectId: 'book',
    order: partial.order ?? 0,
    title: partial.title ?? 'Comet Oath',
    targetWords: null,
    beat: partial.beat ?? 'Midpoint',
    points: partial.points ?? 'Aster makes a promise.',
    content: partial.content ?? 'Aster promises Mira to guard the comet key.',
    referenceChapterId: null,
    wikiSyncedAt: null,
    wikiSyncedHash: null,
    wikiSyncStatus: 'synced',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('wiki summary rebuild', () => {
  it('builds a prompt for updating the wiki summary page', () => {
    const prompt = buildSummaryRebuildPrompt({
      chapter: chapter({ order: 4, title: 'Return to the Gate' }),
      charactersList: 'Aster, Mira',
    });

    expect(prompt).toContain('summary/ch-5');
    expect(prompt).toContain('Return to the Gate');
    expect(prompt).toContain('Aster, Mira');
    expect(prompt).toContain('Wiki summary page');
  });
});
