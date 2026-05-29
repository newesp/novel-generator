import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('keeps Error.message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('formats string and object errors instead of returning undefined', () => {
    expect(errorMessage('sql error')).toBe('sql error');
    expect(errorMessage({ code: 'SQL_ERROR', message: 'no such table: comic_panels' }))
      .toContain('comic_panels');
  });
});
