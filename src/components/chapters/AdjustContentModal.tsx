import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useSettingsStore, type InlineEditContextMode } from '../../stores/settingsStore';
import { rewriteSelection } from '../../lib/inline-edit';
import { isLLMReady } from '../../lib/llm';
import type { Chapter } from '../../types';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';

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
  const { llmConfig, inlineEdit } = useSettingsStore();

  const [adjustText, setAdjustText] = useState('');
  const [contextMode, setContextMode] = useState<InlineEditContextMode>(inlineEdit.contextMode);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatedPart, setGeneratedPart] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const rewriteActivity = useLocalAIActivity();

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
      alert('請先在「⚙️ 偏好設定」中設定 LLM endpoint 與 API Key');
      return;
    }
    if (!adjustText.trim()) return;

    const signal = rewriteActivity.start(
      `改寫選取的 ${selectedText.trim().length} 字，使用${contextMode === 'full' ? '全章' : `前後各 ${inlineEdit.contextChars} 字`}作為上下文…`,
    );
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
      }, signal);
      setGeneratedContent(newContent);
      setGeneratedPart(rewrittenPart);
      rewriteActivity.succeed('已產生替換預覽；接受前不會寫入正文');
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
      title="✨ 調整內容"
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
            取消
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            variant={generatedContent ? 'secondary' : 'primary'}
            onClick={handleGenerate}
            disabled={isGenerating || !adjustText.trim()}
          >
            {isGenerating ? '生成中...' : (generatedContent ? '↻ 重新生成' : '✨ 生成')}
          </Button>
          {generatedContent !== null && (
            <Button variant="primary" onClick={handleAccept} disabled={isGenerating}>
              ✅ 接受寫入
            </Button>
          )}
        </>
      }
    >
      {rewriteActivity.activity.phase !== 'idle' && (
        <LocalAIActivityCard
          activity={rewriteActivity.activity}
          title="AI 助理調整選取內容"
          message={`改寫選取的 ${selectedText.trim().length} 字，使用${contextMode === 'full' ? '全章' : `前後各 ${inlineEdit.contextChars} 字`}作為上下文…`}
          onCancel={rewriteActivity.cancel}
          onDismiss={rewriteActivity.reset}
          compact
        />
      )}
      {/* 原段落 */}
      <div className="inline-edit-label">原段落（{selectedText.length} 字）</div>
      <div className="inline-edit-block muted">{selectedText || '(空)'}</div>

      {/* 上下文範圍選擇 */}
      <div className="inline-edit-label">上下文範圍</div>
      <div className="inline-edit-radio-row">
        <label>
          <input
            type="radio"
            name="ctx-mode"
            checked={contextMode === 'window'}
            onChange={() => setContextMode('window')}
            disabled={isGenerating}
          />
          前後各 {inlineEdit.contextChars} 字
        </label>
        <label>
          <input
            type="radio"
            name="ctx-mode"
            checked={contextMode === 'full'}
            onChange={() => setContextMode('full')}
            disabled={isGenerating}
          />
          全章（{fullContent.length} 字）
        </label>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          （預設值可在偏好設定調整）
        </span>
      </div>

      {/* 調整指令 */}
      <div className="inline-edit-label">調整方向（最高優先級）</div>
      <textarea
        className="form-textarea"
        value={adjustText}
        onChange={(e) => setAdjustText(e.target.value)}
        placeholder="輸入想要調整的方向，例如：「加強主角內心掙扎」、「節奏放慢，加入景物描寫」、「對話更口語化」..."
        style={{ minHeight: 80 }}
        disabled={isGenerating}
        autoFocus
      />

      {/* 生成結果預覽 */}
      {generatedContent !== null && (
        <>
          <div className="inline-edit-label">
            生成結果（{generatedPart.trim().length} 字）— 將替換原段落
          </div>
          <div className="inline-edit-block">{generatedPart || '(空)'}</div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
            按「↻ 重新生成」可同指令重試或修改指令再試；按「✅ 接受寫入」才會更新章節並建立版本快照。
          </p>
        </>
      )}
    </Modal>
  );
}
