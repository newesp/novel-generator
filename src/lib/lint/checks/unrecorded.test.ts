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

describe('findCandidates (unrecorded — anchor-based v2)', () => {
  it('catches names in dialogue tags', () => {
    const c = ch('c1', '「滾開！」趙六說。「來吧。」王大笑了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).toContain('趙六');
    expect(names).toContain('王大');
  });

  it('catches names with honorific suffix', () => {
    const c = ch('c1', '一位孫姓的長老。叫做林七的弟子站起身。林七姑娘也來了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    // 「叫做林七」前綴匹配 → 林七
    expect(names).toContain('林七');
    // 林七姑娘也匹配
  });

  it('catches names with prefix 叫做 / 名為', () => {
    const c = ch('c1', '此人名為趙武。我們叫做錢三。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).toContain('趙武');
    expect(names).toContain('錢三');
  });

  it('does NOT catch frequent non-name words without anchor', () => {
    // 「艙室」科幻通用名詞，沒有對話標籤 / 稱呼語境 → 不該抓
    const c = ch('c1', '艙室裡有人。艙室外面也有。艙室深處更冷。整艘飛船的通訊器都壞了。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).not.toContain('艙室');
    expect(names).not.toContain('通訊');
    expect(names).not.toContain('通訊器');
  });

  it('does NOT catch grammar fragments at name position', () => {
    // 「的人說」「中的說」等碎片：的/中 在首位 → 應被 grammar boundary 擋掉
    const c = ch('c1', '「滾開！」的人說。「跟我來。」中的說。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const names = out.map((o) => o.name);
    expect(names).not.toContain('的人');
    expect(names).not.toContain('中的');
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

  it('returns excerpts containing the name', () => {
    const c = ch('c1', '「滾開！」趙六說。後來「跟我來」趙六說。最後「再見」趙六說。');
    const out = findCandidates([c], emptyPages, emptyChars);
    const zhao = out.find((o) => o.name === '趙六');
    expect(zhao).toBeDefined();
    expect(zhao!.freq).toBeGreaterThanOrEqual(2);
    expect(zhao!.occurrences[0].chapterId).toBe('c1');
    expect(zhao!.occurrences[0].excerpt).toContain('趙六');
  });
});
