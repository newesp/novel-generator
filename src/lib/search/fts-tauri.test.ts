import { describe, it, expect, vi } from 'vitest';
import { createFtsSearchStore } from './fts-tauri';

interface MockDb {
  select: ReturnType<typeof vi.fn>;
}

function makeMockDb(): MockDb {
  return { select: vi.fn() };
}

describe('createFtsSearchStore', () => {
  it('returns empty array for empty query', async () => {
    const db = makeMockDb();
    const store = createFtsSearchStore(async () => db as never);
    const out = await store.search('b1', '', { scope: 'both' });
    expect(out).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('queries chapters_fts when scope=chapter', async () => {
    const db = makeMockDb();
    db.select.mockResolvedValueOnce([
      { id: 'ch1', chapter_order: 0, title: '王大入山', snippet: '…<<<老王>>>…', score: 1.2 },
    ]);
    const store = createFtsSearchStore(async () => db as never);
    const out = await store.search('b1', '老王', { scope: 'chapter' });
    expect(out).toEqual([
      {
        scope: 'chapter', id: 'ch1', title: '王大入山',
        snippet: '…<<<老王>>>…', score: 1.2, chapterOrder: 0,
      },
    ]);
    expect(db.select).toHaveBeenCalledTimes(1);
    const [sql, params] = db.select.mock.calls[0];
    expect(sql).toContain('chapters_fts');
    expect(sql).not.toContain('wiki_pages_fts');
    expect(params).toEqual(['"老王"', 'b1', 50]);
  });

  it('queries wiki_pages_fts when scope=wikiPage', async () => {
    const db = makeMockDb();
    db.select.mockResolvedValueOnce([
      { id: 'p1', type: 'entity', slug: 'wang-da', title: '王大', snippet: '…<<<老王>>>…', score: 0.8 },
    ]);
    const store = createFtsSearchStore(async () => db as never);
    const out = await store.search('b1', '老王', { scope: 'wikiPage' });
    expect(out).toEqual([
      {
        scope: 'wikiPage', id: 'p1', title: 'entity/wang-da — 王大',
        snippet: '…<<<老王>>>…', score: 0.8,
      },
    ]);
    const [sql] = db.select.mock.calls[0];
    expect(sql).toContain('wiki_pages_fts');
    expect(sql).not.toContain('chapters_fts');
  });

  it('queries both and sorts by score when scope=both', async () => {
    const db = makeMockDb();
    db.select
      .mockResolvedValueOnce([
        { id: 'ch1', chapter_order: 0, title: 'T1', snippet: 's1', score: 2.0 },
      ])
      .mockResolvedValueOnce([
        { id: 'p1', type: 'entity', slug: 's', title: 'PT', snippet: 's2', score: 1.0 },
      ]);
    const store = createFtsSearchStore(async () => db as never);
    const out = await store.search('b1', '老王');   // default scope both, limit 50
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(out.map((h) => h.id)).toEqual(['p1', 'ch1']);   // 1.0 < 2.0 → wiki first
  });

  it('respects custom limit', async () => {
    const db = makeMockDb();
    db.select.mockResolvedValue([]);
    const store = createFtsSearchStore(async () => db as never);
    await store.search('b1', '老王', { scope: 'chapter', limit: 10 });
    const [, params] = db.select.mock.calls[0];
    expect(params[2]).toBe(10);
  });
});
