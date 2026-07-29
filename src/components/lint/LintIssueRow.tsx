import { useState } from 'react';
import { Button } from '../common/Button';
import { useLintStore } from '../../stores/lintStore';
import { useWikiStore } from '../../stores/wikiStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
import { LintFixPreviewModal } from './LintFixPreviewModal';
import type { LintIssue, IssueTarget } from '../../lib/lint/types';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';

const SEVERITY_ICON: Record<LintIssue['severity'], string> = {
  error: '❌', warn: '⚠️', info: 'ℹ️',
};

interface Props {
  issue: LintIssue;
}

export function LintIssueRow({ issue }: Props) {
  const {
    userDirections, setUserDirection,
    fixTargetPageIds, setFixTargetPageId,
    busyIssueIds, fixSuggestions,
    applyAutoFix, generateFix, dismiss,
  } = useLintStore();
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);

  const [expanded, setExpanded] = useState(false);
  const fixActivity = useLocalAIActivity(locale);

  const busy = busyIssueIds.has(issue.id);
  const direction = userDirections[issue.id] ?? '';
  const previewOpen = !!fixSuggestions[issue.id];
  const wikiTargets = issue.targets.filter((target) => target.kind === 'wikiPage');
  const selectedFixTargetId = fixTargetPageIds[issue.id] ?? wikiTargets[0]?.id ?? '';

  const isApplied = issue.status === 'applied';
  const isDismissed = issue.status === 'dismissed';
  const isStruck = isApplied || isDismissed;

  const handleGenerateFix = async () => {
    const target = wikiTargets.find((item) => item.id === selectedFixTargetId) ?? wikiTargets[0];
    const signal = fixActivity.start(t('lint.aiAnalyzing', { target: target?.label ?? 'Wiki' }, locale));
    try {
      await generateFix(issue, signal);
      fixActivity.succeed(t('lint.aiSuccess', undefined, locale));
    } catch (error) {
      fixActivity.fail(error);
    }
  };

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
            {isApplied && t('lint.rowApplied', undefined, locale)}{isDismissed && t('lint.rowDismissed', undefined, locale)}{issue.title}
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
              {t('lint.actionRemove', undefined, locale)}
            </Button>
          )}
          {!isStruck && issue.fix?.kind === 'renameWikiSlug' && (
            <Button variant="secondary" size="sm" onClick={() => applyAutoFix(issue)} disabled={busy}>
              {t('lint.actionRename', undefined, locale)}
            </Button>
          )}
          {!isStruck && issue.fix?.kind === 'llm' && (
            <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
              {t('lint.actionLlm', undefined, locale)} {expanded ? '▴' : '▾'}
            </Button>
          )}
          {!isStruck && issue.checkId === 'unrecorded' && (
            <Button variant="secondary" size="sm" onClick={() => dismiss(issue.id)}>
              {t('lint.actionDismiss', undefined, locale)}
            </Button>
          )}
        </div>
      </div>

      {expanded && !isStruck && issue.fix?.kind === 'llm' && (
        <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)' }}>
          {fixActivity.activity.phase !== 'idle' && (
            <div style={{ marginBottom: 8 }}>
              <LocalAIActivityCard
                activity={fixActivity.activity}
                title={t('lint.aiTitle', undefined, locale)}
                message={t('lint.aiAnalyzing', { target: wikiTargets.find((item) => item.id === selectedFixTargetId)?.label ?? 'Wiki' }, locale)}
                onCancel={fixActivity.cancel}
                onDismiss={fixActivity.reset}
                compact
              />
            </div>
          )}
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            {t('lint.llmDirection', undefined, locale)}
          </div>
          {wikiTargets.length > 1 && (
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
              {t('lint.llmTarget', undefined, locale)}
              <select
                className="form-input"
                value={selectedFixTargetId}
                onChange={(e) => setFixTargetPageId(issue.id, e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                {wikiTargets.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            </label>
          )}
          <textarea
            className="form-textarea"
            value={direction}
            onChange={(e) => setUserDirection(issue.id, e.target.value)}
            placeholder={t('lint.llmPlaceholder', undefined, locale)}
            style={{
              width: '100%', minHeight: 60,
              padding: 6, fontFamily: 'inherit', fontSize: 12,
              border: '1px solid var(--border)', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
            <Button variant="secondary" size="sm" onClick={() => setExpanded(false)} disabled={busy}>{t('common.cancel', undefined, locale)}</Button>
            <Button variant="primary" size="sm" onClick={() => void handleGenerateFix()} disabled={busy}>
              {busy ? t('lint.llmGenerating', undefined, locale) : t('lint.llmGenerate', undefined, locale)}
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
