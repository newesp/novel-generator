import { describe, expect, it } from 'vitest';
import {
  buildBlankWikiPageContent,
  buildSummaryRanges,
  compareWikiPagesForList,
  formatSummaryPageLabel,
  getSummaryChapterNumber,
} from './wiki-list';
import type { WikiPage } from '../types';

function page(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? partial.slug ?? 'p',
    bookId: 'book',
    type: partial.type ?? 'summary',
    slug: partial.slug ?? 'ch-1',
    title: partial.title ?? '未命名',
    aliases: [],
    relatedSlugs: [],
    description: '',
    contentMd: '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('wiki list helpers', () => {
  it('extracts chapter numbers from summary slugs', () => {
    expect(getSummaryChapterNumber(page({ slug: 'ch-12' }))).toBe(12);
    expect(getSummaryChapterNumber(page({ slug: 'chapter-12' }))).toBeNull();
  });

  it('sorts summary pages by numeric chapter order', () => {
    const pages = [
      page({ slug: 'ch-4', title: '第四章' }),
      page({ slug: 'ch-2', title: '第二章' }),
      page({ slug: 'ch-10', title: '第十章' }),
      page({ slug: 'ch-3', title: '第三章' }),
    ].sort(compareWikiPagesForList);

    expect(pages.map((p) => p.slug)).toEqual(['ch-2', 'ch-3', 'ch-4', 'ch-10']);
  });

  it('formats summary labels with chapter number first', () => {
    expect(formatSummaryPageLabel(page({ slug: 'ch-3', title: '塵埃的邀約' }))).toBe('第 3 章｜塵埃的邀約');
    expect(formatSummaryPageLabel(page({ slug: 'intro', title: '序章' }))).toBe('序章');
  });

  it('formats summary labels for the English interface', () => {
    expect(formatSummaryPageLabel(page({ slug: 'ch-3', title: 'Dust Invitation' }), 'en'))
      .toBe('Chapter 3 | Dust Invitation');
    expect(formatSummaryPageLabel(page({ slug: 'intro', title: 'Prologue' }), 'en'))
      .toBe('Prologue');
  });

  it('splits long summary lists into 50-chapter ranges', () => {
    const pages = Array.from({ length: 121 }, (_, i) => page({ slug: `ch-${i + 1}` }));

    expect(buildSummaryRanges(pages).map((range) => ({
      label: range.label,
      count: range.pages.length,
    }))).toEqual([
      { label: '第 1-50 章', count: 50 },
      { label: '第 51-100 章', count: 50 },
      { label: '第 101-150 章', count: 21 },
    ]);
  });

  it('formats summary ranges for the English interface', () => {
    const pages = Array.from({ length: 51 }, (_, i) => page({ slug: `ch-${i + 1}` }));
    expect(buildSummaryRanges(pages, 'en').map((range) => range.label))
      .toEqual(['Chapters 1-50', 'Chapters 51-100']);
  });

  it('builds new Wiki page content in the book writing language', () => {
    expect(buildBlankWikiPageContent('Aster', 'entity', 'en'))
      .toBe('# Aster\n\n> **Type:** entity\n\n## Overview\n\n');
    expect(buildBlankWikiPageContent('星河', 'concept', 'zh-Hant'))
      .toBe('# 星河\n\n> **Type:** concept\n\n## 概述\n\n');
  });
});
