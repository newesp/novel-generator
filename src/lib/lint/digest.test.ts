import { describe, it, expect } from 'vitest';
import { buildDigest, DIGEST_KEYWORDS } from './digest';
import type { WikiPage } from '../../types';

const pageBase: WikiPage = {
  id: 'p1', bookId: 'b1', type: 'entity', slug: 'wang-da',
  title: '王大', aliases: ['老王'], relatedSlugs: [],
  description: '主角，劍客',
  contentMd: '',
  createdAt: 0, updatedAt: 0,
};

describe('buildDigest', () => {
  it('keeps title, aliases, description', () => {
    const d = buildDigest({ ...pageBase, contentMd: '隨意內容' });
    expect(d.title).toBe('王大');
    expect(d.aliases).toEqual(['老王']);
    expect(d.description).toBe('主角，劍客');
  });

  it('fills description from first sentence when page.description empty', () => {
    const d = buildDigest({ ...pageBase, description: '', contentMd: '王大是劍客。後來他下山。' });
    expect(d.description).toBe('王大是劍客');
  });

  it('extracts facts from bullets with fact keywords', () => {
    const md = `
## 基本資料

- 年齡：35 歲
- 武器：長劍
- 髮色：黑色
`.trim();
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.facts).toContain('年齡:35 歲');
    expect(d.facts.find((f) => f.includes('武器'))).toBeDefined();
    // 髮色不在關鍵詞 → 不入 facts
    expect(d.facts.find((f) => f.includes('髮色'))).toBeUndefined();
  });

  it('extracts relations from sentences with relation keywords', () => {
    const md = `王大的師父是張三。\n王大與李四是朋友。`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.relations.length).toBeGreaterThanOrEqual(2);
    expect(d.relations.join('\n')).toMatch(/師父/);
    expect(d.relations.join('\n')).toMatch(/朋友/);
  });

  it('extracts timeline from sentences with chapter / time markers', () => {
    const md = `第 3 章拜師。多年後成為長老。`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.timeline.length).toBe(2);
  });

  it('extracts openQuestions from sentences with mystery markers', () => {
    const md = `他的真名不明。\n是否還活著仍是之謎。`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    expect(d.openQuestions.length).toBe(2);
  });

  it('truncates in order: openQuestions → timeline → relations → facts', () => {
    const longBullets = Array.from({ length: 50 }).map((_, i) => `- 年齡相關事實 ${i}`).join('\n');
    const md = `## facts\n${longBullets}\n\n## relations\n${
      Array.from({ length: 20 }).map((_, i) => `他的師父是${i}號人物`).join('。')
    }`;
    const d = buildDigest({ ...pageBase, contentMd: md });
    // openQuestions 應該先被截光
    expect(d.openQuestions.length).toBe(0);
    // facts 至少還保留一些
    expect(d.facts.length).toBeGreaterThan(0);
  });

  it('exposes DIGEST_KEYWORDS for transparency', () => {
    expect(DIGEST_KEYWORDS.facts).toContain('年齡');
    expect(DIGEST_KEYWORDS.relations).toContain('師父');
  });
});
