import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { calculatePreflightEstimate } from '../../lib/multi-agent/run-manager';
import { LLM_PROVIDER_LABELS } from '../../lib/llm-provider-defaults';
import type { LLMProvider } from '../../types';

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
  const { multiAgentPrefs, llmProfiles } = useSettingsStore();

  const estimate = useMemo(() => {
    return calculatePreflightEstimate(targetWordCount || 2000, multiAgentPrefs, llmProfiles);
  }, [targetWordCount, multiAgentPrefs, llmProfiles]);

  const roleTitleMap: Record<string, string> = {
    planner: '大綱規劃 (Planner)',
    writer: '初稿寫作 (Writer)',
    critic: '審核評分 (Critic)',
    editor: '草稿修訂 (Editor)',
  };

  return (
    <Modal
      open={open}
      onClose={() => !isStarting && onClose()}
      title="🤖 高品質 Multi-Agent 章節生成預檢"
      width={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isStarting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={onConfirmStart}
            disabled={isStarting}
          >
            {isStarting ? '🚀 啟動中...' : '✨ 確認開始高品質生成'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.6 }}>
        {/* 章節資訊 */}
        <div style={{ background: 'var(--bg-tertiary, #1f2937)', padding: '12px 16px', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            {storyTitle ? `${storyTitle} — ` : ''}
            {chapterNumber ? `第 ${chapterNumber} 章 ` : ''}
            {chapterTitle || '未命名章節'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            目標字數：{targetWordCount ? `${targetWordCount} 字` : '預設 (2000 字)'}
          </div>
        </div>

        {/* Agent 角色與模型對應 */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            👥 Agent 角色與 Connection Profiles
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
                  [{LLM_PROVIDER_LABELS[r.provider as LLMProvider] || r.provider}] {r.model || '內建預設模型'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 流程與步驟預估 */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            ⚙️ 流程步驟與評分門檻
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
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>預估步驟上限</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-color, #60a5fa)', marginTop: 2 }}>
                {estimate.maxStepsCount} 步
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Editor 修訂上限</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {estimate.maxRevisions} 次
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Critic 通過門檻</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', marginTop: 2 }}>
                {multiAgentPrefs.criticThresholds.passScore} 分
              </div>
            </div>
          </div>
        </div>

        {/* Token 與成本預估 */}
        {estimate.showTokenAndCost && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              💰 Token 與費用估算 (基於設定單價)
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
                <span style={{ color: 'var(--text-secondary)' }}>預估輸入 Token: </span>
                <strong>~{estimate.estimatedInputTokens.toLocaleString()}</strong>
                <span style={{ margin: '0 8px', color: 'var(--text-tertiary)' }}>|</span>
                <span style={{ color: 'var(--text-secondary)' }}>預估輸出 Token: </span>
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
          💡 <strong>提示：</strong>確認開始後將建立持久化 Run 殼層並進排隊。執行過程中可隨時取消或中途插手審核。Provider 仍可能對中途取消或逾時請求計費。
        </div>
      </div>
    </Modal>
  );
}
