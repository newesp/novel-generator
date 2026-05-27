import { describe, it, expect } from 'vitest';
import { sanitizeFtsQuery } from './sanitize';

describe('sanitizeFtsQuery', () => {
  it('returns empty string for empty / whitespace input', () => {
    expect(sanitizeFtsQuery('')).toBe('');
    expect(sanitizeFtsQuery('   ')).toBe('');
  });

  it('quotes single word', () => {
    expect(sanitizeFtsQuery('老王')).toBe('"老王"');
  });

  it('quotes each space-separated word (AND semantics)', () => {
    expect(sanitizeFtsQuery('老王 劍術')).toBe('"老王" "劍術"');
  });

  it('preserves OR operator', () => {
    expect(sanitizeFtsQuery('老王 OR 趙六')).toBe('"老王" OR "趙六"');
  });

  it('strips FTS5-special characters that could break query', () => {
    expect(sanitizeFtsQuery('a"b*c(d)')).toBe('"abcd"');
  });

  it('handles mixed Chinese + OR', () => {
    expect(sanitizeFtsQuery('王大 OR 李四 OR 趙六')).toBe('"王大" OR "李四" OR "趙六"');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeFtsQuery('老王    劍術')).toBe('"老王" "劍術"');
  });

  it('ignores lowercase or as literal word', () => {
    // 'or' 小寫不是操作符，當普通字
    expect(sanitizeFtsQuery('老王 or 趙六')).toBe('"老王" "or" "趙六"');
  });
});
