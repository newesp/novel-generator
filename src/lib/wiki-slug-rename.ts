import type { WikiPage, WikiPageRelated, WikiPageType } from '../types';

export interface WikiPageRef {
  type: WikiPageType;
  slug: string;
}

export interface WikiSlugRenamePlan {
  bookId: string;
  pageId: string;
  oldRef: WikiPageRef;
  newRef: WikiPageRef;
  updatedPages: WikiPage[];
  changedPages: WikiPage[];
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function renameWikiSlugInPages(input: {
  pages: WikiPage[];
  pageId: string;
  newSlug: string;
  now?: number;
}): WikiSlugRenamePlan {
  const target = input.pages.find((page) => page.id === input.pageId);
  if (!target) throw new Error(`Wiki page not found: ${input.pageId}`);

  const nextSlug = input.newSlug.trim().toLowerCase();
  if (!SLUG_RE.test(nextSlug)) {
    throw new Error('Invalid slug. Use lowercase ASCII kebab-case, for example ai-li-ya.');
  }

  const oldRef: WikiPageRef = { type: target.type, slug: target.slug };
  const newRef: WikiPageRef = { type: target.type, slug: nextSlug };
  const now = input.now ?? Date.now();

  if (oldRef.slug === newRef.slug) {
    return {
      bookId: target.bookId,
      pageId: target.id,
      oldRef,
      newRef,
      updatedPages: input.pages,
      changedPages: [],
    };
  }

  const collision = input.pages.find(
    (page) =>
      page.bookId === target.bookId &&
      page.type === target.type &&
      page.slug === nextSlug &&
      page.id !== target.id,
  );
  if (collision) {
    throw new Error(`Wiki page already exists: ${target.type}/${nextSlug}`);
  }

  const changedPages: WikiPage[] = [];
  const updatedPages = input.pages.map((page) => {
    if (page.bookId !== target.bookId) return page;

    const nextRelated = rewriteRelatedSlugs(page.relatedSlugs, oldRef, newRef);
    const nextContent = rewriteMarkdownWikiLinks(page.contentMd, oldRef, newRef);
    const nextSlugForPage = page.id === target.id ? nextSlug : page.slug;

    const changed =
      nextSlugForPage !== page.slug ||
      nextRelated !== page.relatedSlugs ||
      nextContent !== page.contentMd;

    if (!changed) return page;

    const updated: WikiPage = {
      ...page,
      slug: nextSlugForPage,
      relatedSlugs: nextRelated,
      contentMd: nextContent,
      updatedAt: now,
    };
    changedPages.push(updated);
    return updated;
  });

  return {
    bookId: target.bookId,
    pageId: target.id,
    oldRef,
    newRef,
    updatedPages,
    changedPages,
  };
}

export function rewriteMarkdownWikiLinks(markdown: string, oldRef: WikiPageRef, newRef: WikiPageRef): string {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, href: string) => {
    const rewritten = rewriteWikiHref(href, oldRef, newRef);
    return rewritten ? `[${label}](${rewritten})` : match;
  });
}

function rewriteRelatedSlugs(
  relatedSlugs: WikiPageRelated[],
  oldRef: WikiPageRef,
  newRef: WikiPageRef,
): WikiPageRelated[] {
  let changed = false;
  const seen = new Set<string>();
  const rewritten: WikiPageRelated[] = [];

  for (const related of relatedSlugs) {
    const next = sameRef(related, oldRef) ? newRef : related;
    if (next !== related) changed = true;

    const key = `${next.type}/${next.slug}`;
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    rewritten.push(next === related ? related : { ...next });
  }

  return changed ? rewritten : relatedSlugs;
}

function rewriteWikiHref(href: string, oldRef: WikiPageRef, newRef: WikiPageRef): string | null {
  const parsed = parseWikiHref(href);
  if (!parsed || !sameRef(parsed.ref, oldRef)) return null;
  return `${parsed.prefix}${newRef.type}/${newRef.slug}${parsed.suffix}`;
}

function parseWikiHref(href: string): { prefix: string; suffix: string; ref: WikiPageRef } | null {
  const trimmed = href.trim();
  const suffixMatch = trimmed.match(/([?#].*)$/);
  const suffix = suffixMatch?.[1] ?? '';
  const path = suffix ? trimmed.slice(0, -suffix.length) : trimmed;
  const prefixMatch = path.match(/^(\.\.\/|\.\/)?/);
  const prefix = prefixMatch?.[1] ?? '';
  const normalized = path.slice(prefix.length);
  const match = normalized.match(/^(concept|entity|summary|compare|synthesis)\/([a-z0-9][a-z0-9-]*)$/);
  if (!match) return null;
  return {
    prefix,
    suffix,
    ref: { type: match[1] as WikiPageType, slug: match[2] },
  };
}

function sameRef(a: WikiPageRef, b: WikiPageRef): boolean {
  return a.type === b.type && a.slug === b.slug;
}
