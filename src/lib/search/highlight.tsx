import type { ReactNode } from 'react';

const MARK_RE = /<<<(.+?)>>>/g;

/**
 * 把 SQLite snippet() 回傳的 `<<<x>>>` 標記轉成 React ReactNode 陣列，
 * 命中段落以 <mark> 包起來。
 *
 * @example
 * highlightSnippet('前<<<老王>>>後') → ['前', <mark>老王</mark>, '後']
 */
export function highlightSnippet(text: string): ReactNode {
  if (!text) return '';
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  MARK_RE.lastIndex = 0;
  while ((match = MARK_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    parts.push(<mark key={key++}>{match[1]}</mark>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length === 0 ? '' : parts;
}
