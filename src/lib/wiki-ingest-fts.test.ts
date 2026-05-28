import { describe, expect, it } from 'vitest';
import { buildFtsExcerptsSection, buildFtsLookupQuery } from './wiki-ingest-fts';
import type { SearchHit } from './search/types';

describe('wiki ingest FTS helpers', () => {
  it('builds an empty section when there are no hits', () => {
    expect(buildFtsExcerptsSection([])).toBe('');
  });

  it('formats chapter hits as a supplemental excerpts section', () => {
    const hits: SearchHit[] = [
      {
        scope: 'chapter',
        id: 'ch-1',
        title: '暗巷',
        snippet: '他看見<<<艾莉>>>站在雨中。',
        score: 0.5,
        chapterOrder: 1,
      },
    ];

    expect(buildFtsExcerptsSection(hits)).toBe(
      '\n\n## 全書其他章節中提及的相關段落\n- 第 2 章「暗巷」：他看見艾莉站在雨中。',
    );
  });

  it('uses title, aliases, and brief content as lookup query', () => {
    expect(buildFtsLookupQuery({
      title: '艾莉',
      aliases: ['莉莉', '心靈感應者'],
      contentBrief: '她在浮光鎮第一次感應到陌生人的情緒。',
    })).toBe('艾莉 莉莉 心靈感應者 她在浮光鎮第一次感應到陌生人的情緒。');
  });
});
