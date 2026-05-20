import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';

export const aliasDupCheck: LintCheck = {
  id: 'alias-dup',
  label: '別名重複',
  kind: 'structural',
  async run(ctx: LintContext) {
    // alias / title → 出現於哪些頁
    const map = new Map<string, Array<{ pageId: string; label: string }>>();
    for (const p of ctx.pages) {
      const keys = [p.title, ...p.aliases];
      for (const k of keys) {
        if (!k) continue;
        const list = map.get(k) ?? [];
        list.push({ pageId: p.id, label: `${p.type}/${p.slug}` });
        map.set(k, list);
      }
    }

    const issues: LintIssue[] = [];
    for (const [name, owners] of map.entries()) {
      // 排除同頁多 alias 撞自己 title 的情況：取不同 pageId
      const uniquePages = new Map<string, string>();
      for (const o of owners) uniquePages.set(o.pageId, o.label);
      if (uniquePages.size < 2) continue;
      const labels = [...uniquePages.values()];
      issues.push({
        id: uuid(),
        checkId: 'alias-dup',
        severity: 'error',
        status: 'open',
        title: `「${name}」同時是 ${labels.join('、')} 的別名或標題`,
        detail: `${labels.length} 個 wiki 頁共用名稱「${name}」。Wiki ingest 與 relevance filter 會無法正確區分；請人工合併或調整其中一頁的別名。`,
        targets: [...uniquePages.entries()].map(([pageId, label]) => ({
          kind: 'wikiPage' as const, id: pageId, label,
        })),
      });
    }
    return { issues };
  },
};
