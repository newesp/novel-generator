import { describe, expect, it } from 'vitest';
import { buildConcatList } from './concat-list';

describe('buildConcatList', () => {
  it('writes one file line per segment with escaped backslashes', () => {
    expect(
      buildConcatList([
        'C:\\media\\chapter 1\\segment-001.mp4',
        'C:\\media\\chapter 1\\segment-002.mp4',
      ]),
    ).toBe(
      [
        "file 'C:/media/chapter 1/segment-001.mp4'",
        "file 'C:/media/chapter 1/segment-002.mp4'",
        '',
      ].join('\n'),
    );
  });

  it('escapes single quotes for concat demuxer paths', () => {
    expect(buildConcatList(["C:\\media\\Leo's book\\segment-001.mp4"])).toBe(
      "file 'C:/media/Leo'\\''s book/segment-001.mp4'\n",
    );
  });
});
