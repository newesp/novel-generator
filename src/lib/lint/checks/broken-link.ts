import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';
import type { WikiPage, WikiPageType } from '../../../types';

export const brokenLinkCheck: LintCheck = {
  id: 'broken-link',
  label: 'Broken link',
  kind: 'structural',
  async run(ctx: LintContext) {
    const pageMap = new Map<string, true>();
    for (const p of ctx.pages) pageMap.set(`${p.type}/${p.slug}`, true);

    const issues: LintIssue[] = [];
    for (const page of ctx.pages) {
      const seen = new Set<string>();
      for (const rel of page.relatedSlugs) {
        const key = `${rel.type}/${rel.slug}`;
        if (pageMap.has(key)) continue;
        seen.add(key);
        issues.push({
          id: uuid(),
          checkId: 'broken-link',
          severity: 'warn',
          status: 'open',
          title: `${page.type}/${page.slug} 的 relatedSlugs 指向不存在的 ${key}`,
          detail: `頁 ${page.type}/${page.slug}（${page.title}）的 relatedSlugs 引用了 ${key}，但該頁不存在。`,
          targets: [
            { kind: 'wikiPage', id: page.id, label: `${page.type}/${page.slug}` },
          ],
          fix: { kind: 'removeRelatedSlug', pageId: page.id, target: { type: rel.type, slug: rel.slug } },
        });
      }
      for (const { label, target } of extractWikiMarkdownLinks(page.contentMd)) {
        const key = `${target.type}/${target.slug}`;
        if (pageMap.has(key) || seen.has(key)) continue;
        seen.add(key);
        const renameCandidate = findRenameCandidate(ctx.pages, target.type, label);
        issues.push({
          id: uuid(),
          checkId: 'broken-link',
          severity: 'warn',
          status: 'open',
          title: `${page.type}/${page.slug} 的 markdown link 指向不存在的 ${key}`,
          detail: `頁 ${page.type}/${page.slug}（${page.title}）的 markdown 連結引用了 ${key}，但該頁不存在。`,
          targets: [
            { kind: 'wikiPage', id: page.id, label: `${page.type}/${page.slug}` },
            ...(renameCandidate ? [{ kind: 'wikiPage' as const, id: renameCandidate.id, label: `${renameCandidate.type}/${renameCandidate.slug}` }] : []),
          ],
          fix: renameCandidate
            ? { kind: 'renameWikiSlug', pageId: renameCandidate.id, newSlug: target.slug }
            : { kind: 'removeRelatedSlug', pageId: page.id, target },
        });
      }
    }
    return { issues };
  },
};

function extractWikiMarkdownLinks(markdown: string): Array<{ label: string; target: { type: WikiPageType; slug: string } }> {
  const out: Array<{ label: string; target: { type: WikiPageType; slug: string } }> = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown)) !== null) {
    const target = parseWikiHref(match[2]);
    if (target) out.push({ label: match[1].trim(), target });
  }
  return out;
}

function findRenameCandidate(pages: WikiPage[], type: WikiPageType, label: string): WikiPage | null {
  if (!label) return null;
  const matches = pages.filter((page) =>
    page.type === type &&
    (page.title === label || page.aliases.some((alias) => alias === label)),
  );
  return matches.length === 1 ? matches[0] : null;
}

function parseWikiHref(href: string): { type: WikiPageType; slug: string } | null {
  const normalized = href
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\.\.\//, '')
    .replace(/[#?].*$/, '');
  const match = /^(concept|entity|summary|compare|synthesis)\/([a-z0-9-]+)$/i.exec(normalized);
  if (!match) return null;
  return { type: match[1].toLowerCase() as WikiPageType, slug: match[2] };
}
