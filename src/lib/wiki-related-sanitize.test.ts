import { describe, expect, it } from 'vitest';
import { sanitizeWikiRelatedRefs } from './wiki-related-sanitize';

describe('sanitizeWikiRelatedRefs', () => {
  it('removes related links that do not point to an allowed wiki page', () => {
    const result = sanitizeWikiRelatedRefs({
      markdown: [
        '# 老趙',
        '',
        '> **Type:** entity',
        '> **Related:** [阿飛](../entity/a-fei.md), [星塵市](../entity/xing-chen-shi.md)',
        '',
        '正文提到阿飛，但不應留下壞連結。',
      ].join('\n'),
      relatedSlugs: [
        { type: 'entity', slug: 'a-fei' },
        { type: 'entity', slug: 'xing-chen-shi' },
      ],
      allowedRefs: new Set(['entity/xing-chen-shi']),
    });

    expect(result.relatedSlugs).toEqual([{ type: 'entity', slug: 'xing-chen-shi' }]);
    expect(result.contentMd).toContain('[星塵市](../entity/xing-chen-shi)');
    expect(result.contentMd).not.toContain('a-fei');
    expect(result.contentMd).not.toContain('.md');
  });

  it('removes the whole Related line when every related link is unavailable', () => {
    const result = sanitizeWikiRelatedRefs({
      markdown: [
        '# 老趙',
        '',
        '> **Type:** entity',
        '> **Related:** [阿飛](../entity/a-fei.md)',
        '',
        '正文。',
      ].join('\n'),
      relatedSlugs: [{ type: 'entity', slug: 'a-fei' }],
      allowedRefs: new Set(['entity/old-zhao']),
    });

    expect(result.relatedSlugs).toEqual([]);
    expect(result.contentMd).not.toContain('**Related:**');
  });

  it('normalizes available wiki links and turns unavailable body links into plain text', () => {
    const result = sanitizeWikiRelatedRefs({
      markdown: [
        '# 老趙',
        '',
        '老趙見過[星塵市](entity/xing-chen-shi.md)，但[阿飛](../entity/a-fei.md)沒有頁面。',
      ].join('\n'),
      relatedSlugs: [],
      allowedRefs: new Set(['entity/xing-chen-shi']),
    });

    expect(result.contentMd).toContain('[星塵市](../entity/xing-chen-shi)');
    expect(result.contentMd).toContain('但阿飛沒有頁面。');
    expect(result.contentMd).not.toContain('.md');
    expect(result.contentMd).not.toContain('../entity/a-fei');
  });
});
