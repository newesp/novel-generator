import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import { buildDigest } from '../digest';
import type { WikiPage, WikiPageType } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';
import { lintText } from '../messages';
import type { InterfaceLocale } from '../../language-policy';

export interface ContradictResult {
  conflicts: Array<{
    pages: string[];   // ["type/slug", ...]
    field: string;
    detail: string;
  }>;
}

export function parseContradictJson(
  raw: string,
  interfaceLocale: InterfaceLocale = 'zh-TW',
): ContradictResult {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) {
    throw new Error(lintText(interfaceLocale, 'LLM 回應不含 JSON', 'The LLM response contains no JSON'));
  }
  const j = JSON.parse(s.slice(start, end + 1));
  return { conflicts: Array.isArray(j.conflicts) ? j.conflicts : [] };
}

const ALL_TYPES: WikiPageType[] = ['entity', 'concept', 'summary', 'compare', 'synthesis'];

export const wikiContradictCheck: LintCheck = {
  id: 'wikiContradict',
  label: 'Wiki 內部矛盾',
  kind: 'llm',
  async run(ctx: LintContext) {
    const issues: LintIssue[] = [];
    const unprocessed: Array<{ reason: string }> = [];

    for (const type of ALL_TYPES) {
      const pagesOfType = ctx.pages.filter((p) => p.type === type);
      if (pagesOfType.length < 2) continue;   // <2 頁就沒矛盾可言

      const cap = ctx.prefs.maxPagesPerTypeContradict;
      const sorted = [...pagesOfType].sort((a, b) => b.updatedAt - a.updatedAt);
      const subset = sorted.slice(0, cap);
      if (sorted.length > cap) {
        unprocessed.push({
          reason: lintText(
            ctx,
            `${type}：共 ${sorted.length} 頁，僅檢查最近更新的 ${cap} 頁；剩 ${sorted.length - cap} 頁未檢查`,
            `${type}: ${sorted.length} pages total; only the ${cap} most recently updated pages were checked. ${sorted.length - cap} pages were not checked.`,
          ),
        });
      }

      const digests = subset.map((p) => buildDigest(p));

      const prompt = renderTemplate(ctx.aiPrompts.lintWikiContradictTemplate, {
        pageType: type,
        digestsJson: JSON.stringify(digests, null, 2),
      });

      let raw: string;
      try {
        raw = await complete(prompt, { maxTokens: 2048 }, ctx.signal);
      } catch (e) {
        throw new Error(lintText(
          ctx,
          `Wiki 內部矛盾 LLM (${type}) 失敗：${(e as Error).message}`,
          `Internal Wiki contradiction LLM (${type}) failed: ${(e as Error).message}`,
        ), { cause: e });
      }

      let parsed: ContradictResult;
      try {
        parsed = parseContradictJson(raw, ctx.interfaceLocale);
      } catch {
        raw = await complete(prompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 }, ctx.signal);
        parsed = parseContradictJson(raw, ctx.interfaceLocale);
      }

      const pageBySlug = new Map<string, WikiPage>();
      for (const p of subset) pageBySlug.set(`${p.type}/${p.slug}`, p);

      for (const c of parsed.conflicts) {
        const targets: IssueTarget[] = [];
        for (const ref of c.pages) {
          const p = pageBySlug.get(ref);
          if (!p) continue;
          targets.push({ kind: 'wikiPage', id: p.id, label: ref });
        }
        if (targets.length === 0) continue;
        issues.push({
          id: uuid(),
          checkId: 'wikiContradict',
          severity: 'error',
          status: 'open',
          title: lintText(
            ctx,
            `${targets.map((t) => t.label).join(' 與 ')} 的「${c.field}」欄位衝突`,
            `Conflict in field "${c.field}" between ${targets.map((t) => t.label).join(' and ')}`,
          ),
          detail: c.detail,
          targets,
          fix: { kind: 'llm' },
        });
      }
    }
    return { issues, unprocessed };
  },
};
