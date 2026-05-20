import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';

export const brokenLinkCheck: LintCheck = {
  id: 'broken-link',
  label: 'Broken link',
  kind: 'structural',
  async run(ctx: LintContext) {
    const pageMap = new Map<string, true>();
    for (const p of ctx.pages) pageMap.set(`${p.type}/${p.slug}`, true);

    const issues: LintIssue[] = [];
    for (const page of ctx.pages) {
      for (const rel of page.relatedSlugs) {
        const key = `${rel.type}/${rel.slug}`;
        if (pageMap.has(key)) continue;
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
    }
    return { issues };
  },
};
