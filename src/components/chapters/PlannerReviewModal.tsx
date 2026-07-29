import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { PlannedOutline } from '../../lib/multi-agent/planner';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';

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
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const [editedBeat, setEditedBeat] = useState(plan.beat);
  const [editedPoints, setEditedPoints] = useState(plan.points);

  return (
    <Modal
      open={open}
      onClose={() => !isSubmitting && onClose()}
      title={t('plannerReview.title', undefined, locale)}
      width={720}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('plannerReview.closeForNow', undefined, locale)}
          </Button>
          <Button
            variant="secondary"
            disabled={isSubmitting || !editedBeat.trim() || !editedPoints.trim()}
            onClick={() => onConfirmChoice('use_for_run_only', editedBeat, editedPoints)}
          >
            {t('plannerReview.useForThisRun', undefined, locale)}
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting || !editedBeat.trim() || !editedPoints.trim()}
            onClick={() => onConfirmChoice('apply_to_chapter', editedBeat, editedPoints)}
          >
            {isSubmitting ? t('plannerReview.processing', undefined, locale) : t('plannerReview.apply', undefined, locale)}
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
            <strong>{t('plannerReview.explanation', undefined, locale)}</strong>
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
              {t('plannerReview.currentPlan', undefined, locale)}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('plannerReview.currentBeat', undefined, locale)}</div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>{originalBeat || t('plannerReview.unset', undefined, locale)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('plannerReview.currentPoints', undefined, locale)}</div>
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
                {originalPoints || t('plannerReview.noPoints', undefined, locale)}
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
              {t('plannerReview.newPlan', undefined, locale)}
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>
                {t('plannerReview.beat', undefined, locale)}
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
                {t('plannerReview.points', undefined, locale)}
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
          {t('plannerReview.note', undefined, locale)}
        </div>
      </div>
    </Modal>
  );
}
