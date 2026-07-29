import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { calculatePreflightEstimate } from '../../lib/multi-agent/run-manager';
import { LLM_PROVIDER_LABELS } from '../../lib/llm-provider-defaults';
import type { LLMProvider } from '../../types';
import { t } from '../../lib/language-policy';

interface MultiAgentPreflightModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmStart: () => Promise<void>;
  chapterTitle: string;
  chapterNumber?: number;
  targetWordCount?: number;
  storyTitle?: string;
  isStarting?: boolean;
}

export function MultiAgentPreflightModal({
  open,
  onClose,
  onConfirmStart,
  chapterTitle,
  chapterNumber,
  targetWordCount,
  storyTitle,
  isStarting = false,
}: MultiAgentPreflightModalProps) {
  const { multiAgentPrefs, llmProfiles, generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;

  const estimate = useMemo(() => {
    return calculatePreflightEstimate(targetWordCount || 2000, multiAgentPrefs, llmProfiles);
  }, [targetWordCount, multiAgentPrefs, llmProfiles]);

  const roleTitleMap: Record<string, string> = {
    planner: t('agentRole.planner', undefined, locale),
    writer: t('agentRole.writer', undefined, locale),
    critic: t('agentRole.critic', undefined, locale),
    editor: t('agentRole.editor', undefined, locale),
  };

  return (
    <Modal
      open={open}
      onClose={() => !isStarting && onClose()}
      title={t('preflight.title', undefined, locale)}
      width={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isStarting}>
            {t('common.cancel', undefined, locale)}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirmStart}
            disabled={isStarting}
          >
            {isStarting ? t('preflight.starting', undefined, locale) : t('preflight.confirmStart', undefined, locale)}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.6 }}>
        {/* 章節資訊 */}
        <div style={{ background: 'var(--bg-tertiary, #1f2937)', padding: '12px 16px', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            {storyTitle ? `${storyTitle} — ` : ''}
            {chapterNumber ? `${t('preflight.chapterNumber', { number: chapterNumber }, locale)} ` : ''}
            {chapterTitle || t('preflight.untitled', undefined, locale)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {targetWordCount
              ? t('preflight.targetLength', { count: targetWordCount }, locale)
              : t('preflight.defaultTargetLength', undefined, locale)}
          </div>
        </div>

        {/* Agent 角色與模型對應 */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            {t('preflight.rolesAndProfiles', undefined, locale)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {estimate.rolesSummary.map((r) => (
              <div
                key={r.role}
                style={{
                  border: '1px solid var(--border-color, #374151)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  background: 'var(--bg-secondary, #111827)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--accent-color, #60a5fa)', fontSize: 12 }}>
                  {roleTitleMap[r.role] || r.role}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{r.profileName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  [{LLM_PROVIDER_LABELS[r.provider as LLMProvider] || r.provider}] {r.model || t('preflight.defaultModel', undefined, locale)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 流程與步驟預估 */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            {t('preflight.stepsAndThresholds', undefined, locale)}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 10,
              background: 'var(--bg-tertiary, #1f2937)',
              padding: '12px',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('preflight.maxSteps', undefined, locale)}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-color, #60a5fa)', marginTop: 2 }}>
                {t('preflight.steps', { count: estimate.maxStepsCount }, locale)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('preflight.maxRevisions', undefined, locale)}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {t('preflight.revisions', { count: estimate.maxRevisions }, locale)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('preflight.passThreshold', undefined, locale)}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', marginTop: 2 }}>
                {t('preflight.points', { count: multiAgentPrefs.criticThresholds.passScore }, locale)}
              </div>
            </div>
          </div>
        </div>

        {/* Token 與成本預估 */}
        {estimate.showTokenAndCost && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              {t('preflight.costEstimate', undefined, locale)}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                padding: '10px 14px',
                borderRadius: 6,
              }}
            >
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('preflight.inputTokens', undefined, locale)} </span>
                <strong>~{estimate.estimatedInputTokens.toLocaleString()}</strong>
                <span style={{ margin: '0 8px', color: 'var(--text-tertiary)' }}>|</span>
                <span style={{ color: 'var(--text-secondary)' }}>{t('preflight.outputTokens', undefined, locale)} </span>
                <strong>~{estimate.estimatedOutputTokens.toLocaleString()}</strong>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#60a5fa' }}>
                ≈ {estimate.estimatedCost} {estimate.currency}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.2)',
            padding: '8px 12px',
            borderRadius: 6,
            lineHeight: 1.5,
          }}
        >
          {t('preflight.notice', undefined, locale)}
        </div>
      </div>
    </Modal>
  );
}
