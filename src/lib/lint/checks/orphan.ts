import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';
import { lintText } from '../messages';

export const orphanCheck: LintCheck = {
  id: 'orphan',
  label: '孤頁',
  kind: 'structural',
  async run(ctx: LintContext) {
    // 反向引用集：所有 page 的 relatedSlugs 合集
    const reverseRef = new Set<string>();
    for (const p of ctx.pages) {
      for (const r of p.relatedSlugs) reverseRef.add(`${r.type}/${r.slug}`);
    }

    // 預先合併所有章節 content（一次性掃描，比每頁掃 N 次快）
    const allChapterContent = ctx.chapters.map((c) => c.content).join('\n---\n');

    const issues: LintIssue[] = [];
    for (const page of ctx.pages) {
      const key = `${page.type}/${page.slug}`;
      if (reverseRef.has(key)) continue;

      // 看 title 或任何 alias 是否在章節 content 出現
      const needles = [page.title, ...page.aliases].filter((n) => n && n.length >= 2);
      const mentionedInChapter = needles.some((n) => allChapterContent.includes(n));
      if (mentionedInChapter) continue;

      issues.push({
        id: uuid(),
        checkId: 'orphan',
        severity: 'info',
        status: 'open',
        title: lintText(ctx, `${key} 沒被任何頁或章節引用`, `${key} is not referenced by any page or chapter`),
        detail: lintText(
          ctx,
          `頁 ${key}（${page.title}）的 title 與 aliases 都未在其他 wiki 頁的 relatedSlugs、也未在任何章節正文中出現。可能是未登場的伏筆、也可能是廢頁；請人工判斷。`,
          `Neither the title nor aliases of ${key} (${page.title}) appear in another Wiki page's relatedSlugs or in any chapter text. It may be an unrevealed plot element or an obsolete page; review it manually.`,
        ),
        targets: [
          { kind: 'wikiPage', id: page.id, label: key },
        ],
        // 無 fix（codex review：孤頁不一鍵刪）
      });
    }
    return { issues };
  },
};
