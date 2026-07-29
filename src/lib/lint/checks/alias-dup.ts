import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';
import { lintText } from '../messages';

/**
 * 過濾佔位字串 — wiki ingest 偶爾把「Aliases: (無)」這種 markdown 佔位符
 * 當成真實別名存進 aliases 陣列，造成 alias-dup 假陽性。
 */
const PLACEHOLDER_ALIASES = new Set<string>([
  '(無)', '（無）', '無', '(none)', '（none）', 'none', 'N/A', 'n/a', '-', '—', '無別名',
]);

function isPlaceholder(s: string): boolean {
  const t = s.trim();
  return !t || PLACEHOLDER_ALIASES.has(t);
}

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
        if (isPlaceholder(k)) continue;
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
        title: lintText(
          ctx,
          `「${name}」同時是 ${labels.join('、')} 的別名或標題`,
          `"${name}" is a title or alias on ${labels.join(', ')}`,
        ),
        detail: lintText(
          ctx,
          `${labels.length} 個 wiki 頁共用名稱「${name}」。Wiki ingest 與 relevance filter 會無法正確區分；請人工合併或調整其中一頁的別名。`,
          `${labels.length} Wiki pages share the name "${name}". Wiki ingest and the relevance filter cannot distinguish them reliably; merge the pages or adjust an alias manually.`,
        ),
        targets: [...uniquePages.entries()].map(([pageId, label]) => ({
          kind: 'wikiPage' as const, id: pageId, label,
        })),
      });
    }
    return { issues };
  },
};
