import type { Chapter, WikiPage } from '../types';
import { getSummaryChapterNumber } from './wiki-list';

export type SummaryQualityStatus = 'missing' | 'poor' | 'ok' | 'good';

export interface SummaryQualityResult {
  status: SummaryQualityStatus;
  needsRebuild: boolean;
  reasons: string[];
  slug: string;
}

export interface SummaryRebuildPlanItem {
  chapter: Chapter;
  slug: string;
  summaryPage: WikiPage | null;
  quality: SummaryQualityResult;
}

const MIN_SUMMARY_CHARS = 80;
const STORY_SIGNAL_RE = /(after|before|because|therefore|promise|vow|clue|later|changes|reveals|hidden|事件|之後|之前|因為|因此|導致|承諾|誓言|伏筆|線索|揭露|改變)/i;

export function evaluateSummaryQuality(input: {
  chapter: Chapter;
  summaryPage: WikiPage | null;
}): SummaryQualityResult {
  const slug = summarySlugForChapter(input.chapter);
  if (!input.summaryPage) {
    return { status: 'missing', needsRebuild: true, reasons: ['missing-summary'], slug };
  }

  const reasons: string[] = [];
  const page = input.summaryPage;
  const expectedNumber = input.chapter.order + 1;
  if (page.slug !== slug || getSummaryChapterNumber(page) !== expectedNumber) reasons.push('slug-mismatch');
  if (page.title.trim() !== input.chapter.title.trim()) reasons.push('title-mismatch');

  const text = normalizeSummaryText(page);
  if (text.length < MIN_SUMMARY_CHARS) reasons.push('too-short');
  if (!STORY_SIGNAL_RE.test(text)) reasons.push('weak-story-signals');

  const status: SummaryQualityStatus =
    reasons.includes('slug-mismatch') || reasons.includes('title-mismatch') || reasons.length >= 2
      ? 'poor'
      : reasons.length === 1
        ? 'ok'
        : 'good';

  return {
    status,
    needsRebuild: status === 'poor',
    reasons,
    slug,
  };
}

export function buildSummaryRebuildPlan(input: {
  chapters: Chapter[];
  summaryPages: WikiPage[];
}): SummaryRebuildPlanItem[] {
  const summaries = new Map<string, WikiPage>();
  for (const page of input.summaryPages) {
    if (page.type === 'summary') summaries.set(page.slug, page);
  }

  return [...input.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => {
      const slug = summarySlugForChapter(chapter);
      const summaryPage = summaries.get(slug) ?? null;
      const quality = evaluateSummaryQuality({ chapter, summaryPage });
      return { chapter, slug, summaryPage, quality };
    })
    .filter((item) => item.quality.needsRebuild);
}

export function summarySlugForChapter(chapter: Chapter): string {
  return `ch-${chapter.order + 1}`;
}

function normalizeSummaryText(page: WikiPage): string {
  return [page.description, page.contentMd]
    .join('\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
