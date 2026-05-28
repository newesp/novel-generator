import type { WikiPage } from '../types';
import { renderTemplate } from './prompt-template';

export interface WikiQuerySelectionInput {
  question: string;
  pages: WikiPage[];
  maxPages?: number;
}

export function selectWikiPagesForQuery(input: WikiQuerySelectionInput): WikiPage[] {
  const needles = buildQueryNeedles(input.question);
  const maxPages = input.maxPages ?? 8;
  return input.pages
    .map((page) => ({ page, score: scorePageForQuery(page, needles) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || typeRank(b.page) - typeRank(a.page) || a.page.slug.localeCompare(b.page.slug))
    .slice(0, maxPages)
    .map((item) => item.page);
}

export function buildWikiQueryPrompt(input: {
  question: string;
  pages: WikiPage[];
  template: string;
}): string {
  return renderTemplate(input.template, {
    question: input.question,
    pagesMarkdown: formatPagesMarkdown(input.pages),
  });
}

export function formatPagesMarkdown(pages: WikiPage[]): string {
  if (pages.length === 0) return '(no matching wiki pages)';
  return pages.map((page) => [
    `### ${page.type}/${page.slug} - ${page.title}`,
    page.aliases.length > 0 ? `Aliases: ${page.aliases.join(', ')}` : '',
    page.description,
    page.contentMd,
  ].filter(Boolean).join('\n')).join('\n\n');
}

function buildQueryNeedles(question: string): Set<string> {
  const normalized = question.toLowerCase();
  const needles = new Set<string>();
  for (const word of normalized.match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []) {
    needles.add(word);
  }
  for (const phrase of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i <= phrase.length - size; i += 1) {
        needles.add(phrase.slice(i, i + size));
      }
    }
  }
  return needles;
}

function scorePageForQuery(page: WikiPage, needles: Set<string>): number {
  const title = page.title.toLowerCase();
  const slug = page.slug.toLowerCase();
  const aliases = page.aliases.map((alias) => alias.toLowerCase());
  const body = [page.description, page.contentMd].join('\n').toLowerCase();
  let score = 0;
  for (const needle of needles) {
    if (slug.includes(needle)) score += 10;
    if (title.includes(needle)) score += 8;
    if (aliases.some((alias) => alias.includes(needle))) score += 6;
    if (body.includes(needle)) score += 1;
  }
  return score;
}

function typeRank(page: WikiPage): number {
  switch (page.type) {
    case 'entity': return 5;
    case 'concept': return 4;
    case 'summary': return 3;
    case 'synthesis': return 2;
    case 'compare': return 1;
    default: return 0;
  }
}
