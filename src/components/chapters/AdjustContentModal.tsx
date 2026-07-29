import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useSettingsStore, type InlineEditContextMode } from '../../stores/settingsStore';
import { rewriteSelection } from '../../lib/inline-edit';
import { isLLMReady } from '../../lib/llm';
import type { Chapter } from '../../types';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';
import { useProjectStore } from '../../stores/projectStore';
import { t } from '../../lib/language-policy';

interface Props {
  open: boolean;
  onClose: () => void;
  chapter: Pick<Chapter, 'title' | 'beat' | 'points'>;
  fullContent: string;
  selectionStart: number;
  selectionEnd: number;
  /** 用戶按下「✅ 接受寫入」時觸發；newContent 為替換選取後的完整章節文字 */
  onAccept: (newContent: string) => void;
}

export function AdjustContentModal({
  open, onClose, chapter, fullContent, selectionStart, selectionEnd, onAccept,
}: Props) {
  const { llmConfig, inlineEdit, generalPrefs } = useSettingsStore();
  const writingLanguage = useProjectStore((state) => state.project?.writingLanguage ?? 'zh-Hant');
  const locale = generalPrefs.interfaceLocale;

  const [adjustText, setAdjustText] = useState('');
  const [contextMode, setContextMode] = useState<InlineEditContextMode>(inlineEdit.contextMode);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatedPart, setGeneratedPart] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const rewriteActivity = useLocalAIActivity(locale);

  // 開啟時重置狀態
  useEffect(() => {
    if (open) {
      setAdjustText('');
      setContextMode(inlineEdit.contextMode);
      setGeneratedContent(null);
      setGeneratedPart('');
      setIsGenerating(false);
      rewriteActivity.reset();
    }
  }, [open, inlineEdit.contextMode]);

  if (!open) return null;

  const selectedText = fullContent.substring(selectionStart, selectionEnd);
  const apiReady = isLLMReady(llmConfig);

  const handleGenerate = async () => {
    if (!apiReady) {
      alert(t('adjust.apiRequired', undefined, locale));
      return;
    }
    if (!adjustText.trim()) return;

    const contextLabel = contextMode === 'full'
      ? t('adjust.contextFull', undefined, locale)
      : t('adjust.contextWindow', { count: inlineEdit.contextChars }, locale);
    const signal = rewriteActivity.start(t('adjust.activityMessage', {
      count: selectedText.trim().length,
      context: contextLabel,
    }, locale));
    setIsGenerating(true);
    try {
      const { newContent, rewrittenPart } = await rewriteSelection({
        chapter,
        fullContent,
        selectionStart,
        selectionEnd,
        adjustInstruction: adjustText.trim(),
        contextMode,
        contextChars: inlineEdit.contextChars,
        writingLanguage,
      }, signal);
      setGeneratedContent(newContent);
      setGeneratedPart(rewrittenPart);
      rewriteActivity.succeed(t('adjust.previewReady', undefined, locale));
    } catch (err) {
      rewriteActivity.fail(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (generatedContent === null) return;
    onAccept(generatedContent);
    onClose();
  };

  return (
    <Modal
      open
      onClose={() => !isGenerating && onClose()}
      title={t('adjust.title', undefined, locale)}
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
            {t('common.cancel', undefined, locale)}
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            variant={generatedContent ? 'secondary' : 'primary'}
            onClick={handleGenerate}
            disabled={isGenerating || !adjustText.trim()}
          >
            {isGenerating
              ? t('adjust.generating', undefined, locale)
              : (generatedContent
                ? t('adjust.regenerate', undefined, locale)
                : t('adjust.generate', undefined, locale))}
          </Button>
          {generatedContent !== null && (
            <Button variant="primary" onClick={handleAccept} disabled={isGenerating}>
              {t('adjust.accept', undefined, locale)}
            </Button>
          )}
        </>
      }
    >
      {rewriteActivity.activity.phase !== 'idle' && (
        <LocalAIActivityCard
          activity={rewriteActivity.activity}
          title={t('adjust.activityTitle', undefined, locale)}
          message={t('adjust.activityMessage', {
            count: selectedText.trim().length,
            context: contextMode === 'full'
              ? t('adjust.contextFull', undefined, locale)
              : t('adjust.contextWindow', { count: inlineEdit.contextChars }, locale),
          }, locale)}
          onCancel={rewriteActivity.cancel}
          onDismiss={rewriteActivity.reset}
          compact
        />
      )}
      {/* 原段落 */}
      <div className="inline-edit-label">{t('adjust.sourceParagraph', { count: selectedText.length }, locale)}</div>
      <div className="inline-edit-block muted">{selectedText || t('adjust.empty', undefined, locale)}</div>

      {/* 上下文範圍選擇 */}
      <div className="inline-edit-label">{t('adjust.contextRange', undefined, locale)}</div>
      <div className="inline-edit-radio-row">
        <label>
          <input
            type="radio"
            name="ctx-mode"
            checked={contextMode === 'window'}
            onChange={() => setContextMode('window')}
            disabled={isGenerating}
          />
          {t('adjust.contextWindow', { count: inlineEdit.contextChars }, locale)}
        </label>
        <label>
          <input
            type="radio"
            name="ctx-mode"
            checked={contextMode === 'full'}
            onChange={() => setContextMode('full')}
            disabled={isGenerating}
          />
          {t('adjust.fullChapter', { count: fullContent.length }, locale)}
        </label>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {t('adjust.defaultHint', undefined, locale)}
        </span>
      </div>

      {/* 調整指令 */}
      <div className="inline-edit-label">{t('adjust.direction', undefined, locale)}</div>
      <textarea
        className="form-textarea"
        value={adjustText}
        onChange={(e) => setAdjustText(e.target.value)}
        placeholder={t('adjust.directionPlaceholder', undefined, locale)}
        style={{ minHeight: 80 }}
        disabled={isGenerating}
        autoFocus
      />

      {/* 生成結果預覽 */}
      {generatedContent !== null && (
        <>
          <div className="inline-edit-label">
            {t('adjust.result', { count: generatedPart.trim().length }, locale)}
          </div>
          <div className="inline-edit-block">{generatedPart || t('adjust.empty', undefined, locale)}</div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
            {t('adjust.resultHint', undefined, locale)}
          </p>
        </>
      )}
    </Modal>
  );
}
