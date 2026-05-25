import { v4 as uuid } from 'uuid';
import type { LintCheck, LintContext, LintIssue } from '../types';

/**
 * Summary mismatch — 偵測 summary/ch-N 頁與對應章節的對不上：
 *
 *   - summary/ch-N 的 title 應該等於該章節的 title
 *   - summary/ch-N 應該對應到 chapter[order=N-1]，否則該 summary 是孤兒
 *
 * 觸發情境：章節改名後 wiki summary 沒重新 ingest；或章節順序變動造成
 * summary 對應錯位（codex review 採納：spec §4 沒提這個對不上類別）。
 *
 * fix: 提供 LLM hint，由使用者按「✏️ 修改」修正 summary 內容
 */
const SLUG_RE = /^ch-(\d+)$/;

export const summaryMismatchCheck: LintCheck = {
  id: 'summary-mismatch',
  label: 'Summary 章節對不上',
  kind: 'structural',
  async run(ctx: LintContext) {
    const issues: LintIssue[] = [];

    // chapter order 對 chapter 的快取
    const chaptersByOrder = new Map<number, typeof ctx.chapters[number]>();
    for (const c of ctx.chapters) chaptersByOrder.set(c.order, c);

    for (const page of ctx.pages) {
      if (page.type !== 'summary') continue;
      const m = page.slug.match(SLUG_RE);
      if (!m) continue;   // 不是 ch-N 樣式的 summary 不檢查
      const ordinal = parseInt(m[1], 10);
      const expectedOrder = ordinal - 1;
      const chapter = chaptersByOrder.get(expectedOrder);

      if (!chapter) {
        issues.push({
          id: uuid(),
          checkId: 'summary-mismatch',
          severity: 'warn',
          status: 'open',
          title: `summary/${page.slug} 沒有對應的章節（order ${expectedOrder} 不存在）`,
          detail: `summary 頁 ${page.slug}（title「${page.title}」）按 slug 推斷應對應第 ${ordinal} 章（order ${expectedOrder}），但該章節已不存在。可能是章節被刪除或順序變動造成。`,
          targets: [
            { kind: 'wikiPage', id: page.id, label: `summary/${page.slug}` },
          ],
          fix: { kind: 'llm' },
        });
        continue;
      }

      // 比 title
      if (chapter.title && chapter.title !== page.title) {
        issues.push({
          id: uuid(),
          checkId: 'summary-mismatch',
          severity: 'warn',
          status: 'open',
          title: `summary/${page.slug} 標題與章節不一致`,
          detail: `summary 頁標題為「${page.title}」，但第 ${ordinal} 章（order ${expectedOrder}）實際標題為「${chapter.title}」。章節改名後 summary 沒重新存入 Wiki，或順序變動造成錯位。`,
          targets: [
            { kind: 'wikiPage', id: page.id, label: `summary/${page.slug}` },
            { kind: 'chapter', id: chapter.id, label: `章節 ${chapter.title}` },
          ],
          fix: { kind: 'llm' },
        });
      }
    }
    return { issues };
  },
};
