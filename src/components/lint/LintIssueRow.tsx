import { useState } from 'react';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import { useWikiStore } from '../../stores/wikiStore';
import { useUIStore } from '../../stores/uiStore';
import { LintFixPreviewModal } from './LintFixPreviewModal';
import type { LintIssue, IssueTarget } from '../../lib/lint/types';

const SEVERITY_ICON: Record<LintIssue['severity'], string> = {
  error: '❌', warn: '⚠️', info: 'ℹ️',
};

interface Props {
  issue: LintIssue;
}

export function LintIssueRow({ issue }: Props) {
  const {
    userDirections, setUserDirection,
    busyIssueIds, fixSuggestions,
    applyAutoFix, generateFix, dismiss,
  } = useLintStore();

  const [expanded, setExpanded] = useState(false);

  const busy = busyIssueIds.has(issue.id);
  const direction = userDirections[issue.id] ?? '';
  const previewOpen = !!fixSuggestions[issue.id];

  const isApplied = issue.status === 'applied';
  const isDismissed = issue.status === 'dismissed';
  const isStruck = isApplied || isDismissed;

  return (
    <div style={{
      padding: '8px 4px',
      borderBottom: '1px solid var(--border-subtle, #eee)',
      opacity: isStruck ? 0.5 : 1,
      background: isStruck ? 'var(--bg-secondary, #fafafa)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ width: 20, flex: '0 0 20px' }}>{SEVERITY_ICON[issue.severity]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {isApplied && '[已修復] '}{isDismissed && '[已忽略] '}{issue.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {issue.detail}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {issue.targets.map((t, i) => (
              <TargetChip key={i} target={t} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!isStruck && issue.fix?.kind === 'removeRelatedSlug' && (
            <Button variant="secondary" size="sm" onClick={() => applyAutoFix(issue)} disabled={busy}>
              🔧 一鍵移除
            </Button>
          )}
          {!isStruck && issue.fix?.kind === 'llm' && (
            <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
              ✏️ 修改 {expanded ? '▴' : '▾'}
            </Button>
          )}
          {!isStruck && issue.checkId === 'unrecorded' && (
            <Button variant="secondary" size="sm" onClick={() => dismiss(issue.id)}>
              — 維持現狀
            </Button>
          )}
        </div>
      </div>

      {expanded && !isStruck && issue.fix?.kind === 'llm' && (
        <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            修改方向（可留白，留白則由 AI 自行判斷）：
          </div>
          <textarea
            className="form-textarea"
            value={direction}
            onChange={(e) => setUserDirection(issue.id, e.target.value)}
            placeholder="例如：依 ch-3「王大三十五」為準"
            style={{
              width: '100%', minHeight: 60,
              padding: 6, fontFamily: 'inherit', fontSize: 12,
              border: '1px solid var(--border)', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
            <Button variant="secondary" size="sm" onClick={() => setExpanded(false)} disabled={busy}>取消</Button>
            <Button variant="primary" size="sm" onClick={() => generateFix(issue)} disabled={busy}>
              {busy ? '生成中…' : '✨ 生成建議修改'}
            </Button>
          </div>
        </div>
      )}

      {previewOpen && (
        <LintFixPreviewModal issue={issue} onClose={() => { /* store 自管 */ }} />
      )}
    </div>
  );
}

function TargetChip({ target }: { target: IssueTarget }) {
  const selectPage = useWikiStore((s) => s.selectPage);
  const setSelectedChapterId = useUIStore((s) => s.setSelectedChapterId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  const onClick = () => {
    if (target.kind === 'wikiPage') {
      selectPage(target.id);
    } else {
      setSelectedChapterId(target.id);
      setActiveTab('chapters');
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={target.sourceExcerpt}
      style={{
        background: 'var(--bg-tertiary, #f0f0f0)',
        border: '1px solid var(--border)',
        padding: '2px 8px',
        fontSize: 11, cursor: 'pointer',
        borderRadius: 3,
      }}
    >
      {target.label}{target.sourceExcerpt ? ' 📄' : ''}
    </button>
  );
}
