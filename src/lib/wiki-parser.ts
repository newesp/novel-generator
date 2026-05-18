/**
 * 解析 Apply LLM 輸出的完整頁面 markdown，產出可寫入 wiki_pages 的欄位。
 *
 * 規範：spec §4.3
 *   - 第一行 `# <Title>` 是顯示標題
 *   - 第一段 `> ` blockquote（連續 `> ` 行）含 `**Type:** ...`, `**Aliases:** ...`, `**Related:** ...`
 *   - 第一個 `## <section>` 之後是 prose
 *   - 全文 = contentMd
 *
 * 容錯：blockquote 不存在時 metadata 用 defaults；# Title 行不存在用 fallbackTitle。
 */
import type { WikiPageType, WikiPageRelated } from '../types';

export interface ParsedWikiPage {
  title: string;
  aliases: string[];
  relatedSlugs: WikiPageRelated[];
  /** 從第一段純 prose 取的 1-line description（給 index 用，60 字截斷） */
  fallbackDescription: string;
  contentMd: string;
}

const TYPES: readonly WikiPageType[] =
  ['concept', 'entity', 'summary', 'compare', 'synthesis'] as const;

export function parseWikiPageMarkdown(md: string, fallbackTitle = '(未命名)'): ParsedWikiPage {
  const lines = md.split(/\r?\n/);
  let title = fallbackTitle;
  const aliases: string[] = [];
  const relatedSlugs: WikiPageRelated[] = [];

  // 1) Title
  const h1Idx = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (h1Idx >= 0) title = lines[h1Idx].replace(/^#\s+/, '').trim();

  // 2) Blockquote metadata（h1 之後、第一個 ## 之前）
  const h2Idx = lines.findIndex((l, i) => i > h1Idx && /^##\s+/.test(l));
  const metaEnd = h2Idx >= 0 ? h2Idx : lines.length;
  for (let i = h1Idx + 1; i < metaEnd; i++) {
    const line = lines[i];
    if (!/^>/.test(line)) continue;
    const stripped = line.replace(/^>\s?/, '');
    // **Aliases:** 小李, 老李
    const ma = stripped.match(/^\*\*Aliases:\*\*\s*(.+)$/);
    if (ma) {
      ma[1].split(/[，,]/).map((s) => s.trim()).filter(Boolean).forEach((a) => aliases.push(a));
      continue;
    }
    // **Related:** [Foo](../entity/foo.md), [Bar](concept/bar.md)
    const mr = stripped.match(/^\*\*Related:\*\*\s*(.+)$/);
    if (mr) {
      const refs = mr[1].matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
      for (const r of refs) {
        const parsed = parseRelatedRef(r[1]);
        if (parsed) relatedSlugs.push(parsed);
      }
      continue;
    }
    // **Type:** entity   ← 我們已知 type，不用回填，但容錯保留
  }

  // 3) Fallback description：第一段純 prose（非 #, 非 >）的前 60 字
  let proseStart = h2Idx >= 0 ? h2Idx + 1 : metaEnd;
  if (h1Idx < 0) proseStart = 0; // no title at all; scan from start
  while (proseStart < lines.length && !lines[proseStart].trim()) proseStart++;
  let paragraph = '';
  for (let i = proseStart; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) break;
    if (/^[#>\-*]/.test(l)) break;
    paragraph += (paragraph ? ' ' : '') + l;
  }
  const fallbackDescription =
    paragraph.length > 60 ? paragraph.slice(0, 60) + '…' : paragraph;

  return { title, aliases, relatedSlugs, fallbackDescription, contentMd: md };
}

/** 解析 markdown link 內的路徑為 {type, slug} — 例如 "../entity/foo.md" → {entity, foo} */
function parseRelatedRef(href: string): WikiPageRelated | null {
  // 支援 `entity/foo.md`、`../entity/foo.md`、`./entity/foo.md`、`entity/foo`
  const cleaned = href.replace(/^\.\.?\//, '').replace(/\.md$/, '');
  const parts = cleaned.split('/');
  if (parts.length < 2) return null;
  const type = parts[parts.length - 2];
  const slug = parts[parts.length - 1];
  if (!TYPES.includes(type as WikiPageType)) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  return { type: type as WikiPageType, slug };
}
