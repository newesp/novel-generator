import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { storage } from '../../lib/storage';
import { Button } from '../common/Button';
import { deleteGenerationRunRecord } from '../../lib/multi-agent/observability';
import {
  generationRoleLabel,
  generationErrorText,
  generationRunTitle,
  generationRunTone,
  normalizedActivity,
} from '../../lib/multi-agent/presentation';
import { useGenerationRunStore } from '../../stores/generationRunStore';
import type { GenerationStep } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';

const STEP_STATUS_KEYS: Record<GenerationStep['status'], string> = {
  pending: 'agent.statusPending',
  running: 'agent.statusRunning',
  completed: 'agent.statusCompleted',
  failed: 'agent.statusFailed',
  cancelled: 'agent.statusCancelled',
};

interface AgentRunPanelProps {
  chapterId: string;
  focusedRunId?: string | null;
  onOpenReviewModal?: (runId: string) => void;
}

function formatRunTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFullStepTime(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

export function AgentRunPanel({ chapterId, focusedRunId, onOpenReviewModal }: AgentRunPanelProps) {
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const allRuns = useGenerationRunStore((state) => state.runs);
  const refreshAll = useGenerationRunStore((state) => state.refreshAll);
  const removeRun = useGenerationRunStore((state) => state.remove);
  const runs = useMemo(
    () => allRuns.filter((run) => run.chapterId === chapterId).sort((a, b) => b.createdAt - a.createdAt),
    [allRuns, chapterId],
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  useEffect(() => {
    if (focusedRunId && runs.some((run) => run.id === focusedRunId)) {
      setSelectedRunId(focusedRunId);
    } else if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0]?.id ?? null);
    }
  }, [focusedRunId, runs, selectedRunId]);

  const activeRun = runs.find((run) => run.id === selectedRunId);

  useEffect(() => {
    if (!selectedRunId) {
      setSteps([]);
      return;
    }
    void storage.generationSteps.listByRun(selectedRunId).then((nextSteps) => {
      setSteps(nextSteps.sort((a, b) => a.createdAt - b.createdAt));
    });
  }, [selectedRunId, activeRun?.updatedAt]);

  const handleDeleteRun = async () => {
    if (!activeRun || !confirm(t('agent.deleteRunConfirm', undefined, locale))) return;
    try {
      await deleteGenerationRunRecord(activeRun.id);
      removeRun(activeRun.id);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <div className="agent-run-panel">
      <div className="agent-run-selector">
        <label htmlFor="agent-run-select">{t('agent.runSelectLabel', undefined, locale)}</label>
        <select
          id="agent-run-select"
          className="form-select"
          value={selectedRunId ?? ''}
          onChange={(event) => setSelectedRunId(event.target.value || null)}
        >
          {runs.length === 0 && <option value="">{t('agent.noRunRecords', undefined, locale)}</option>}
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {formatRunTime(run.createdAt)} · {generationRunTitle(run, locale)}
            </option>
          ))}
        </select>
        <Button variant="text" size="sm" onClick={() => void refreshAll()} title={t('agent.reloadTrail', undefined, locale)}>
          {t('agent.refresh', undefined, locale)}
        </Button>
      </div>

      {!activeRun ? (
        <div className="agent-run-empty">{t('agent.noHighQualityRuns', undefined, locale)}</div>
      ) : (
        <div className="agent-run-scroll">
          <div className={`agent-run-summary tone-${generationRunTone(activeRun)}`}>
            <div>
              <strong>{generationRunTitle(activeRun, locale)}</strong>
              <span>{normalizedActivity(activeRun, locale).message}</span>
              {activeRun.snapshot?.writingLanguage && (
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                  {t('agent.writingLanguage', {
                    language: activeRun.snapshot.writingLanguage === 'en'
                      ? t('agent.languageEn', undefined, locale)
                      : t('agent.languageZhHant', undefined, locale),
                  }, locale)}
                </div>
              )}
            </div>
            {activeRun.status === 'awaiting_input' && onOpenReviewModal && (
              <Button variant="primary" size="sm" onClick={() => onOpenReviewModal(activeRun.id)}>
                {t('agent.nextStep', undefined, locale)}
              </Button>
            )}
            {(activeRun.status === 'completed' || activeRun.status === 'cancelled' || activeRun.status === 'failed') && (
              <Button
                variant="text"
                size="sm"
                onClick={handleDeleteRun}
                title={t('agent.deleteRun', undefined, locale)}
                aria-label={t('agent.deleteRun', undefined, locale)}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>

          <div className="agent-step-timeline">
            {steps.length === 0 && <div className="agent-run-empty">{t('agent.noSteps', undefined, locale)}</div>}
            {steps.map((step) => {
              const expanded = expandedStepId === step.id;
              return (
                <article key={step.id} className={`agent-step-card status-${step.status}`}>
                  <button
                    type="button"
                    className="agent-step-heading"
                    onClick={() => setExpandedStepId(expanded ? null : step.id)}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <img src={`/assets/agents/${step.role}-64.png`} alt="" />
                    <span>
                      <strong>{generationRoleLabel(step.role, locale)}</strong>
                      <small>{t('agent.attempt', {
                        attempt: step.attempt,
                        status: t(STEP_STATUS_KEYS[step.status], undefined, locale),
                        time: formatFullStepTime(step.createdAt),
                      }, locale)}</small>
                    </span>
                    {step.usage?.totalTokens != null && <em>{step.usage.totalTokens} tokens</em>}
                  </button>
                  {expanded && (
                    <div className="agent-step-detail">
                      {step.prompt && (
                        <details>
                          <summary>Prompt</summary>
                          <pre>{step.prompt}</pre>
                        </details>
                      )}
                      {step.response && (
                        <details>
                          <summary>Response</summary>
                          <pre>{step.response}</pre>
                        </details>
                      )}
                      {step.errorText && <p className="agent-step-error">{generationErrorText(step.errorText, locale)}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
