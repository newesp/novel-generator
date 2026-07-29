import { v4 as uuid } from 'uuid';
import { storage } from '../storage';
import { useSettingsStore } from '../../stores/settingsStore';
import type { LintCheck, LintContext, LintIssue, LintReport, LintPrefs } from './types';

import { brokenLinkCheck } from './checks/broken-link';
import { orphanCheck } from './checks/orphan';
import { aliasDupCheck } from './checks/alias-dup';
import { summaryMismatchCheck } from './checks/summary-mismatch';
import { unrecordedCheck } from './checks/unrecorded';
import { wikiContradictCheck } from './checks/wiki-contradict';
import { wikiVsChapterCheck } from './checks/wiki-vs-chapter';

export type LintProgress = {
  checkId: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
};

export interface LintCallbacks {
  onProgress?: (progress: LintProgress[]) => void;
}

/** 順序固定，UI 也按這個順序顯示進度 */
const ALL_CHECKS: Array<{ check: LintCheck; prefKey: keyof LintPrefs['checks'] }> = [
  { check: brokenLinkCheck,       prefKey: 'brokenLink' },
  { check: orphanCheck,           prefKey: 'orphan' },
  { check: aliasDupCheck,         prefKey: 'aliasDup' },
  { check: summaryMismatchCheck,  prefKey: 'summaryMismatch' },
  { check: unrecordedCheck,       prefKey: 'unrecorded' },
  { check: wikiContradictCheck,   prefKey: 'wikiContradict' },
  { check: wikiVsChapterCheck,    prefKey: 'wikiVsChapter' },
];

export async function lintBook(
  bookId: string,
  signal?: AbortSignal,
  callbacks?: LintCallbacks,
): Promise<LintReport> {
  const settings = useSettingsStore.getState();
  const prefs = settings.lintPrefs;
  const aiPrompts = settings.aiPrompts;
  const interfaceLocale = settings.generalPrefs.interfaceLocale;

  const [pages, chapters, characters] = await Promise.all([
    storage.wikiPages.list(bookId),
    storage.chapters.listByProject(bookId),
    storage.characters.listByProject(bookId),
  ]);

  const lintBatchId = uuid();
  const ctx: LintContext = {
    bookId, pages, chapters, characters, prefs, aiPrompts, lintBatchId, interfaceLocale, signal,
  };

  const progress: LintProgress[] = ALL_CHECKS.map(({ check, prefKey }) => ({
    checkId: check.id,
    status: prefs.checks[prefKey] ? 'pending' : 'skipped',
  }));
  callbacks?.onProgress?.(progress);

  const issues: LintIssue[] = [];
  const failedChecks: Array<{ checkId: string; error: string }> = [];
  const unprocessed: Array<{ checkId: string; reason: string }> = [];
  let cancelled = false;

  for (let i = 0; i < ALL_CHECKS.length; i++) {
    if (signal?.aborted) { cancelled = true; break; }
    const { check, prefKey } = ALL_CHECKS[i];
    if (!prefs.checks[prefKey]) continue;

    progress[i].status = 'running';
    callbacks?.onProgress?.([...progress]);

    const t0 = performance.now();
    try {
      const out = await check.run(ctx);
      progress[i].status = 'done';
      progress[i].durationMs = Math.round(performance.now() - t0);
      issues.push(...out.issues);
      if (out.unprocessed) {
        for (const u of out.unprocessed) unprocessed.push({ checkId: check.id, reason: u.reason });
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const isAbort = (e as { name?: string }).name === 'AbortError';
      if (isAbort) {
        progress[i].status = 'skipped';
        cancelled = true;
        callbacks?.onProgress?.([...progress]);
        break;
      }
      progress[i].status = 'failed';
      progress[i].error = msg;
      progress[i].durationMs = Math.round(performance.now() - t0);
      failedChecks.push({ checkId: check.id, error: msg });
    }
    callbacks?.onProgress?.([...progress]);
  }

  return {
    bookId,
    ranAt: Date.now(),
    lintBatchId,
    issues,
    failedChecks,
    unprocessed,
    cancelled,
  };
}
