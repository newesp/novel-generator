import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRemoveRelatedSlug, generateFixSuggestion } from './llm-fix';
import { storage } from '../storage';
import type { WikiPage } from '../../types';
import type { LintIssue } from './types';

vi.mock('../llm', () => ({
  complete: vi.fn(async (prompt: string) => prompt.includes('SECOND') ? '# second fixed' : '# first fixed'),
}));

vi.mock('../storage', () => ({
  storage: {
    wikiLog: {
      add: vi.fn(),
      updateStatus: vi.fn(),
    },
    wikiPages: {
      update: vi.fn(),
    },
  },
}));

function page(partial: Partial<WikiPage>): WikiPage {
  return {
    id: partial.id ?? 'p1',
    bookId: 'book',
    type: partial.type ?? 'entity',
    slug: partial.slug ?? 'tie-bi',
    title: partial.title ?? '鐵臂',
    aliases: partial.aliases ?? [],
    relatedSlugs: partial.relatedSlugs ?? [{ type: 'entity', slug: 'ai-li-ya' }],
    description: '',
    contentMd: partial.contentMd ?? '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('applyRemoveRelatedSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the broken relatedSlug and matching markdown links', async () => {
    const original = page({
      contentMd: [
        '# 鐵臂',
        '',
        '> **Related:** [阿飛](../entity/a-fei), [艾莉亞](../entity/ai-li-ya), [織夢者](entity/ai-li-ya)',
        '',
        '正文仍可提到 ai-li-ya 這個純文字。',
      ].join('\n'),
    });

    const result = await applyRemoveRelatedSlug({
      bookId: 'book',
      page: original,
      removeTarget: { type: 'entity', slug: 'ai-li-ya' },
      lintBatchId: 'lint-batch',
    });

    expect(result.status).toBe('ok');
    const updated = vi.mocked(storage.wikiPages.update).mock.calls[0][0];
    expect(updated.relatedSlugs).toEqual([]);
    expect(updated.contentMd).toContain('[阿飛](../entity/a-fei)');
    expect(updated.contentMd).not.toContain('../entity/ai-li-ya');
    expect(updated.contentMd).not.toContain('entity/ai-li-ya)');
    expect(updated.contentMd).toContain('ai-li-ya 這個純文字');
  });
});

describe('generateFixSuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the preferred wiki target when an issue references multiple pages', async () => {
    const first = page({ id: 'first', slug: 'first', contentMd: 'FIRST' });
    const second = page({ id: 'second', slug: 'second', contentMd: 'SECOND' });
    const issue: LintIssue = {
      id: 'issue',
      checkId: 'wikiContradict',
      severity: 'error',
      status: 'open',
      title: 'conflict',
      detail: 'detail',
      targets: [
        { kind: 'wikiPage', id: 'first', label: 'entity/first' },
        { kind: 'wikiPage', id: 'second', label: 'entity/second' },
      ],
      fix: { kind: 'llm' },
    };

    const suggestion = await generateFixSuggestion(
      issue,
      [first, second],
      { lintFixSuggestTemplate: '{{originalMarkdown}}' } as never,
      '',
      'second',
    );

    expect(suggestion.targetPageId).toBe('second');
    expect(suggestion.targetLabel).toBe('entity/second');
    expect(suggestion.originalMarkdown).toBe('SECOND');
    expect(suggestion.newMarkdown).toBe('# second fixed');
  });
});
