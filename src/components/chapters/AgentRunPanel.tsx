import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { storage } from '../../lib/storage';
import { Button } from '../common/Button';
import { deleteGenerationRunRecord } from '../../lib/multi-agent/observability';
import {
  generationRoleLabel,
  generationRunTitle,
  generationRunTone,
  normalizedActivity,
} from '../../lib/multi-agent/presentation';
import { useGenerationRunStore } from '../../stores/generationRunStore';
import type { GenerationStep } from '../../types';

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
    if (!activeRun || !confirm('確定刪除此筆 Run 紀錄？正式正文與版本不受影響。')) return;
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
        <label htmlFor="agent-run-select">生成執行</label>
        <select
          id="agent-run-select"
          className="form-select"
          value={selectedRunId ?? ''}
          onChange={(event) => setSelectedRunId(event.target.value || null)}
        >
          {runs.length === 0 && <option value="">尚無生成紀錄</option>}
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {formatRunTime(run.createdAt)} · {generationRunTitle(run)}
            </option>
          ))}
        </select>
        <Button variant="text" size="sm" onClick={() => void refreshAll()} title="重新載入執行軌跡">
          重新整理
        </Button>
      </div>

      {!activeRun ? (
        <div className="agent-run-empty">尚無高品質生成紀錄</div>
      ) : (
        <div className="agent-run-scroll">
          <div className={`agent-run-summary tone-${generationRunTone(activeRun)}`}>
            <div>
              <strong>{generationRunTitle(activeRun)}</strong>
              <span>{normalizedActivity(activeRun).message}</span>
            </div>
            {activeRun.status === 'awaiting_input' && onOpenReviewModal && (
              <Button variant="primary" size="sm" onClick={() => onOpenReviewModal(activeRun.id)}>
                處理下一步
              </Button>
            )}
            {(activeRun.status === 'completed' || activeRun.status === 'cancelled' || activeRun.status === 'failed') && (
              <Button
                variant="text"
                size="sm"
                onClick={handleDeleteRun}
                title="刪除執行紀錄"
                aria-label="刪除執行紀錄"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>

          <div className="agent-step-timeline">
            {steps.length === 0 && <div className="agent-run-empty">尚未建立 Agent 步驟</div>}
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
                      <strong>{generationRoleLabel(step.role)}</strong>
                      <small>Attempt #{step.attempt} · {step.status} · {formatFullStepTime(step.createdAt)}</small>
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
                      {step.errorText && <p className="agent-step-error">{step.errorText}</p>}
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
