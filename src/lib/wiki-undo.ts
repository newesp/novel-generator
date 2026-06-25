/**
 * 還原 wiki ingest batch
 *
 * 規範：spec §4.6
 *
 * - 只處理 op_status='ok' 的 entries（failed 留為歷史）
 * - kind='create' → DELETE wiki_pages
 * - kind='update' → 用 pageSnapshotBefore 全欄位覆寫
 * - kind='delete' → 用 pageSnapshotBefore INSERT 回
 * - 原 entries op_status 改為 'undone'
 * - 新增一條 kind='undo' 記錄
 * - chapter status 回 'unsynced'
 */
import { v4 as uuid } from 'uuid';
import type { Chapter, WikiLogEntry, WikiPageType } from '../types';
import { storage } from './storage';

export interface UndoWikiLogBatchInput {
  bookId: string;
  batchId: string;
  sourcePrefix?: string;
}

export interface UndoWikiLogBatchResult {
  revertedCount: number;
}

export async function undoWikiLogBatch({
  bookId,
  batchId,
  sourcePrefix = 'undo',
}: UndoWikiLogBatchInput): Promise<UndoWikiLogBatchResult> {
  const all = await storage.wikiLog.listByBatch(bookId, batchId);
  const okEntries = all.filter((e) => e.opStatus === 'ok')
    .sort((a, b) => b.appliedAt - a.appliedAt);

  for (const e of okEntries) {
    if (e.kind === 'create' && e.pageId) {
      await storage.wikiPages.delete(e.pageId);
    } else if (e.kind === 'update' && e.pageSnapshotBefore) {
      await storage.wikiPages.update(e.pageSnapshotBefore);
    } else if (e.kind === 'delete' && e.pageSnapshotBefore) {
      await storage.wikiPages.add(e.pageSnapshotBefore);
    }
    await storage.wikiLog.updateStatus(e.id, 'undone');
  }

  const summary: WikiLogEntry = {
    id: uuid(), bookId, batchId, appliedAt: Date.now(),
    kind: 'undo', opStatus: 'ok',
    pageId: null,
    pageType: 'concept' as WikiPageType,
    pageSlug: 'batch-undo',
    pageSnapshotBefore: null, pageSnapshotAfter: null,
    source: `${sourcePrefix}:${batchId}`,
    summary: `還原 ${okEntries.length} 個操作`,
  };
  await storage.wikiLog.add(summary);

  return { revertedCount: okEntries.length };
}

export async function undoBatch(chapter: Chapter, batchId: string): Promise<void> {
  const bookId = chapter.projectId;
  await undoWikiLogBatch({ bookId, batchId, sourcePrefix: 'undo' });

  await storage.chapters.update(chapter.id, {
    wikiSyncedAt: null,
    wikiSyncedHash: null,
    wikiSyncStatus: 'unsynced',
  });
}

/** 找出某 chapter 最近一個 ingest batchId（無則 null） */
export async function findLatestIngestBatch(chapter: Chapter): Promise<string | null> {
  const logs = await storage.wikiLog.list(chapter.projectId, 200);
  const mine = logs.filter((l) => l.source === `ingest:${chapter.id}`);
  return mine[0]?.batchId ?? null;
}
