import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
import { LintIssueRow } from './LintIssueRow';
import type { LintIssue } from '../../lib/lint/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const getCheckLabel = (checkId: string, locale: string): string => {
  const map: Record<string, string> = {
    'broken-link': t('lint.check_broken_links', undefined, locale),
    'orphan': t('lint.check_orphan_pages', undefined, locale),
    'alias-dup': t('lint.check_duplicate_aliases', undefined, locale),
    'summary-mismatch': t('reason.slugMismatch', undefined, locale),
    'unrecorded': t('lint.check_unrecorded_entities', undefined, locale),
    'wikiContradict': t('lint.check_wiki_contradict', undefined, locale),
    'wikiVsChapter': t('lint.check_wiki_vs_chapter', undefined, locale),
  };
  return map[checkId] ?? checkId;
};

const STATUS_ICON: Record<string, string> = {
  pending: '⌛',
  running: '⏳',
  done: '✓',
  failed: '❌',
  skipped: '—',
};

export function LintReportModal({ open, onClose }: Props) {
  const { isRunning, progress, report, cancel, isUndoingBatch, undoAppliedBatch } = useLintStore();
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);

  const groupedIssues = useMemo(() => {
    if (!report) return {} as Record<string, LintIssue[]>;
    const out: Record<string, LintIssue[]> = {};
    for (const issue of report.issues) {
      (out[issue.checkId] ??= []).push(issue);
    }
    return out;
  }, [report]);

  const openCount = report?.issues.filter((i) => i.status === 'open').length ?? 0;
  const processedCount = report?.issues.filter((i) => i.status !== 'open').length ?? 0;
  const appliedCount = report?.issues.filter((i) => i.status === 'applied').length ?? 0;

  const title = isRunning ? t('lint.reportRunningTitle', undefined, locale)
    : report?.cancelled ? t('lint.reportCancelled', undefined, locale)
    : t('lint.reportTitleOpen', { open: openCount, processed: processedCount }, locale);

  return (
    <Modal open={open} onClose={onClose} title={title} width={780}>
      {/* 進度列 */}
      <div style={{ marginBottom: 12 }}>
        {progress.map((p) => (
          <div key={p.checkId} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 0',
            color: p.status === 'failed' ? 'var(--accent-danger, crimson)' :
                   p.status === 'skipped' ? 'var(--text-tertiary, #888)' :
                   'var(--text-primary)',
          }}>
            <span style={{ width: 18 }}>{STATUS_ICON[p.status]}</span>
            <span style={{ flex: 1 }}>{getCheckLabel(p.checkId, locale)}</span>
            {p.durationMs != null && <span style={{ fontSize: 11, opacity: 0.6 }}>{p.durationMs} ms</span>}
            {p.error && <span style={{ fontSize: 11, color: 'var(--accent-danger, crimson)' }} title={p.error}>{t('lint.statusFail', undefined, locale)}</span>}
          </div>
        ))}
      </div>

      {isRunning && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Button variant="secondary" onClick={cancel}>{t('common.cancel', undefined, locale)}</Button>
        </div>
      )}

      {!isRunning && report && (
        <>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: 10,
            marginBottom: 12,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('lint.batchInfo', { applied: appliedCount }, locale)}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void undoAppliedBatch()}
              disabled={appliedCount === 0 || isUndoingBatch}
              title={t('lint.batchUndoTooltip', undefined, locale)}
            >
              {isUndoingBatch ? t('lint.batchUndoing', undefined, locale) : t('lint.batchUndoBtn', undefined, locale)}
            </Button>
          </div>

          {report.failedChecks.length > 0 && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: 'rgba(255, 200, 50, 0.15)',
              border: '1px solid rgba(255, 200, 50, 0.4)',
              fontSize: 13,
            }}>
              {t('lint.failedChecks', { count: report.failedChecks.length }, locale)}
              {report.failedChecks.map((f) => `${getCheckLabel(f.checkId, locale)}（${f.error.slice(0, 60)}）`).join('；')}
            </div>
          )}

          {report.unprocessed.length > 0 && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: 'rgba(50, 150, 220, 0.10)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              {t('lint.unprocessed', undefined, locale)}
              <ul style={{ margin: '4px 0 0 16px' }}>
                {report.unprocessed.map((u, i) => (
                  <li key={i}>{getCheckLabel(u.checkId, locale)}：{u.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {report.issues.length === 0 && report.failedChecks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 32 }}>✅</div>
              <div style={{ marginTop: 8 }}>{t('lint.statusOk', undefined, locale)}</div>
            </div>
          )}

          {Object.entries(groupedIssues).map(([checkId, issues]) => (
            <div key={checkId} style={{ marginBottom: 16 }}>
              <div style={{
                fontWeight: 600, fontSize: 13,
                padding: '6px 0', borderBottom: '1px solid var(--border)',
                marginBottom: 6,
              }}>
                ▼ {getCheckLabel(checkId, locale)} ({issues.length})
              </div>
              {issues.map((issue) => (
                <LintIssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
