import { useMemo, useState } from 'react';
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

  if (!suggestion) return null;

  return (
    <LintFixPreviewModalContent
      key={`${suggestion.targetPageId}:${suggestion.newMarkdown}`}
      issue={issue}
      onClose={onClose}
      suggestion={suggestion}
      busy={busy}
      applyLlmFix={applyLlmFix}
      generateFix={generateFix}
      discardSuggestion={discardSuggestion}
    />
  );
}

function LintFixPreviewModalContent({
  issue,
  onClose,
  suggestion,
  busy,
  applyLlmFix,
  generateFix,
  discardSuggestion,
}: Props & {
  suggestion: NonNullable<ReturnType<typeof useLintStore.getState>['fixSuggestions'][string]>;
  busy: boolean;
  applyLlmFix: ReturnType<typeof useLintStore.getState>['applyLlmFix'];
  generateFix: ReturnType<typeof useLintStore.getState>['generateFix'];
  discardSuggestion: ReturnType<typeof useLintStore.getState>['discardSuggestion'];
}) {
  const [editedMarkdown, setEditedMarkdown] = useState(suggestion.newMarkdown);

  const diff = useMemo(() => {
    return naiveDiff(suggestion.originalMarkdown, editedMarkdown);
  }, [suggestion.originalMarkdown, editedMarkdown]);

  return (
    <Modal open={true} onClose={onClose} title={`✨ 建議修改：${issue.title}`} width={900}>
      <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-secondary)' }}>
        {issue.detail}
      </div>
      <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
        套用到：<code>{suggestion.targetLabel}</code>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8,
        border: '1px solid var(--border)',
        maxHeight: '50vh', overflow: 'auto',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
      }}>
        <div style={{ borderRight: '1px solid var(--border)', padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>修改前</div>
          {diff.map((d, i) => (
            <pre key={i} style={{
              margin: 0, whiteSpace: 'pre-wrap',
              background: d.changed && d.before != null ? 'rgba(220, 53, 69, 0.12)' : 'transparent',
              minHeight: '1em',
            }}>{d.before ?? ''}</pre>
          ))}
        </div>
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>修改後</div>
          <textarea
            className="form-textarea"
            value={editedMarkdown}
            onChange={(e) => setEditedMarkdown(e.target.value)}
            style={{
              flex: 1,
              minHeight: 320,
              width: '100%',
              border: 'none',
              resize: 'vertical',
              outline: 'none',
              background: 'rgba(40, 167, 69, 0.08)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={() => { discardSuggestion(issue.id); onClose(); }} disabled={busy}>
          ✗ 取消
        </Button>
        <Button variant="secondary" onClick={() => generateFix(issue)} disabled={busy}>
          🔄 重新生成
        </Button>
        <Button variant="primary" onClick={async () => { await applyLlmFix(issue, editedMarkdown); onClose(); }} disabled={busy}>
          ✓ 套用
        </Button>
      </div>
    </Modal>
  );
}
