import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { PlannedOutline } from '../../lib/multi-agent/planner';

interface PlannerReviewModalProps {
  open: boolean;
  onClose: () => void;
  plan: PlannedOutline;
  originalBeat: string;
  originalPoints: string;
  onConfirmChoice: (
    choice: 'apply_to_chapter' | 'use_for_run_only',
    finalBeat: string,
    finalPoints: string,
  ) => Promise<void>;
  isSubmitting?: boolean;
}

export function PlannerReviewModal({
  open,
  onClose,
  plan,
  originalBeat,
  originalPoints,
  onConfirmChoice,
  isSubmitting = false,
}: PlannerReviewModalProps) {
  const [editedBeat, setEditedBeat] = useState(plan.beat);
  const [editedPoints, setEditedPoints] = useState(plan.points);

  return (
    <Modal
      open={open}
      onClose={() => !isSubmitting && onClose()}
      title="📋 Planner 大綱規劃審核與比較"
      width={720}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            暫時關閉
          </Button>
          <Button
            variant="secondary"
            disabled={isSubmitting || !editedBeat.trim() || !editedPoints.trim()}
            onClick={() => onConfirmChoice('use_for_run_only', editedBeat, editedPoints)}
          >
            🎯 僅供本次生成使用
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting || !editedBeat.trim() || !editedPoints.trim()}
            onClick={() => onConfirmChoice('apply_to_chapter', editedBeat, editedPoints)}
          >
            {isSubmitting ? '處理中...' : '💾 正式採用並更新章節規劃'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.6 }}>
        {plan.explanation && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <strong>💡 Planner 佈局與規劃說明：</strong>
            <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{plan.explanation}</div>
          </div>
        )}

        {/* 比較面板 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* 原有規劃 */}
          <div
            style={{
              border: '1px solid var(--border-color, #374151)',
              borderRadius: 6,
              padding: '12px',
              background: 'var(--bg-tertiary, #1f2937)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              📌 現有章節規劃
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>現有語氣/節拍</div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>{originalBeat || '(未設定)'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>現有要點</div>
              <div
                style={{
                  marginTop: 2,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {originalPoints || '(無要點)'}
              </div>
            </div>
          </div>

          {/* Planner 新規劃 */}
          <div
            style={{
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: 6,
              padding: '12px',
              background: 'rgba(34, 197, 94, 0.05)',
            }}
          >
            <div style={{ fontWeight: 600, color: '#4ade80', marginBottom: 8 }}>
              ✨ Planner 生成之新規劃 (可微調)
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>
                語氣/節拍
              </label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', marginTop: 2, fontSize: 12 }}
                value={editedBeat}
                onChange={(e) => setEditedBeat(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>
                章節要點
              </label>
              <textarea
                className="form-input"
                rows={6}
                style={{ width: '100%', marginTop: 2, fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
                value={editedPoints}
                onChange={(e) => setEditedPoints(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          提示：
          <br />
          - 選擇<strong>「正式採用並更新章節規劃」</strong>將同步寫回章節設定 (`Chapter.beat` 與 `Chapter.points`)，後續即使取消正文生成也不會復原本項變更。
          <br />- 選擇<strong>「僅供本次生成使用」</strong>僅會把本規劃帶入接下來的 Writer 正文生成，不修改現有章節設定。
        </div>
      </div>
    </Modal>
  );
}
