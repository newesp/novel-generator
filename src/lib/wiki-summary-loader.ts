import type { WikiPage } from '../types';
import { storage } from './storage';
import { getSummaryChapterNumber } from './wiki-list';

const DEFAULT_RECENT_COUNT = 5;
const DEFAULT_MAX_RELEVANT_DISTANT = 5;
const DEFAULT_MAX_CHARS = 6000;
const DEFAULT_ITEM_CHARS = 700;

interface SummaryCandidate {
  page: WikiPage;
  chapterNumber: number;
  score: number;
}

export interface OlderChapterSummaryInput {
  wikiPages: WikiPage[];
  currentChapterOrder: number;
  referenceChapterOrder?: number;
  referenceChapterHasFullContent?: boolean;
  title: string;
  points: string;
  beat: string;
  characterNames: string[];
  recentCount?: number;
  maxChars?: number;
}

export interface LoadOlderChapterSummaryInput extends Omit<OlderChapterSummaryInput, 'wikiPages'> {
  bookId: string;
}

export async function loadOlderChapterSummaryFromWiki(input: LoadOlderChapterSummaryInput): Promise<string> {
  const wikiPages = await storage.wikiPages.list(input.bookId);
  return buildOlderChapterSummaryFromWiki({ ...input, wikiPages });
}

export function buildOlderChapterSummaryFromWiki(input: OlderChapterSummaryInput): string {
  const currentChapterNumber = input.currentChapterOrder + 1;
  const referenceChapterNumber = input.referenceChapterOrder === undefined
    ? null
    : input.referenceChapterOrder + 1;
  const recentCount = input.recentCount ?? DEFAULT_RECENT_COUNT;
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  const needles = buildNeedles([
    input.title,
    input.points,
    input.beat,
    ...input.characterNames,
  ]);

  const candidates = input.wikiPages
    .map((page): SummaryCandidate | null => {
      const chapterNumber = getSummaryChapterNumber(page);
      if (chapterNumber === null || chapterNumber >= currentChapterNumber) return null;
      return {
        page,
        chapterNumber,
        score: scoreSummary(page, needles),
      };
    })
    .filter((candidate): candidate is SummaryCandidate => candidate !== null)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (candidates.length === 0) return '';

  const reference = referenceChapterNumber === null
    ? null
    : candidates.find((candidate) => candidate.chapterNumber === referenceChapterNumber) ?? null;
  const includeReference = !!reference && !input.referenceChapterHasFullContent;
  const referenceKey = reference?.chapterNumber ?? null;
  const recent = candidates
    .filter((candidate) => candidate.chapterNumber !== referenceKey)
    .slice(-recentCount);
  const recentKeys = new Set(recent.map((candidate) => candidate.chapterNumber));
  const distant = candidates
    .filter((candidate) => candidate.chapterNumber !== referenceKey)
    .filter((candidate) => !recentKeys.has(candidate.chapterNumber))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.chapterNumber - a.chapterNumber)
    .slice(0, DEFAULT_MAX_RELEVANT_DISTANT)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const sections: string[] = [];
  if (includeReference && reference) {
    sections.push(formatSection('指定參考章節摘要', [reference]));
  }
  if (recent.length > 0) {
    sections.push(formatSection('近期章節摘要', recent));
  }
  if (distant.length > 0) {
    sections.push(formatSection('遠期伏筆摘要', distant));
  }

  return truncateText(sections.filter(Boolean).join('\n\n'), maxChars);
}

function formatSection(title: string, candidates: SummaryCandidate[]): string {
  const lines = candidates.map(formatCandidate);
  return [`### ${title}`, ...lines].join('\n');
}

function formatCandidate(candidate: SummaryCandidate): string {
  const summary = truncateText(cleanSummaryText(candidate.page), DEFAULT_ITEM_CHARS);
  return `- 第 ${candidate.chapterNumber} 章「${candidate.page.title}」：${summary}`;
}

function cleanSummaryText(page: WikiPage): string {
  const withoutSource = page.contentMd.split(/\n##\s+source\b/i)[0] ?? page.contentMd;
  const lines = withoutSource
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').trim())
    .filter(Boolean);
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  return text || page.description || page.title;
}

function scoreSummary(page: WikiPage, needles: Set<string>): number {
  if (needles.size === 0) return 0;
  const haystack = normalizeText([
    page.title,
    page.description,
    page.contentMd,
    ...page.aliases,
  ].join(' '));
  let score = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) score += needle.length >= 4 ? 2 : 1;
  }
  return score;
}

function buildNeedles(parts: string[]): Set<string> {
  const needles = new Set<string>();
  for (const part of parts) {
    const normalized = normalizeText(part);
    for (const word of normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []) {
      needles.add(word);
    }
    for (const phrase of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
      addCjkNgrams(needles, phrase, 2);
      addCjkNgrams(needles, phrase, 3);
      if (phrase.length <= 8) needles.add(phrase);
    }
  }
  return needles;
}

function addCjkNgrams(needles: Set<string>, phrase: string, size: number): void {
  for (let i = 0; i <= phrase.length - size; i += 1) {
    needles.add(phrase.slice(i, i + size));
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}
