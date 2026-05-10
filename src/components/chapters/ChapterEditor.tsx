import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { VersionPanel } from './VersionPanel';
import { AdjustContentModal } from './AdjustContentModal';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ContextMenu } from '../common/ContextMenu';
import { complete } from '../../lib/llm';
import { allocateBudget, buildGenerationPrompt, formatCharacters } from '../../lib/context-budget';

const BEATS = [
  '引入 (Inciting Incident)',
  '衝突升級 (Rising Action)',
  '中點轉折 (Midpoint Twist)',
  '高潮 (Climax)',
  '結局 (Resolution)',
  '鋪墊/過渡',
];

interface InlineEditTarget {
  start: number;
  end: number;
}

export function ChapterEditor() {
  const { project, chapters, characters, updateChapter, deleteChapter, saveVersion, loadVersions } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();
  const { llmConfig } = useSettingsStore();

  const chapter = chapters.find((c) => c.id === selectedChapterId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [beat, setBeat] = useState('');
  const [targetWords, setTargetWords] = useState<string>('');
  const [points, setPoints] = useState('');
  const [referenceChapterId, setReferenceChapterId] = useState('');
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveLabel, setSaveLabel] = useState('💾 儲存');

  // Inline-edit (右鍵 → 調整內容) 相關狀態
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [inlineEditTarget, setInlineEditTarget] = useState<InlineEditTarget | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      setContent(chapter.content);
      setBeat(chapter.beat);
      setTargetWords(chapter.targetWords?.toString() ?? '');
      setPoints(chapter.points);
      setReferenceChapterId('');
      loadVersions(chapter.id);
    }
  }, [chapter?.id]);

  if (!chapter) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-tertiary)', fontSize: 14,
      }}>
        請從左側選擇或新增章節
      </div>
    );
  }

  const apiReady = !!(llmConfig.apiKey && llmConfig.baseUrl);
  const worldReady = !!(project?.worldSetting);

  const handleSave = async () => {
    try {
      await updateChapter(chapter.id, {
        title, content, beat, points,
        targetWords: targetWords ? parseInt(targetWords) : null,
      });
      setSaveLabel('✅ 已儲存');
      setTimeout(() => setSaveLabel('💾 儲存'), 1500);
    } catch (err) {
      alert(`儲存失敗：${(err as Error).message}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`刪除章節「${chapter.title}」？`)) return;
    await deleteChapter(chapter.id);
    setSelectedChapterId(null);
  };

  const handleSaveVersion = async () => {
    await saveVersion(chapter.id, content, '', 'full');
  };

  const buildPrompt = () => {
    const refChapter = referenceChapterId
      ? chapters.find((c) => c.id === referenceChapterId)
      : undefined;

    const allocation = allocateBudget({
      worldSetting: project?.worldSetting ?? '',
      mainPlot: project?.mainPlot ?? '',
      characters: formatCharacters(characters),
      beat,
      chapterPoints: points,
      referenceChapterTitle: refChapter?.title ?? '',
      referenceChapterContent: refChapter?.content ?? '',
      olderChapterSummary: '',
    });

    return buildGenerationPrompt(
      allocation,
      title,
      targetWords ? parseInt(targetWords) : null,
    );
  };

  const runGeneration = async () => {
    if (!apiReady) {
      alert('請先在「⚙️ 偏好設定」中設定 LLM endpoint 與 API Key');
      return;
    }
    if (!worldReady) {
      alert('請先在「大綱」分頁設定世界觀，AI 才能依據設定生成內容');
      return;
    }
    setIsGenerating(true);
    try {
      // 重新生成前，先把當前內容存成 full 版本
      if (content.trim()) {
        await saveVersion(chapter.id, content, '', 'full');
      }
      const prompt = buildPrompt();
      const result = await complete(prompt);
      setContent(result);
      await updateChapter(chapter.id, { content: result });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  // —— 右鍵選單：調整內容 ——
  const handleTextareaContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // 無選取或選取全為空白 → 不攔截，讓瀏覽器原生選單顯示
    if (start === end) return;
    const selectedText = content.substring(start, end);
    if (!selectedText.trim()) return;

    e.preventDefault();
    setInlineEditTarget({ start, end });
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const openInlineEditModal = () => {
    if (!inlineEditTarget) return;
    setShowAdjustModal(true);
  };

  const handleInlineEditAccept = async (newContent: string) => {
    // 先把調整前的內容存為 inline 版本快照
    await saveVersion(chapter.id, content, '', 'inline');
    setContent(newContent);
    await updateChapter(chapter.id, { content: newContent });
    setInlineEditTarget(null);
  };

  const otherChapters = chapters.filter((c) => c.id !== chapter.id);

  return (
    <>
      <div className="editor-header">
        <span className="toolbar-label" style={{ fontSize: 13 }}>章節標題</span>
        <div className="editor-title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            placeholder="輸入章節標題..."
          />
        </div>
        <Button variant="text" onClick={handleDelete} style={{ color: 'var(--text-tertiary)' }}>
          🗑 刪除
        </Button>
      </div>

      <div className="editor-toolbar">
        <span className="toolbar-label">參考章節</span>
        <select
          className="toolbar-select"
          value={referenceChapterId}
          onChange={(e) => setReferenceChapterId(e.target.value)}
        >
          <option value="">無</option>
          {otherChapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}{c.content ? '' : '（無內容）'}
            </option>
          ))}
        </select>

        <div className="toolbar-divider" />

        <span className="toolbar-label">故事節拍</span>
        <input
          className="toolbar-input"
          style={{ width: 200 }}
          list="beat-list"
          value={beat}
          onChange={(e) => setBeat(e.target.value)}
          placeholder="點擊選擇或輸入..."
        />
        <datalist id="beat-list">
          {BEATS.map((b) => <option key={b} value={b} />)}
        </datalist>

        <div className="toolbar-divider" />

        <span className="toolbar-label">目標字數</span>
        <input
          type="number"
          className="toolbar-input"
          value={targetWords}
          onChange={(e) => setTargetWords(e.target.value)}
          placeholder="留空"
          style={{ width: 90 }}
        />

        <div className="toolbar-divider" />

        <Button
          variant="text"
          style={{ height: 30, fontSize: 13 }}
          onClick={() => setShowPointsModal(true)}
        >
          📝 章節要點 {points && `(${points.length})`}
        </Button>

        <div className="toolbar-spacer" />
      </div>

      <div className="editor-body">
        <div className="editor-content">
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleSave}
            onContextMenu={handleTextareaContextMenu}
            placeholder="在此輸入章節正文，或點擊「生成」讓 AI 為您創作（選取段落 → 右鍵可局部調整）..."
          />
        </div>

        <VersionPanel onApplyVersion={(c) => { setContent(c); updateChapter(chapter.id, { content: c }); }} />
      </div>

      <div className="action-bar">
        <Button variant="secondary" onClick={handleSaveVersion} disabled={!content.trim()}>
          💾 存入版本
        </Button>
        <div className="toolbar-spacer" />
        <Button variant="secondary" onClick={handleSave}>{saveLabel}</Button>
        <Button
          variant="secondary"
          onClick={runGeneration}
          disabled={isGenerating || !content.trim() || !apiReady}
          title={!content.trim() ? '尚無內容可重新生成' : ''}
        >
          ↩️ 重新生成
        </Button>
        <Button
          variant="primary"
          onClick={runGeneration}
          disabled={isGenerating || !apiReady || !worldReady}
          title={
            !apiReady ? '請先設定 API'
            : !worldReady ? '請先在大綱頁設定世界觀'
            : ''
          }
        >
          {isGenerating ? '✨ 生成中...' : '✨ 生成本章'}
        </Button>
      </div>

      {/* 章節要點 Modal */}
      <Modal
        open={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        title="章節要點"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPointsModal(false)}>取消</Button>
            <Button variant="primary" onClick={async () => {
              await updateChapter(chapter.id, { points });
              setShowPointsModal(false);
            }}>儲存</Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
          整章生成時的指引。需要對「整章」做風格/方向調整，請寫在這裡。
        </p>
        <textarea
          className="form-textarea"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder="輸入給 AI 的額外提示詞，引導本章節的生成方向..."
          style={{ minHeight: 140 }}
        />
      </Modal>

      {/* 右鍵選單 */}
      {contextMenuPos && (
        <ContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          items={[
            {
              label: '調整內容',
              icon: '✨',
              onClick: openInlineEditModal,
              disabled: !apiReady,
            },
          ]}
          onClose={() => setContextMenuPos(null)}
        />
      )}

      {/* 局部調整 Modal */}
      {inlineEditTarget && (
        <AdjustContentModal
          open={showAdjustModal}
          onClose={() => { setShowAdjustModal(false); setInlineEditTarget(null); }}
          chapter={{ title, beat, points }}
          fullContent={content}
          selectionStart={inlineEditTarget.start}
          selectionEnd={inlineEditTarget.end}
          onAccept={handleInlineEditAccept}
        />
      )}
    </>
  );
}
