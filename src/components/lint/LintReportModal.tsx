import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import { LintIssueRow } from './LintIssueRow';
import type { LintIssue } from '../../lib/lint/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CHECK_LABELS: Record<string, string> = {
  'broken-link': 'Broken link',
  'orphan': '孤頁',
  'alias-dup': '別名重複',
  'summary-mismatch': 'Summary 章節對不上',
  'unrecorded': '未登錄角色',
  'wikiContradict': 'Wiki 內部矛盾',
  'wikiVsChapter': 'Wiki vs 章節',
};

const STATUS_ICON: Record<string, string> = {
  pending: '⌛',
  running: '⏳',
  done: '✓',
  failed: '❌',
  skipped: '—',
};

export function LintReportModal({ open, onClose }: Props) {
  const { isRunning, progress, report, cancel } = useLintStore();

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

  const title = isRunning ? '🔍 Lint 進行中'
    : report?.cancelled ? '(部分) Lint 報告 — 中途取消'
    : `🔍 Lint 報告 — ${openCount} 個 open / ${processedCount} 已處理`;

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
            <span style={{ flex: 1 }}>{CHECK_LABELS[p.checkId] ?? p.checkId}</span>
            {p.durationMs != null && <span style={{ fontSize: 11, opacity: 0.6 }}>{p.durationMs} ms</span>}
            {p.error && <span style={{ fontSize: 11, color: 'var(--accent-danger, crimson)' }} title={p.error}>失敗</span>}
          </div>
        ))}
      </div>

      {isRunning && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Button variant="secondary" onClick={cancel}>取消</Button>
        </div>
      )}

      {!isRunning && report && (
        <>
          {report.failedChecks.length > 0 && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: 'rgba(255, 200, 50, 0.15)',
              border: '1px solid rgba(255, 200, 50, 0.4)',
              fontSize: 13,
            }}>
              ⚠️ {report.failedChecks.length} 個檢查失敗：
              {report.failedChecks.map((f) => `${CHECK_LABELS[f.checkId] ?? f.checkId}（${f.error.slice(0, 60)}）`).join('；')}
            </div>
          )}

          {report.unprocessed.length > 0 && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: 'rgba(50, 150, 220, 0.10)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              ℹ️ 超出檢查上限未處理：
              <ul style={{ margin: '4px 0 0 16px' }}>
                {report.unprocessed.map((u, i) => (
                  <li key={i}>{CHECK_LABELS[u.checkId] ?? u.checkId}：{u.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {report.issues.length === 0 && report.failedChecks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 32 }}>✅</div>
              <div style={{ marginTop: 8 }}>沒有發現問題</div>
            </div>
          )}

          {Object.entries(groupedIssues).map(([checkId, issues]) => (
            <div key={checkId} style={{ marginBottom: 16 }}>
              <div style={{
                fontWeight: 600, fontSize: 13,
                padding: '6px 0', borderBottom: '1px solid var(--border)',
                marginBottom: 6,
              }}>
                ▼ {CHECK_LABELS[checkId] ?? checkId} ({issues.length})
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
