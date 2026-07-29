import { describe, expect, it } from 'vitest';
import { generationErrorText } from './presentation';

describe('multi-agent error presentation', () => {
  it('does not expose Chinese implementation messages in the English interface', () => {
    expect(generationErrorText('Planner 格式自動修復失敗', 'en')).toContain('format');
    expect(generationErrorText('找不到 Run: abc', 'en')).not.toMatch(/\p{Script=Han}/u);
  });

  it('preserves the original diagnostic in the Chinese interface', () => {
    expect(generationErrorText('找不到 Run: abc', 'zh-TW')).toBe('找不到 Run: abc');
  });
});
