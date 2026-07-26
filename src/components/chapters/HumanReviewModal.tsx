import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { CriticFeedback } from '../../lib/multi-agent/critic';

interface HumanReviewModalProps {
  open: boolean;
  onClose: () => void;
  candidateDraft: string;
  draftVersion: number;
  criticFeedback?: CriticFeedback;
  isMaxRevisionsReached?: boolean;
  onDirectAdopt: () => Promise<void>;
  onSendToEditor: (customDirection?: string, allowExtraRevision?: boolean) => Promise<void>;
  onSaveHumanEdit: (editedText: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function HumanReviewModal({
  open,
  onClose,
  candidateDraft,
  draftVersion,
  criticFeedback,
  isMaxRevisionsReached = false,
  onDirectAdopt,
  onSendToEditor,
  onSaveHumanEdit,
  isSubmitting = false,
}: HumanReviewModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editedText, setEditedText] = useState(candidateDraft);
  const [customDirection, setCustomDirection] = useState('');
  const [allowExtra, setAllowExtra] = useState(false);

  return (
    <Modal
      open={open}
      onClose={() => !isSubmitting && onClose()}
      title={`🔍 Multi-Agent 候選草稿審核 (v${draftVersion})`}
      width={800}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            暫時關閉
          </Button>
          {mode === 'view' ? (
            <>
              <Button variant="secondary" onClick={() => setMode('edit')} disabled={isSubmitting}>
                ✏️ 人工修改草稿
              </Button>
              {(!isMaxRevisionsReached || allowExtra) && (
                <Button
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => onSendToEditor(customDirection, allowExtra)}
                >
                  🤖 交給 Editor 修訂
                </Button>
              )}
              <Button variant="primary" disabled={isSubmitting} onClick={onDirectAdopt}>
                {isSubmitting ? '處理中...' : '💾 人工審核通過並正式採用'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setMode('view')} disabled={isSubmitting}>
                取消修改
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting || !editedText.trim()}
                onClick={() => onSaveHumanEdit(editedText)}
              >
                💾 儲存人工修改 (生成 v{draftVersion + 1})
              </Button>
            </>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
        {criticFeedback && (
          <div
            style={{
              background: criticFeedback.hasMajorFlaw
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(234, 179, 8, 0.1)',
              border: criticFeedback.hasMajorFlaw
                ? '1px solid rgba(239, 68, 68, 0.3)'
                : '1px solid rgba(234, 179, 8, 0.3)',
              padding: '10px 14px',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>
                {criticFeedback.hasMajorFlaw ? '⚠️ 發現重大缺陷' : '📊 Critic 審核評分未達自動採用門檻'}
              </strong>
              <span style={{ fontWeight: 700, fontSize: 15, color: criticFeedback.totalScore >= 80 ? '#eab308' : '#ef4444' }}>
                總分：{criticFeedback.totalScore} 分
              </span>
            </div>
            {criticFeedback.hasMajorFlaw && (
              <div style={{ color: '#ef4444', marginTop: 4 }}>
                重大缺陷原因：{criticFeedback.majorFlawReason}
              </div>
            )}
            {criticFeedback.requiredChanges.length > 0 && (
              <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                <strong>修改建議：</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {criticFeedback.requiredChanges.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isMaxRevisionsReached && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            🛑 已達到預設 Editor 最高修訂次數上限。
            <label style={{ marginLeft: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={allowExtra}
                onChange={(e) => setAllowExtra(e.target.checked)}
              />
              授權額外執行 1 次 Editor 修訂
            </label>
          </div>
        )}

        {mode === 'view' ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
              📄 候選草稿正文 (v{draftVersion})：
            </div>
            <div
              style={{
                background: 'var(--bg-tertiary, #1f2937)',
                border: '1px solid var(--border-color, #374151)',
                borderRadius: 6,
                padding: '14px',
                maxHeight: 280,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                fontSize: 13,
              }}
            >
              {candidateDraft}
            </div>

            {(!isMaxRevisionsReached || allowExtra) && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                  💬 給 Editor 的補充修改方向（選填）：
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例如：請加強主角登場時的氣氛渲染..."
                  style={{ width: '100%', fontSize: 12 }}
                  value={customDirection}
                  onChange={(e) => setCustomDirection(e.target.value)}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
              ✏️ 人工編輯候選草稿：
            </div>
            <textarea
              className="form-input"
              rows={12}
              style={{ width: '100%', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
