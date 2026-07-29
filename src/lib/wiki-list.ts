import type { WikiPage, WikiPageType } from '../types';
import type { InterfaceLocale, WritingLanguage } from './language-policy';

const SUMMARY_SLUG_RE = /^ch-(\d+)$/i;
const SUMMARY_RANGE_SIZE = 50;

export interface SummaryRange {
  key: string;
  label: string;
  pages: WikiPage[];
  start: number;
  end: number;
}

export function getSummaryChapterNumber(page: WikiPage): number | null {
  if (page.type !== 'summary') return null;
  const match = SUMMARY_SLUG_RE.exec(page.slug);
  return match ? Number(match[1]) : null;
}

export function compareWikiPagesForList(a: WikiPage, b: WikiPage): number {
  if (a.type === 'summary' && b.type === 'summary') {
    const aNum = getSummaryChapterNumber(a);
    const bNum = getSummaryChapterNumber(b);
    if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
    if (aNum !== null && bNum === null) return -1;
    if (aNum === null && bNum !== null) return 1;
  }

  const titleOrder = a.title.localeCompare(b.title, 'zh-Hant');
  if (titleOrder !== 0) return titleOrder;
  return a.slug.localeCompare(b.slug, 'en');
}

export function formatSummaryPageLabel(page: WikiPage, locale: InterfaceLocale = 'zh-TW'): string {
  const chapterNumber = getSummaryChapterNumber(page);
  if (chapterNumber === null) return page.title;
  return locale === 'en'
    ? `Chapter ${chapterNumber} | ${page.title}`
    : `第 ${chapterNumber} 章｜${page.title}`;
}

export function buildBlankWikiPageContent(
  title: string,
  type: WikiPageType,
  writingLanguage: WritingLanguage,
): string {
  const overviewHeading = writingLanguage === 'en' ? 'Overview' : '概述';
  return `# ${title}\n\n> **Type:** ${type}\n\n## ${overviewHeading}\n\n`;
}

export function buildSummaryRanges(
  pages: WikiPage[],
  locale: InterfaceLocale = 'zh-TW',
): SummaryRange[] {
  const ranges = new Map<number, SummaryRange>();
  for (const page of [...pages].sort(compareWikiPagesForList)) {
    const chapterNumber = getSummaryChapterNumber(page);
    const bucket = chapterNumber === null
      ? Number.MAX_SAFE_INTEGER
      : Math.floor((chapterNumber - 1) / SUMMARY_RANGE_SIZE);
    const start = bucket === Number.MAX_SAFE_INTEGER ? 0 : bucket * SUMMARY_RANGE_SIZE + 1;
    const end = bucket === Number.MAX_SAFE_INTEGER ? 0 : start + SUMMARY_RANGE_SIZE - 1;
    const existing = ranges.get(bucket);
    if (existing) {
      existing.pages.push(page);
    } else {
      ranges.set(bucket, {
        key: bucket === Number.MAX_SAFE_INTEGER ? 'other' : `${start}-${end}`,
        label: bucket === Number.MAX_SAFE_INTEGER
          ? (locale === 'en' ? 'Other Summaries' : '其他摘要')
          : (locale === 'en' ? `Chapters ${start}-${end}` : `第 ${start}-${end} 章`),
        pages: [page],
        start,
        end,
      });
    }
  }
  return [...ranges.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, range]) => range);
}
