import { create } from 'zustand';
import { storage } from '../lib/storage';
import { lintBook, type LintProgress } from '../lib/lint';
import {
  applyLlmFix as applyLlmFixCore,
  applyRemoveRelatedSlug,
  generateFixSuggestion,
  type LlmFixSuggestion,
} from '../lib/lint/llm-fix';
import { undoWikiLogBatch } from '../lib/wiki-undo';
import { useSettingsStore } from './settingsStore';
import { useWikiStore } from './wikiStore';
import type { LintIssue, LintReport } from '../lib/lint/types';

interface LintState {
  isRunning: boolean;
  progress: LintProgress[];
  report: LintReport | null;
  controller: AbortController | null;
  isUndoingBatch: boolean;
  /** issueId → 使用者輸入的修改方向 */
  userDirections: Record<string, string>;
  /** issueId → 已產生的 LLM fix 建議（套用前留存） */
  fixSuggestions: Record<string, LlmFixSuggestion>;
  fixTargetPageIds: Record<string, string>;
  /** issueId → 正在生成建議 / 套用中 flag */
  busyIssueIds: Set<string>;

  runLint: (bookId: string) => Promise<void>;
  cancel: () => void;
  setUserDirection: (issueId: string, value: string) => void;
  setFixTargetPageId: (issueId: string, pageId: string) => void;

  applyAutoFix: (issue: LintIssue) => Promise<void>;
  generateFix: (issue: LintIssue, signal?: AbortSignal) => Promise<void>;
  applyLlmFix: (issue: LintIssue, editedMarkdown?: string) => Promise<void>;
  undoAppliedBatch: () => Promise<void>;
  dismiss: (issueId: string) => void;
  discardSuggestion: (issueId: string) => void;
}

