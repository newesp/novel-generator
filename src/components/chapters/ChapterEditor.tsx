import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { VersionPanel } from './VersionPanel';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { complete } from '../../lib/llm';
import { allocateBudget, buildGenerationPrompt } from '../../lib/context-budget';

const BEATS = [
  '引入 (Inciting Incident)',
  '衝突升級 (Rising Action)',
  '中點轉折 (Midpoint Twist)',
  '高潮 (Climax)',
  '結局 (Resolution)',
  '鋪墊/過渡',
];

export function ChapterEditor() {
  const { project, chapters, updateChapter, deleteChapter, saveVersion, loadVersions } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();

  const chapter = chapters.find((c) => c.id === selectedChapterId);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [beat, setBeat] = useState('');
  const [targetWords, setTargetWords] = useState<string>('');
  const [points, setPoints] = useState('');
  const [referenceChapterId, setReferenceChapterId] = useState('');
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustText, setAdjustText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handleSave = async () => {
    await updateChapter(chapter.id, {
      title, content, beat, points,
      targetWords: targetWords ? parseInt(targetWords) : null,
    });
  };

  const handleDelete = async () => {
    if (!confirm(`刪除章節「${chapter.title}」？`)) return;
    await deleteChapter(chapter.id);
    setSelectedChapterId(null);
  };

  const handleSaveVersion = async () => {
    await saveVersion(chapter.id, content, '');
  };

  const buildPrompt = (adjustInstruction = '') => {
    const refChapter = referenceChapterId
      ? chapters.find((c) => c.id === referenceChapterId)
      : (() => {
          const idx = chapters.findIndex((c) => c.id === chapter.id);
          return idx > 0 ? chapters[idx - 1] : undefined;
        })();

    const allocation = allocateBudget({
      worldSetting: project?.worldSetting ?? '',
      beat,
      chapterPoints: points,
      referenceChapterContent: refChapter?.content ?? '',
      olderChapterSummary: '',
    });

    return buildGenerationPrompt(
      allocation,
      title,
      targetWords ? parseInt(targetWords) : null,
      adjustInstruction,
    );
  };

  const runGeneration = async (adjustInstruction = '') => {
    setIsGenerating(true);
    try {
      // Save current content as a version before regenerating, if not empty
      if (content.trim()) {
        await saveVersion(chapter.id, content, '');
      }
      const prompt = buildPrompt(adjustInstruction);
      const result = await complete(prompt);
      setContent(result);
      await updateChapter(chapter.id, { content: result });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = () => runGeneration();

  const handleRegenerate = async () => {
    await runGeneration(adjustText);
    setShowAdjustModal(false);
    setAdjustText('');
  };

  return (
    <>
      <div className="editor-header">
        <div className="editor-title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleSave} />
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
          <option value="">前一章</option>
          {chapters
            .filter((c) => c.id !== chapter.id && c.content)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
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
            className="editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleSave}
            placeholder="在此輸入章節正文，或點擊「生成」讓 AI 為您創作..."
          />
        </div>

        <VersionPanel onApplyVersion={(c) => { setContent(c); updateChapter(chapter.id, { content: c }); }} />
      </div>

      <div className="action-bar">
        <Button variant="secondary" onClick={() => setShowAdjustModal(true)}>↩️ 調整方向</Button>
        <Button variant="secondary" onClick={handleSaveVersion}>💾 存入版本</Button>
        <div className="toolbar-spacer" />
        <Button variant="secondary" onClick={handleSave}>💾 儲存</Button>
        <Button variant="secondary" onClick={() => runGeneration()} disabled={isGenerating}>
          ↩️ 重新生成
        </Button>
        <Button variant="primary" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? '✨ 生成中...' : '✨ 生成本章'}
        </Button>
      </div>

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
        <textarea
          className="form-textarea"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder="輸入給 AI 的額外提示詞，引導本章節的生成方向..."
          style={{ minHeight: 140 }}
        />
      </Modal>

      <Modal
        open={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="調整方向"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdjustModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleRegenerate} disabled={isGenerating}>
              {isGenerating ? '生成中...' : '重新生成'}
            </Button>
          </>
        }
      >
        <textarea
          className="form-textarea"
          value={adjustText}
          onChange={(e) => setAdjustText(e.target.value)}
          placeholder="輸入您想要調整的方向，例如：「加快節奏」、「增加更多對話」、「描寫更細緻」..."
          style={{ minHeight: 120 }}
        />
      </Modal>
    </>
  );
}
