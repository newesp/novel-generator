/**
 * 使用者輸入字串 → FTS5 安全的 query 字串
 *
 * 規則：
 * - 空字串 / 全空白 → 回空字串（上層短路）
 * - 用空白切詞，每個 token 過濾 FTS5 特殊字元（" * ( ) :）後 quote
 * - 大寫 OR 保留為操作符；其他 token 一律 quote
 * - 多個空白視為一個
 */
const FORBIDDEN_CHARS_RE = /["*():]/g;

export function sanitizeFtsQuery(input: string): string {
  if (!input || !input.trim()) return '';
  const tokens = input.trim().split(/\s+/);
  const parts: string[] = [];
  for (const raw of tokens) {
    if (raw === 'OR') {
      parts.push('OR');
      continue;
    }
    const clean = raw.replace(FORBIDDEN_CHARS_RE, '');
    if (!clean) continue;
    parts.push(`"${clean}"`);
  }
  return parts.join(' ');
}