export const useLintStore = create<LintState>((set, get) => ({
  isRunning: false,
  progress: [],
  report: null,
  controller: null,
  isUndoingBatch: false,
  userDirections: {},
  fixSuggestions: {},
  fixTargetPageIds: {},
  busyIssueIds: new Set(),

  runLint: async (bookId) => {
    const controller = new AbortController();
    set({
      isRunning: true,
      progress: [],
      report: null,
      controller,
      userDirections: {},
      fixSuggestions: {},
      fixTargetPageIds: {},
      busyIssueIds: new Set(),
      isUndoingBatch: false,
    });
    try {
      const report = await lintBook(bookId, controller.signal, {
        onProgress: (p) => set({ progress: p }),
      });
      set({ report, isRunning: false, controller: null });
    } catch (e) {
      console.error('[lint] runLint failed', e);
      set({ isRunning: false, controller: null });
    }
  },

  cancel: () => {
    const c = get().controller;
    if (c) c.abort();
  },

  setUserDirection: (issueId, value) => {
    set((s) => ({ userDirections: { ...s.userDirections, [issueId]: value } }));
  },

  setFixTargetPageId: (issueId, pageId) => {
    set((s) => ({ fixTargetPageIds: { ...s.fixTargetPageIds, [issueId]: pageId } }));
  },

  applyAutoFix: async (issue) => {
    const report = get().report;
    if (!report) return;
    if (!issue.fix || (issue.fix.kind !== 'removeRelatedSlug' && issue.fix.kind !== 'renameWikiSlug')) return;
    const fix = issue.fix;

    const busy = new Set(get().busyIssueIds); busy.add(issue.id);
    set({ busyIssueIds: busy });

    if (fix.kind === 'renameWikiSlug') {
      try {
        await useWikiStore.getState().renamePageSlug(fix.pageId, fix.newSlug);
      } catch (e) {
        alert(`Slug 重命名失敗：${(e as Error).message}`);
        busy.delete(issue.id);
        set({ busyIssueIds: new Set(busy) });
        return;
      }

      busy.delete(issue.id);
      const updated = report.issues.map((i) =>
        i.id === issue.id ? { ...i, status: 'applied' as const } : i,
      );
      set({
        report: { ...report, issues: updated },
        busyIssueIds: new Set(busy),
      });
      return;
    }

    const pages = await storage.wikiPages.list(report.bookId);
    const page = pages.find((p) => p.id === fix.pageId);
    if (!page) {
      alert(`找不到頁 id=${fix.pageId}`);
      busy.delete(issue.id);
      set({ busyIssueIds: new Set(busy) });
      return;
    }

    const result = await applyRemoveRelatedSlug({
      bookId: report.bookId,
      page,
      removeTarget: fix.target,
      lintBatchId: report.lintBatchId,
    });

    busy.delete(issue.id);
    if (result.status === 'failed') {
      alert(`移除失敗：${result.error}`);
      set({ busyIssueIds: new Set(busy) });
      return;
    }

    const updated = report.issues.map((i) =>
      i.id === issue.id ? { ...i, status: 'applied' as const } : i,
    );
    await useWikiStore.getState().loadForBook(report.bookId);
    set({
      report: { ...report, issues: updated },
      busyIssueIds: new Set(busy),
    });
  },

  generateFix: async (issue, signal) => {
    const report = get().report;
    if (!report) return;
    if (issue.fix?.kind !== 'llm') return;

    const busy = new Set(get().busyIssueIds); busy.add(issue.id);
    set({ busyIssueIds: busy });

    try {
      const pages = await storage.wikiPages.list(report.bookId);
      const direction = get().userDirections[issue.id] ?? '';
      const aiPrompts = useSettingsStore.getState().aiPrompts;
      const suggestion = await generateFixSuggestion(
        issue,
        pages,
        aiPrompts,
        direction,
        get().fixTargetPageIds[issue.id],
        signal,
      );
      set((s) => ({ fixSuggestions: { ...s.fixSuggestions, [issue.id]: suggestion } }));
    } catch (e) {
      throw e;
    } finally {
      const busy2 = new Set(get().busyIssueIds); busy2.delete(issue.id);
      set({ busyIssueIds: busy2 });
    }
  },

  applyLlmFix: async (issue, editedMarkdown) => {
    const report = get().report;
    if (!report) return;
    const suggestion = get().fixSuggestions[issue.id];
    if (!suggestion) return;

    const busy = new Set(get().busyIssueIds); busy.add(issue.id);
    set({ busyIssueIds: busy });

    const pages = await storage.wikiPages.list(report.bookId);
    const page = pages.find((p) => p.id === suggestion.targetPageId);
    if (!page) {
      alert('找不到要修改的 wiki page');
      const busy2 = new Set(busy); busy2.delete(issue.id);
      set({ busyIssueIds: busy2 });
      return;
    }

    const result = await applyLlmFixCore({
      bookId: report.bookId,
      page,
      newMarkdown: editedMarkdown ?? suggestion.newMarkdown,
      checkId: issue.checkId,
      lintBatchId: report.lintBatchId,
    });

    const busy2 = new Set(busy); busy2.delete(issue.id);

    if (result.status === 'failed') {
      alert(`套用失敗：${result.error}`);
      set({ busyIssueIds: busy2 });
      return;
    }

    const updated = report.issues.map((i) =>
      i.id === issue.id ? {
        ...i, status: 'applied' as const,
        fixOriginalMarkdown: suggestion.originalMarkdown,
      } : i,
    );
    const newSuggestions = { ...get().fixSuggestions };
    delete newSuggestions[issue.id];
    const newDirections = { ...get().userDirections };
    delete newDirections[issue.id];
    const newFixTargetPageIds = { ...get().fixTargetPageIds };
    delete newFixTargetPageIds[issue.id];

    set({
      report: { ...report, issues: updated },
      fixSuggestions: newSuggestions,
      userDirections: newDirections,
      fixTargetPageIds: newFixTargetPageIds,
      busyIssueIds: busy2,
    });
  },

  undoAppliedBatch: async () => {
    const report = get().report;
    if (!report || get().isUndoingBatch) return;
    const appliedCount = report.issues.filter((issue) => issue.status === 'applied').length;
    if (appliedCount === 0) return;

    set({ isUndoingBatch: true });
    try {
      const result = await undoWikiLogBatch({
        bookId: report.bookId,
        batchId: report.lintBatchId,
        sourcePrefix: 'undo-lint',
      });
      await useWikiStore.getState().loadForBook(report.bookId);
      if (result.revertedCount === 0) {
        alert('找不到可還原的 Wiki 操作。');
        return;
      }
      const updated = report.issues.map((issue) =>
        issue.status === 'applied' ? { ...issue, status: 'open' as const } : issue,
      );
      set({
        report: { ...report, issues: updated },
        fixSuggestions: {},
        busyIssueIds: new Set(),
      });
    } catch (e) {
      alert(`還原失敗：${(e as Error).message}`);
    } finally {
      set({ isUndoingBatch: false });
    }
  },

  dismiss: (issueId) => {
    const report = get().report;
    if (!report) return;
    const updated = report.issues.map((i) =>
      i.id === issueId ? { ...i, status: 'dismissed' as const } : i,
    );
    set({ report: { ...report, issues: updated } });
  },

  discardSuggestion: (issueId) => {
    const newSuggestions = { ...get().fixSuggestions };
    delete newSuggestions[issueId];
    set({ fixSuggestions: newSuggestions });
  },
}));
