import { v4 as uuid } from 'uuid';
import type { WikiLogEntry, WikiPage, WikiPageRelated, WikiPageType } from '../types';
import { storage } from './storage';
import { parseWikiPageMarkdown } from './wiki-parser';
import { sanitizeWikiRelatedRefs } from './wiki-related-sanitize';

export interface DeleteWikiPageCascadePlan {
  bookId: string;
  deletedPage: WikiPage;
  changedPages: WikiPage[];
}

export function normalizeWikiPageForSave(input: {
  page: WikiPage;
  pages: WikiPage[];
  now?: number;
}): WikiPage {
  const now = input.now ?? Date.now();
  const parsed = parseWikiPageMarkdown(input.page.contentMd, input.page.title);
  const allowedRefs = refsForPages(input.pages.filter((page) => page.bookId === input.page.bookId));
  allowedRefs.add(refKey(input.page));
  const sanitized = sanitizeWikiRelatedRefs({
    markdown: parsed.contentMd,
    relatedSlugs: parsed.relatedSlugs,
    allowedRefs,
  });

  return {
    ...input.page,
    title: parsed.title || input.page.title,
    aliases: parsed.aliases.length ? parsed.aliases : input.page.aliases,
    relatedSlugs: sanitized.relatedSlugs,
    description: parsed.fallbackDescription || input.page.description,
    contentMd: sanitized.contentMd,
    updatedAt: now,
  };
}

export function planDeleteWikiPageCascade(input: {
  pages: WikiPage[];
  pageId: string;
  now?: number;
}): DeleteWikiPageCascadePlan {
  const deletedPage = input.pages.find((page) => page.id === input.pageId);
  if (!deletedPage) throw new Error(`Wiki page not found: ${input.pageId}`);

  const now = input.now ?? Date.now();
  const target = { type: deletedPage.type, slug: deletedPage.slug };
  const allowedRefs = refsForPages(
    input.pages.filter((page) => page.bookId === deletedPage.bookId && page.id !== deletedPage.id),
  );
  const changedPages: WikiPage[] = [];

  for (const page of input.pages) {
    if (page.bookId !== deletedPage.bookId || page.id === deletedPage.id) continue;

    const nextRelated = page.relatedSlugs.filter((ref) => !sameRef(ref, target));
    const contentWithoutTarget = removeWikiLinksToTarget(page.contentMd, target);
    const sanitized = sanitizeWikiRelatedRefs({
      markdown: contentWithoutTarget,
      relatedSlugs: nextRelated,
      allowedRefs,
    });

    const changed =
      nextRelated.length !== page.relatedSlugs.length ||
      sanitized.contentMd !== page.contentMd ||
      sanitized.relatedSlugs.length !== page.relatedSlugs.length;

    if (!changed) continue;
    changedPages.push({
      ...page,
      relatedSlugs: sanitized.relatedSlugs,
      contentMd: sanitized.contentMd,
      updatedAt: now,
    });
  }

  return { bookId: deletedPage.bookId, deletedPage, changedPages };
}

export async function updateWikiPageWithIntegrity(input: {
  page: WikiPage;
  source: string;
  summary?: string;
  batchId?: string;
}): Promise<WikiPage> {
  const pages = await storage.wikiPages.list(input.page.bookId);
  const before = pages.find((page) => page.id === input.page.id) ?? null;
  const pagePool = before
    ? pages.map((page) => page.id === input.page.id ? input.page : page)
    : [...pages, input.page];
  const after = normalizeWikiPageForSave({ page: input.page, pages: pagePool });
  const logEntry = buildLogEntry({
    bookId: after.bookId,
    batchId: input.batchId ?? uuid(),
    kind: before ? 'update' : 'create',
    page: after,
    before,
    after,
    source: input.source,
    summary: input.summary ?? `${before ? '~' : '+'}${after.type}/${after.slug}`,
  });

  await storage.wikiLog.add(logEntry);
  if (before) await storage.wikiPages.update(after);
  else await storage.wikiPages.add(after);
  return after;
}

export async function deleteWikiPageCascade(input: {
  pageId: string;
  source?: string;
  batchId?: string;
}): Promise<DeleteWikiPageCascadePlan> {
  const selected = await storage.wikiPages.get(input.pageId);
  if (!selected) throw new Error(`Wiki page not found: ${input.pageId}`);

  const pages = await storage.wikiPages.list(selected.bookId);
  const plan = planDeleteWikiPageCascade({ pages, pageId: input.pageId });
  const beforeById = new Map(pages.map((page) => [page.id, page]));
  const batchId = input.batchId ?? uuid();
  const source = input.source ?? `delete:${input.pageId}`;

  for (const changed of plan.changedPages) {
    const before = beforeById.get(changed.id) ?? null;
    await storage.wikiLog.add(buildLogEntry({
      bookId: changed.bookId,
      batchId,
      kind: 'update',
      page: changed,
      before,
      after: changed,
      source,
      summary: `~${changed.type}/${changed.slug} remove refs to ${plan.deletedPage.type}/${plan.deletedPage.slug}`,
    }));
    await storage.wikiPages.update(changed);
  }

  await storage.wikiLog.add(buildLogEntry({
    bookId: plan.deletedPage.bookId,
    batchId,
    kind: 'delete',
    page: plan.deletedPage,
    before: plan.deletedPage,
    after: null,
    source,
    summary: `-${plan.deletedPage.type}/${plan.deletedPage.slug}`,
  }));
  await storage.wikiPages.delete(plan.deletedPage.id);

  return plan;
}

function removeWikiLinksToTarget(markdown: string, target: WikiPageRelated): string {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label: string, href: string) => {
    const parsed = parseWikiHref(href);
    if (!parsed || !sameRef(parsed, target)) return full;
    return label;
  });
}

function parseWikiHref(href: string): WikiPageRelated | null {
  const normalized = href
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\.\.\//, '')
    .replace(/[#?].*$/, '')
    .replace(/\.md$/i, '');
  const match = /^(concept|entity|summary|compare|synthesis)\/([a-z0-9][a-z0-9-]*)$/i.exec(normalized);
  if (!match) return null;
  return { type: match[1].toLowerCase() as WikiPageType, slug: match[2] };
}

function refsForPages(pages: WikiPage[]): Set<string> {
  return new Set(pages.map(refKey));
}

function refKey(ref: WikiPageRelated): string {
  return `${ref.type}/${ref.slug}`;
}

function sameRef(a: WikiPageRelated, b: WikiPageRelated): boolean {
  return a.type === b.type && a.slug === b.slug;
}

function buildLogEntry(input: {
  bookId: string;
  batchId: string;
  kind: WikiLogEntry['kind'];
  page: WikiPage;
  before: WikiPage | null;
  after: WikiPage | null;
  source: string;
  summary: string;
}): WikiLogEntry {
  return {
    id: uuid(),
    bookId: input.bookId,
    batchId: input.batchId,
    appliedAt: Date.now(),
    kind: input.kind,
    opStatus: 'ok',
    pageId: input.page.id,
    pageType: input.page.type,
    pageSlug: input.page.slug,
    pageSnapshotBefore: input.before,
    pageSnapshotAfter: input.after,
    source: input.source,
    summary: input.summary,
  };
}
