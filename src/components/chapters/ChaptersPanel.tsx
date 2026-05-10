import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { generateChapterDrafts } from '../../lib/ai-tasks';

export function ChaptersPanel() {
  const { project, chapters, loadChapters, createChapter, updateChapter } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();
  const { llmConfig } = useSettingsStore();
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiCount, setAiCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (project) loadChapters(project.id);
  }, [project?.id]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        請先建立專案
      </div>
    );
  }

  const apiReady = !!(llmConfig.apiKey && llmConfig.baseUrl);
  const outlineReady = !!(project.worldSetting || project.mainPlot);

  const handleNewChapter = async () => {
    const title = `第 ${chapters.length + 1} 章`;
    const id = await createChapter(project.id, title);
    setSelectedChapterId(id);
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    try {
      const drafts = await generateChapterDrafts({
        count: aiCount,
        worldSetting: project.worldSetting,
        mainPlot: project.mainPlot,
        existingChapters: chapters.map((c) => c.title),
      });

      if (drafts.length === 0) {
        alert('AI 未產出任何章節，請檢查 LLM 是否回傳預期格式');
        return;
      }

      let firstId: string | undefined;
      for (const draft of drafts) {
        const id = await createChapter(project.id, draft.title);
        await updateChapter(id, { beat: draft.beat, points: draft.points });
        if (!firstId) firstId = id;
      }
      if (firstId) setSelectedChapterId(firstId);
      setShowAIModal(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="section">
        <Button
          variant="primary"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
          onClick={() => setShowAIModal(true)}
          disabled={!apiReady || !outlineReady}
          title={
            !apiReady ? '請先設定 API'
            : !outlineReady ? '請先在大綱頁填寫世界觀或主線劇情'
            : ''
          }
        >
          ✨ AI 生成章節
        </Button>
        <Button
          variant="secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleNewChapter}
        >
          ➕ 新增章節
        </Button>
      </div>

      <div className="section">
        <div className="section-title">章節列表（{chapters.length}）</div>
        {chapters.map((ch) => (
          <div
            key={ch.id}
            className={`chapter-item${selectedChapterId === ch.id ? ' active' : ''}`}
            onClick={() => setSelectedChapterId(ch.id)}
          >
            <div className="chapter-item-title">{ch.title}</div>
            <div className="chapter-item-meta">
              <span>{ch.content ? `約 ${ch.content.length} 字` : '待生成'}</span>
              {ch.beat && <span className="badge badge-gray">{ch.beat.split(' ')[0]}</span>}
              {!ch.wikiSyncedAt && ch.content && (
                <span className="badge badge-warn">⚠️ 未存入</span>
              )}
            </div>
          </div>
        ))}
        {chapters.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
            尚未建立章節，使用上方按鈕新增或讓 AI 生成
          </div>
        )}
      </div>

      <Modal
        open={showAIModal}
        onClose={() => !isGenerating && setShowAIModal(false)}
        title="✨ AI 生成章節"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAIModal(false)} disabled={isGenerating}>
              取消
            </Button>
            <Button variant="primary" onClick={handleAIGenerate} disabled={isGenerating || aiCount < 1}>
              {isGenerating ? '生成中...' : `生成 ${aiCount} 章`}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          AI 將根據目前的世界觀與主線劇情，自動規劃章節並填入：標題、故事節拍、章節要點。
          <br />
          （正文仍需在編輯器中個別點擊「生成本章」）
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13 }}>章節數量：</label>
          <input
            type="number"
            className="form-input"
            min={1}
            max={20}
            value={aiCount}
            onChange={(e) => setAiCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            style={{ width: 80 }}
            disabled={isGenerating}
          />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>（建議 3 - 10 章）</span>
        </div>
      </Modal>
    </div>
  );
}
