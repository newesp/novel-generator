import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { CriticFeedback } from '../../lib/multi-agent/critic';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';

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
  writingLanguage?: string;
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
  writingLanguage,
}: HumanReviewModalProps) {
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editedText, setEditedText] = useState(candidateDraft);
  const [customDirection, setCustomDirection] = useState('');
  const [allowExtra, setAllowExtra] = useState(false);

  return (
    <Modal
      open={open}
      onClose={() => !isSubmitting && onClose()}
      title={t('humanReview.title', { version: draftVersion }, locale)}
      width={800}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('humanReview.closeForNow', undefined, locale)}
          </Button>
          {mode === 'view' ? (
            <>
              <Button variant="secondary" onClick={() => setMode('edit')} disabled={isSubmitting}>
                {t('humanReview.editDraft', undefined, locale)}
              </Button>
              {(!isMaxRevisionsReached || allowExtra) && (
                <Button
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={() => onSendToEditor(customDirection, allowExtra)}
                >
                  {t('humanReview.sendToEditor', undefined, locale)}
                </Button>
              )}
              <Button variant="primary" disabled={isSubmitting} onClick={onDirectAdopt}>
                {isSubmitting ? t('humanReview.processing', undefined, locale) : t('humanReview.adopt', undefined, locale)}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setMode('view')} disabled={isSubmitting}>
                {t('humanReview.cancelEdit', undefined, locale)}
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting || !editedText.trim()}
                onClick={() => onSaveHumanEdit(editedText)}
              >
                {t('humanReview.saveEdit', { version: draftVersion + 1 }, locale)}
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
                {criticFeedback.hasMajorFlaw
                  ? t('humanReview.majorFlaw', undefined, locale)
                  : t('humanReview.belowThreshold', undefined, locale)}
              </strong>
              <span style={{ fontWeight: 700, fontSize: 15, color: criticFeedback.totalScore >= 80 ? '#eab308' : '#ef4444' }}>
                {t('humanReview.totalScore', { score: criticFeedback.totalScore }, locale)}
              </span>
            </div>
            {criticFeedback.hasMajorFlaw && (
              <div style={{ color: '#ef4444', marginTop: 4 }}>
                {t('humanReview.majorFlawReason', { reason: criticFeedback.majorFlawReason }, locale)}
              </div>
            )}
            {criticFeedback.requiredChanges.length > 0 && (
              <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                <strong>{t('humanReview.requiredChanges', undefined, locale)}</strong>
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
            {t('humanReview.revisionLimit', undefined, locale)}
            <label style={{ marginLeft: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={allowExtra}
                onChange={(e) => setAllowExtra(e.target.checked)}
              />
              {t('humanReview.allowExtraRevision', undefined, locale)}
            </label>
          </div>
        )}

        {mode === 'view' ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
              {t('humanReview.candidateDraft', { version: draftVersion }, locale)}
              {writingLanguage && ` · ${t('agent.writingLanguage', {
                language: writingLanguage === 'en'
                  ? t('agent.languageEn', undefined, locale)
                  : t('agent.languageZhHant', undefined, locale),
              }, locale)}`}
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
                  {t('humanReview.additionalDirection', undefined, locale)}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('humanReview.directionPlaceholder', undefined, locale)}
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
              {t('humanReview.manualEdit', undefined, locale)}
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
