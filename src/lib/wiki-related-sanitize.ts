import type { WikiPageRelated, WikiPageType } from '../types';

interface SanitizeInput {
  markdown: string;
  relatedSlugs: WikiPageRelated[];
  allowedRefs: Set<string>;
}

interface SanitizeResult {
  contentMd: string;
  relatedSlugs: WikiPageRelated[];
}

const WIKI_TYPES = '(concept|entity|summary|compare|synthesis)';

export function sanitizeWikiRelatedRefs(input: SanitizeInput): SanitizeResult {
  const relatedSlugs = dedupeRelated(
    input.relatedSlugs.filter((ref) => input.allowedRefs.has(refKey(ref))),
  );

  const contentMd = input.markdown
    .split(/\r?\n/)
    .map((line) => sanitizeRelatedLine(line, input.allowedRefs))
    .map((line) => line === null ? null : sanitizeBodyWikiLinks(line, input.allowedRefs))
    .filter((line): line is string => line !== null)
    .join('\n');

  return { contentMd, relatedSlugs };
}

function sanitizeRelatedLine(line: string, allowedRefs: Set<string>): string | null {
  if (!/^>\s*\*\*Related:\*\*/.test(line)) return line;

  const keptLinks: string[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(line)) !== null) {
    const parsed = parseWikiHref(match[2]);
    if (!parsed || !allowedRefs.has(refKey(parsed))) continue;
    keptLinks.push(`[${match[1]}](../${parsed.type}/${parsed.slug})`);
  }

  if (keptLinks.length === 0) return null;
  return `> **Related:** ${keptLinks.join(', ')}`;
}

function sanitizeBodyWikiLinks(line: string, allowedRefs: Set<string>): string {
  if (/^>\s*\*\*Related:\*\*/.test(line)) return line;

  return line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label: string, href: string) => {
    const parsed = parseWikiHref(href);
    if (!parsed) return full;
    if (!allowedRefs.has(refKey(parsed))) return label;
    return `[${label}](../${parsed.type}/${parsed.slug})`;
  });
}

function parseWikiHref(href: string): WikiPageRelated | null {
  const normalized = href
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\.\.\//, '')
    .replace(/[#?].*$/, '')
    .replace(/\.md$/i, '');
  const match = new RegExp(`^${WIKI_TYPES}/([a-z0-9][a-z0-9-]*)$`, 'i').exec(normalized);
  if (!match) return null;
  return { type: match[1].toLowerCase() as WikiPageType, slug: match[2] };
}

function dedupeRelated(relatedSlugs: WikiPageRelated[]): WikiPageRelated[] {
  const seen = new Set<string>();
  const out: WikiPageRelated[] = [];
  for (const ref of relatedSlugs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function refKey(ref: WikiPageRelated): string {
  return `${ref.type}/${ref.slug}`;
}
