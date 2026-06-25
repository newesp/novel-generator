import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WikiLogEntry, WikiPage } from '../types';
import { undoWikiLogBatch } from './wiki-undo';

const storageMock = vi.hoisted(() => ({
  wikiLog: {
    listByBatch: vi.fn(),
    updateStatus: vi.fn(),
    add: vi.fn(),
  },
  wikiPages: {
    delete: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
  },
  chapters: {
    update: vi.fn(),
  },
}));

vi.mock('./storage', () => ({
  storage: storageMock,
}));

const page = (partial: Partial<WikiPage>): WikiPage => ({
  id: partial.id ?? 'page',
  bookId: partial.bookId ?? 'book',
  type: partial.type ?? 'entity',
  slug: partial.slug ?? 'page',
  title: partial.title ?? 'Page',
  aliases: partial.aliases ?? [],
  relatedSlugs: partial.relatedSlugs ?? [],
  description: partial.description ?? '',
  contentMd: partial.contentMd ?? '',
  createdAt: partial.createdAt ?? 1,
  updatedAt: partial.updatedAt ?? 1,
});

const log = (partial: Partial<WikiLogEntry>): WikiLogEntry => ({
  id: partial.id ?? 'log',
  bookId: partial.bookId ?? 'book',
  batchId: partial.batchId ?? 'batch',
  appliedAt: partial.appliedAt ?? 1,
  kind: partial.kind ?? 'update',
  opStatus: partial.opStatus ?? 'ok',
  pageId: partial.pageId ?? 'page',
  pageType: partial.pageType ?? 'entity',
  pageSlug: partial.pageSlug ?? 'page',
  pageSnapshotBefore: partial.pageSnapshotBefore ?? null,
  pageSnapshotAfter: partial.pageSnapshotAfter ?? null,
  source: partial.source ?? 'lint:broken-link',
  summary: partial.summary ?? '',
  errorMessage: partial.errorMessage,
});

describe('undoWikiLogBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reverts all ok wiki log entries in reverse apply order without touching chapters', async () => {
    const before = page({ id: 'updated', slug: 'updated', title: 'Before' });
    const deleted = page({ id: 'deleted', slug: 'deleted', title: 'Deleted' });
    storageMock.wikiLog.listByBatch.mockResolvedValue([
      log({ id: 'create-log', appliedAt: 10, kind: 'create', pageId: 'created', pageSlug: 'created' }),
      log({ id: 'update-log', appliedAt: 20, kind: 'update', pageId: 'updated', pageSlug: 'updated', pageSnapshotBefore: before }),
      log({ id: 'delete-log', appliedAt: 30, kind: 'delete', pageId: 'deleted', pageSlug: 'deleted', pageSnapshotBefore: deleted }),
      log({ id: 'failed-log', appliedAt: 40, kind: 'update', opStatus: 'failed', pageId: 'failed' }),
    ]);

    const result = await undoWikiLogBatch({ bookId: 'book', batchId: 'batch', sourcePrefix: 'undo-lint' });

    expect(result.revertedCount).toBe(3);
    expect(storageMock.wikiPages.add).toHaveBeenCalledWith(deleted);
    expect(storageMock.wikiPages.update).toHaveBeenCalledWith(before);
    expect(storageMock.wikiPages.delete).toHaveBeenCalledWith('created');
    expect(storageMock.wikiLog.updateStatus.mock.calls.map((call) => call[0])).toEqual([
      'delete-log',
      'update-log',
      'create-log',
    ]);
    expect(storageMock.wikiLog.add).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book',
      batchId: 'batch',
      kind: 'undo',
      opStatus: 'ok',
      source: 'undo-lint:batch',
      summary: '還原 3 個操作',
    }));
    expect(storageMock.chapters.update).not.toHaveBeenCalled();
  });
});
