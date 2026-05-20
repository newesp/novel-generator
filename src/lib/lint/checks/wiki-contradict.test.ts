import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseContradictJson, wikiContradictCheck } from './wiki-contradict';
import type { LintContext } from '../types';
import { DEFAULT_LINT_PREFS } from '../types';
import {
  DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
} from '../../prompt-defaults';

// Mock LLM
vi.mock('../../llm', () => ({
  complete: vi.fn(),
}));
import { complete } from '../../llm';

describe('parseContradictJson', () => {
  it('parses straight JSON', () => {
    const raw = '{"conflicts":[{"pages":["entity/a","entity/b"],"field":"年齡","detail":"x"}]}';
    const out = parseContradictJson(raw);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].field).toBe('年齡');
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"conflicts":[]}\n```';
    expect(parseContradictJson(raw).conflicts).toEqual([]);
  });

  it('throws on garbage', () => {
    expect(() => parseContradictJson('no json here')).toThrow();
  });
});

function makeCtx(overrides?: Partial<LintContext>): LintContext {
  return {
    bookId: 'b1',
    pages: [],
    characters: [],
    chapters: [],
    prefs: { ...DEFAULT_LINT_PREFS },
    aiPrompts: {
      lintWikiContradictTemplate: DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
    } as LintContext['aiPrompts'],
    lintBatchId: 'batch1',
    ...overrides,
  };
}

describe('wikiContradictCheck', () => {
  beforeEach(() => {
    (complete as ReturnType<typeof vi.fn>).mockReset();
  });

  it('returns no issues when 0 pages', async () => {
    const out = await wikiContradictCheck.run(makeCtx());
    expect(out.issues).toEqual([]);
  });

  it('truncates pages over maxPagesPerTypeContradict and tracks unprocessed', async () => {
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue('{"conflicts":[]}');
    const pages = Array.from({ length: 25 }).map((_, i) => ({
      id: `p${i}`, bookId: 'b1', type: 'entity' as const, slug: `s${i}`,
      title: `T${i}`, aliases: [], relatedSlugs: [], description: '',
      contentMd: '', createdAt: 0, updatedAt: i,
    }));
    const ctx = makeCtx({
      pages,
      prefs: { ...DEFAULT_LINT_PREFS, maxPagesPerTypeContradict: 10 },
    });
    const out = await wikiContradictCheck.run(ctx);
    expect(out.unprocessed?.some((u) => u.reason.includes('15'))).toBe(true);
  });

  it('produces issues from LLM conflicts', async () => {
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
      conflicts: [{
        pages: ['entity/a', 'entity/b'],
        field: '年齡',
        detail: 'a 35、b 28',
      }],
    }));
    const pages = [
      { id: 'pa', bookId: 'b1', type: 'entity' as const, slug: 'a', title: 'A', aliases: [], relatedSlugs: [], description: '', contentMd: '', createdAt: 0, updatedAt: 0 },
      { id: 'pb', bookId: 'b1', type: 'entity' as const, slug: 'b', title: 'B', aliases: [], relatedSlugs: [], description: '', contentMd: '', createdAt: 0, updatedAt: 0 },
    ];
    const out = await wikiContradictCheck.run(makeCtx({ pages }));
    expect(out.issues).toHaveLength(1);
    expect(out.issues[0].targets).toHaveLength(2);
    expect(out.issues[0].title).toContain('年齡');
  });
});
