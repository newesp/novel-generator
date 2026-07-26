import { useEffect, useState } from 'react';
import { storage } from '../../lib/storage';
import { Button } from '../common/Button';
import { deleteGenerationRunRecord } from '../../lib/multi-agent/observability';
import type { GenerationRun, GenerationStep } from '../../types';

interface AgentRunPanelProps {
  chapterId: string;
  onOpenReviewModal?: (runId: string) => void;
}

export function AgentRunPanel({ chapterId, onOpenReviewModal }: AgentRunPanelProps) {
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const loadRuns = async () => {
    const list = await storage.generationRuns.listByChapter(chapterId);
    list.sort((a, b) => b.createdAt - a.createdAt);
    setRuns(list);
    if (list.length > 0 && !selectedRunId) {
      setSelectedRunId(list[0].id);
    }
  };

  useEffect(() => {
    void loadRuns();
  }, [chapterId]);

  useEffect(() => {
    if (!selectedRunId) {
      setSteps([]);
      return;
    }
    void storage.generationSteps.listByRun(selectedRunId).then((st) => {
      st.sort((a, b) => a.createdAt - b.createdAt);
      setSteps(st);
    });
  }, [selectedRunId]);

  const handleDeleteRun = async (runId: string) => {
    if (!confirm('確定要刪除此筆 Run 紀錄？（不會影響正式正文與版本）')) return;
    try {
      await deleteGenerationRunRecord(runId);
      if (selectedRunId === runId) setSelectedRunId(null);
      await loadRuns();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const activeRun = runs.find((r) => r.id === selectedRunId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12, overflow: 'hidden' }}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color, #374151)',
          background: 'var(--bg-secondary, #111827)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>🤖 Agent 生成執行軌跡</span>
        <Button variant="text" style={{ fontSize: 11 }} onClick={loadRuns}>
          🔄 重新整理
        </Button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Run 清單側欄 */}
        <div
          style={{
            width: 180,
            borderRight: '1px solid var(--border-color, #374151)',
            overflowY: 'auto',
            background: 'var(--bg-tertiary, #1f2937)',
          }}
        >
          {runs.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>無生成紀錄</div>
          ) : (
            runs.map((r) => {
              const isSelected = r.id === selectedRunId;
              const statusColor =
                r.status === 'completed' ? '#4ade80' :
                r.status === 'awaiting_input' ? '#facc15' :
                r.status === 'running' ? '#60a5fa' :
                r.status === 'cancelled' ? '#9ca3af' : '#f87171';

              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color, #374151)',
                    background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: 10, color: statusColor, padding: '1px 4px', borderRadius: 3, border: `1px solid ${statusColor}` }}>
                      {r.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 步驟時間軸與軌跡細節 */}
        <div style={{ flex: 1, padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeRun ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <strong>{activeRun.snapshot.storyTitle}</strong> · 章節 {activeRun.snapshot.chapterNumber}
                </div>
                {activeRun.status === 'awaiting_input' && onOpenReviewModal && (
                  <Button variant="primary" style={{ fontSize: 11 }} onClick={() => onOpenReviewModal(activeRun.id)}>
                    🔍 進入審核/決策
                  </Button>
                )}
                {(activeRun.status === 'completed' || activeRun.status === 'cancelled') && (
                  <Button variant="text" style={{ color: '#ef4444', fontSize: 11 }} onClick={() => handleDeleteRun(activeRun.id)}>
                    🗑 刪除紀錄
                  </Button>
                )}
              </div>

              {/* 步驟列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((s) => {
                  const isExpanded = expandedStepId === s.id;
                  return (
                    <div
                      key={s.id}
                      style={{
                        border: '1px solid var(--border-color, #374151)',
                        borderRadius: 6,
                        background: 'var(--bg-secondary, #111827)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => setExpandedStepId(isExpanded ? null : s.id)}
                        style={{
                          padding: '6px 10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          background: 'rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          [{s.role.toUpperCase()}] Attempt #{s.attempt} ({s.status})
                        </span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                          {s.usage?.totalTokens ? `${s.usage.totalTokens} tokens` : ''} ▾
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: 10, borderTop: '1px solid var(--border-color, #374151)', fontSize: 11 }}>
                          {s.prompt && (
                            <div style={{ marginBottom: 6 }}>
                              <strong style={{ color: 'var(--text-tertiary)' }}>Prompt:</strong>
                              <pre style={{ margin: '2px 0 0 0', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 4 }}>
                                {s.prompt}
                              </pre>
                            </div>
                          )}
                          {s.response && (
                            <div>
                              <strong style={{ color: 'var(--text-tertiary)' }}>Response:</strong>
                              <pre style={{ margin: '2px 0 0 0', whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 4 }}>
                                {s.response}
                              </pre>
                            </div>
                          )}
                          {s.errorText && <div style={{ color: '#ef4444', marginTop: 4 }}>錯誤: {s.errorText}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              請點擊左側 Run 項目檢視詳細軌跡
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
