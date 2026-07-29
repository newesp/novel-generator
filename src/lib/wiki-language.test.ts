import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestChapter } from './wiki-ingest';
import { complete } from './llm';

vi.mock('./llm', () => ({
  complete: vi.fn(),
}));

const mockEnBook = {
  id: 'b-en-wiki',
  title: 'Fantasy Realm',
  writingLanguage: 'en' as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockChapter = {
  id: 'ch-1',
  projectId: 'b-en-wiki',
  order: 0,
  title: 'Chapter 1: The Gathering',
  content: 'Alice met Bob in the ancient forest of Eldoria.',
  targetWords: 2000,
  beat: 'inciting_incident',
  points: 'Meeting in forest',
  referenceChapterId: null,
  wikiSyncedAt: null,
  wikiSyncedHash: null,
  wikiSyncStatus: 'unsynced' as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

vi.mock('./storage', () => ({
  storage: {
    projects: { get: vi.fn(async () => mockEnBook) },
    wikiPages: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      add: vi.fn(async () => {}),
    },
    characters: {
      listByProject: vi.fn(async () => [{ name: 'Alice' }, { name: 'Bob' }]),
    },
    chapters: {
      update: vi.fn(async () => {}),
    },
    wikiLogs: {
      add: vi.fn(async () => {}),
    },
  },
}));

describe('Wiki Ingest Language Boundary (Ticket #24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats Plan prompt with English System Prompt and comma separator for en books', async () => {
    vi.mocked(complete).mockResolvedValue(
      JSON.stringify({
        summary: 'Chapter summary',
        operations: [
          { op: 'create', type: 'entity', slug: 'eldoria', title: 'Eldoria', description: 'Ancient forest', aliases: [] },
        ],
      }),
    );

    await ingestChapter(mockChapter);

    const callPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(callPrompt).toContain('You are a Wiki knowledge graph extraction specialist');
    expect(callPrompt).toContain('Alice, Bob');
  });
});
