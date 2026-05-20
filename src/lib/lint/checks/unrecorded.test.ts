import { describe, it, expect } from 'vitest';
import { findCandidates } from './unrecorded';
import type { WikiPage, Character, Chapter } from '../../../types';

const emptyPages: WikiPage[] = [];
const emptyChars: Character[] = [];

function ch(id: string, content: string): Chapter {
  return {
    id, projectId: 'b1', order: 0, title: '',
    targetWords: null, beat: '', points: '', content,
    referenceChapterId: null,
    wikiSyncedAt: null, wikiSyncedHash: null, wikiSyncStatus: 'unsynced',
    createdAt: 0, updatedAt: 0,
  };
}

describe('findCandidates (unrecorded pre-filter)', () => {
  it('catches names in dialogue tags', () => {
    const c = ch('c1', '「滾開！」趙六說。然後王大笑了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).toContain('趙六');
    expect(names).toContain('王大');
  });

  it('catches names with honorific context', () => {
    const c = ch('c1', '一位姓孫的長老走進來。叫做林七的弟子站起身。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    // 「林七」應抓（前綴「叫做」是稱呼語境）
    expect(names).toContain('林七');
  });

  it('excludes common stopwords', () => {
    const c = ch('c1', '突然眼前一黑。這時他想起了。突然他又站起來。眼前那一刻。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).not.toContain('突然');
    expect(names).not.toContain('眼前');
    expect(names).not.toContain('這時');
  });

  it('excludes names already in characters table', () => {
    const c = ch('c1', '「滾開！」趙六說。');
    const chars: Character[] = [{
      id: 'ch1', projectId: 'b1', name: '趙六', gender: '', age: '', race: '',
      personality: '', background: '', appearance: '', abilities: '',
      relations: '', arc: '', createdAt: 0,
    }];
    const out = findCandidates([c], emptyPages, chars);
    expect(out.find((o) => o.name === '趙六')).toBeUndefined();
  });

  it('excludes names already in wiki entity pages', () => {
    const c = ch('c1', '「滾開！」趙六說。');
    const pages: WikiPage[] = [{
      id: 'p1', bookId: 'b1', type: 'entity', slug: 'zhao-liu',
      title: '趙六', aliases: [], relatedSlugs: [], description: '',
      contentMd: '', createdAt: 0, updatedAt: 0,
    }];
    const out = findCandidates([c], pages, emptyChars);
    expect(out.find((o) => o.name === '趙六')).toBeUndefined();
  });

  it('requires freq ≥3 when no context match', () => {
    // 「林七」單次普通出現、沒在對話標籤附近 → 應被頻率門檻排除
    const c = ch('c1', '某天林七出門了。沒人知道他去哪。');
    const out = findCandidates([c], emptyPages, emptyChars);
    expect(out.find((o) => o.name === '林七')).toBeUndefined();
  });

  it('returns excerpts containing the name', () => {
    const c = ch('c1', '「滾開！」趙六說。後來趙六又回來了。最後趙六走了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const zhao = out.find((o) => o.name === '趙六');
    expect(zhao).toBeDefined();
    expect(zhao!.occurrences[0].chapterId).toBe('c1');
    expect(zhao!.occurrences[0].excerpt).toContain('趙六');
  });
});
