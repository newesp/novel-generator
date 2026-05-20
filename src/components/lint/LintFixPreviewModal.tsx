import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import type { LintIssue } from '../../lib/lint/types';

interface Props {
  issue: LintIssue;
  onClose: () => void;
}

interface DiffLine {
  before: string | null;
  after: string | null;
  changed: boolean;
}

/** 簡易行對行 diff：相同行不標、不同行兩邊都標 changed。不引入 lib。 */
function naiveDiff(before: string, after: string): DiffLine[] {
  const bs = before.split('\n');
  const as_ = after.split('\n');
  const maxLen = Math.max(bs.length, as_.length);
  const out: DiffLine[] = [];
  for (let i = 0; i < maxLen; i++) {
    const b = bs[i] ?? null;
    const a = as_[i] ?? null;
    out.push({ before: b, after: a, changed: b !== a });
  }
  return out;
}

export function LintFixPreviewModal({ issue, onClose }: Props) {
  const { fixSuggestions, busyIssueIds, applyLlmFix, generateFix, discardSuggestion } = useLintStore();
  const suggestion = fixSuggestions[issue.id];
  const busy = busyIssueIds.has(issue.id);

  const diff = useMemo(() => {
    if (!suggestion) return [];
    return naiveDiff(suggestion.originalMarkdown, suggestion.newMarkdown);
  }, [suggestion]);

  if (!suggestion) return null;

  return (
    <Modal open={true} onClose={onClose} title={`✨ 建議修改：${issue.title}`} width={900}>
      <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-secondary)' }}>
        {issue.detail}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8,
        border: '1px solid var(--border)',
        maxHeight: '50vh', overflow: 'auto',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
      }}>
        <div style={{ borderRight: '1px solid var(--border)', padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Before</div>
          {diff.map((d, i) => (
            <pre key={i} style={{
              margin: 0, whiteSpace: 'pre-wrap',
              background: d.changed && d.before != null ? 'rgba(220, 53, 69, 0.12)' : 'transparent',
              minHeight: '1em',
            }}>{d.before ?? ''}</pre>
          ))}
        </div>
        <div style={{ padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>After</div>
          {diff.map((d, i) => (
            <pre key={i} style={{
              margin: 0, whiteSpace: 'pre-wrap',
              background: d.changed && d.after != null ? 'rgba(40, 167, 69, 0.12)' : 'transparent',
              minHeight: '1em',
            }}>{d.after ?? ''}</pre>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={() => { discardSuggestion(issue.id); onClose(); }} disabled={busy}>
          ✗ 取消
        </Button>
        <Button variant="secondary" onClick={() => generateFix(issue)} disabled={busy}>
          🔄 重新生成
        </Button>
        <Button variant="primary" onClick={async () => { await applyLlmFix(issue); onClose(); }} disabled={busy}>
          ✓ 套用
        </Button>
      </div>
    </Modal>
  );
}
