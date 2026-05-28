import type { SearchHit } from './search/types';

const FTS_MARK_RE = /<<<(.+?)>>>/g;

interface FtsLookupSource {
  title: string;
  aliases?: string[];
  contentBrief?: string;
}

export function buildFtsLookupQuery(op: FtsLookupSource): string {
  return [
    op.title,
    ...(op.aliases ?? []),
    op.contentBrief ?? '',
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function buildFtsExcerptsSection(hits: SearchHit[]): string {
  const chapterHits = hits.filter((hit) => hit.scope === 'chapter');
  if (chapterHits.length === 0) return '';

  const lines = chapterHits.map((hit) => {
    const ordinal = typeof hit.chapterOrder === 'number' ? `第 ${hit.chapterOrder + 1} 章` : '章節';
    const snippet = hit.snippet.replace(FTS_MARK_RE, '$1');
    return `- ${ordinal}「${hit.title}」：${snippet}`;
  });

  return `\n\n## 全書其他章節中提及的相關段落\n${lines.join('\n')}`;
}
