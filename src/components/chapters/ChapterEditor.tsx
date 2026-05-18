import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { VersionPanel } from './VersionPanel';
import { AdjustContentModal } from './AdjustContentModal';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ContextMenu } from '../common/ContextMenu';
import { complete, isLLMReady } from '../../lib/llm';
import { allocateBudget, buildGenerationPrompt, formatCharacters } from '../../lib/context-budget';
import { loadWikiForGeneration } from '../../lib/wiki-loader';
import { formatWikiSection } from '../../lib/wiki-section';
import { logPromptToTemp } from '../../lib/prompt-log';
import { regenerateChapterPoints } from '../../lib/ai-tasks';
import { EditPreviewTabs, type EditPreviewMode } from '../common/EditPreviewTabs';
import { MarkdownView } from '../common/MarkdownView';
import { ingestChapter, retryRemaining, getFailedCountForChapter } from '../../lib/wiki-ingest';
import { undoBatch, findLatestIngestBatch } from '../../lib/wiki-undo';
import { IngestToast } from '../wiki/IngestToast';
import { IngestDiffModal } from '../wiki/IngestDiffModal';
import { WikiPartialModal } from '../wiki/WikiPartialModal';

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
  const { project, chapters, characters, updateChapter, deleteChapter, saveVersion, loadVersions, loadChapters } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();
  const { llmConfig, wikiPrefs } = useSettingsStore();

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
  const [isRegeneratingPoints, setIsRegeneratingPoints] = useState(false);
  const [contentViewMode, setContentViewMode] = useState<EditPreviewMode>('edit');
  const [saveLabel, setSaveLabel] = useState('💾 儲存');

  // Inline-edit (右鍵 → 調整內容) 相關狀態
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [inlineEditTarget, setInlineEditTarget] = useState<InlineEditTarget | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // —— Wiki ingest 相關狀態 ——
  const [wikiBusy, setWikiBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'warn' | 'danger'; batchId: string } | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [showPartial, setShowPartial] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (!chapter) { setFailedCount(0); return; }
    const s = chapter.wikiSyncStatus;
    if (s === 'partial' || s === 'partial_stale') {
      void getFailedCountForChapter(chapter).then(setFailedCount);
    } else {
      setFailedCount(0);
    }
  }, [chapter?.id, chapter?.wikiSyncStatus]);

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      setContent(chapter.content);
      setBeat(chapter.beat);
      setTargetWords(chapter.targetWords?.toString() ?? '');
      setPoints(chapter.points);
      setReferenceChapterId(chapter.referenceChapterId ?? '');
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

  const apiReady = isLLMReady(llmConfig);
  const worldReady = !!(project?.worldSetting);

  const handleSave = async () => {
    try {
      await updateChapter(chapter.id, {
        title, content, beat, points,
        targetWords: targetWords ? parseInt(targetWords) : null,
        referenceChapterId: referenceChapterId || null,
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

  const buildPrompt = async () => {
    const refChapter = referenceChapterId
      ? chapters.find((c) => c.id === referenceChapterId)
      : undefined;

    // 載入 Wiki 條目（cheap relevance filter + 預算截斷）
    // 預設 128k context window，與 context-budget.ts 的 DEFAULT_CONTEXT_WINDOW 對齊
    const ctxWindow = 128000;
    const wikiResult = await loadWikiForGeneration({
      bookId: chapter.projectId,
      contextWindowTokens: ctxWindow,
      budgetRatio: wikiPrefs.budgetRatio,
      chapterContext: {
        title,
        points,
        beat,
        referenceChapterContent: refChapter?.content ?? '',
        characterNames: characters.map((c) => c.name),
        characterAliases: [],
      },
    });
    const wikiSection = formatWikiSection(wikiResult);

    const allocation = allocateBudget({
      worldSetting: project?.worldSetting ?? '',
      mainPlot: project?.mainPlot ?? '',
      characters: formatCharacters(characters),
      beat,
      chapterPoints: points,
      referenceChapterTitle: refChapter?.title ?? '',
      referenceChapterContent: refChapter?.content ?? '',
      olderChapterSummary: '',
      wikiSection,
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
      const prompt = await buildPrompt();
      // 記錄這次傳給 AI 的完整提示詞到 temp/，方便除錯與優化延續性
      void logPromptToTemp('chapter-gen', prompt, {
        chapterId: chapter.id,
        chapterTitle: title,
        beat,
        targetWords: targetWords || '(未指定)',
        referenceChapterId: referenceChapterId || '(無)',
        provider: llmConfig.provider,
        model: llmConfig.model,
      });
      const result = await complete(prompt);
      setContent(result);
      await updateChapter(chapter.id, { content: result });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegeneratePoints = async () => {
    if (!apiReady) {
      alert('請先在「⚙️ 偏好設定」中設定 LLM endpoint 與 API Key');
      return;
    }
    const refChapter = referenceChapterId
      ? chapters.find((c) => c.id === referenceChapterId)
      : undefined;
    setIsRegeneratingPoints(true);
    try {
      const newPoints = await regenerateChapterPoints({
        worldSetting: project?.worldSetting ?? '',
        mainPlot: project?.mainPlot ?? '',
        charactersList: formatCharacters(characters),
        chapterTitle: title,
        beat,
        referenceChapter: refChapter
          ? { title: refChapter.title, content: refChapter.content }
          : undefined,
        currentPoints: points,
      });
      if (newPoints) setPoints(newPoints);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsRegeneratingPoints(false);
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
          onChange={(e) => {
            const v = e.target.value;
            setReferenceChapterId(v);
            // 下拉選單沒有 onBlur 概念，即時持久化
            updateChapter(chapter.id, { referenceChapterId: v || null });
          }}
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
          <EditPreviewTabs
            mode={contentViewMode}
            onChange={setContentViewMode}
            extra={<span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{content.length} 字</span>}
          />
          {contentViewMode === 'edit' ? (
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleSave}
              onContextMenu={handleTextareaContextMenu}
              placeholder="在此輸入章節正文，或點擊「生成」讓 AI 為您創作（選取段落 → 右鍵可局部調整）..."
            />
          ) : (
            <div className="editor-preview" onDoubleClick={() => setContentViewMode('edit')} title="雙擊回到編輯模式">
              <MarkdownView source={content} />
            </div>
          )}
        </div>

        <VersionPanel onApplyVersion={(c) => { setContent(c); updateChapter(chapter.id, { content: c }); }} />
      </div>

      <div className="action-bar">
        <Button variant="secondary" onClick={handleSaveVersion} disabled={!content.trim()}>
          💾 存入版本
        </Button>
        {(() => {
          const s = chapter.wikiSyncStatus;
          const label =
            s === 'unsynced'      ? '📚 存入 Wiki' :
            s === 'synced'        ? '✓ 已存入' :
            s === 'stale'         ? '⚠️ Wiki 已過時，重新存入' :
            s === 'partial'       ? `⚠️ Wiki 部分失敗 (${failedCount})` :
                                    '⚠️ 部分失敗 + 已過時';
          const onWikiClick = async () => {
            if (wikiBusy || s === 'synced') return;
            if (s === 'partial' || s === 'partial_stale') { setShowPartial(true); return; }
            setWikiBusy(true);
            try {
              const r = await ingestChapter(chapter);
              const createN = r.plan.operations.filter((o) => o.action === 'create').length;
              const updateN = r.plan.operations.filter((o) => o.action === 'update').length;
              const msg = `Wiki 已更新：新增 ${createN} 頁、修改 ${updateN} 頁` +
                          (r.failedCount > 0 ? `（${r.failedCount} 個失敗）` : '');
              setToast({ msg, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
              // 重新拉 chapters，讓徽章與按鈕狀態跟 DB 一致
              if (project) await loadChapters(project.id);
            } catch (e) {
              setToast({ msg: `Ingest 失敗：${(e as Error).message}`, variant: 'danger', batchId: '' });
            } finally {
              setWikiBusy(false);
            }
          };
          const noContent = !content.trim();
          return (
            <Button
              variant="secondary"
              onClick={onWikiClick}
              disabled={wikiBusy || s === 'synced' || noContent}
              title={noContent ? '請先撰寫章節內容' : undefined}
            >
              {wikiBusy ? '存入中…' : label}
            </Button>
          );
        })()}
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
        onClose={() => !isRegeneratingPoints && setShowPointsModal(false)}
        title="章節要點"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={handleRegeneratePoints}
              disabled={isRegeneratingPoints || !apiReady}
              title={
                !apiReady ? '請先設定 API'
                : !beat ? '建議先設定故事節拍以獲得更精準的要點'
                : ''
              }
            >
              {isRegeneratingPoints ? '✨ 生成中...' : '✨ 重新生成'}
            </Button>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => setShowPointsModal(false)} disabled={isRegeneratingPoints}>取消</Button>
            <Button variant="primary" disabled={isRegeneratingPoints} onClick={async () => {
              await updateChapter(chapter.id, { points });
              setShowPointsModal(false);
            }}>儲存</Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
          整章生成時的指引。需要對「整章」做風格/方向調整，請寫在這裡。
          <br />
          點擊「✨ 重新生成」會依本章的<strong>故事節拍</strong>
          {referenceChapterId
            ? <> 與<strong>參考章節</strong>（{chapters.find((c) => c.id === referenceChapterId)?.title || '未知'}）</>
            : <>（未設定參考章節）</>
          }
          ，由 AI 重寫要點。
        </p>
        <textarea
          className="form-textarea"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder="輸入給 AI 的額外提示詞，引導本章節的生成方向..."
          style={{ minHeight: 140 }}
          disabled={isRegeneratingPoints}
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

      {/* Wiki ingest 結果 toast */}
      {toast && (
        <IngestToast
          message={toast.msg}
          variant={toast.variant}
          onViewDiff={() => { if (toast.batchId) setShowDiff(toast.batchId); }}
          onUndo={async () => {
            if (toast.batchId) await undoBatch(chapter, toast.batchId);
            if (project) await loadChapters(project.id);
            setToast(null);
          }}
          onClose={() => setToast(null)}
        />
      )}

      {/* Diff Modal */}
      {showDiff && (
        <IngestDiffModal
          bookId={chapter.projectId}
          batchId={showDiff}
          onClose={() => setShowDiff(null)}
        />
      )}

      {/* Partial 處理 Modal */}
      {showPartial && (
        <WikiPartialModal
          chapter={chapter}
          onClose={() => setShowPartial(false)}
          actions={
            chapter.wikiSyncStatus === 'partial' ? [
              { label: '重試剩餘', onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (!b) { setWikiBusy(false); return; }
                    const r = await retryRemaining(chapter, b);
                    setToast({ msg: `重試完成：${r.okCount} 成功、${r.failedCount} 仍失敗`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
              { label: '還原', onClick: async () => {
                  setShowPartial(false);
                  const b = await findLatestIngestBatch(chapter);
                  if (b) await undoBatch(chapter, b);
                  if (project) await loadChapters(project.id);
              }},
              { label: '完整重跑', onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (b) await undoBatch(chapter, b);
                    const r = await ingestChapter(chapter);
                    setToast({ msg: `完整重跑完成：${r.okCount} 成功、${r.failedCount} 失敗`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
            ] : [
              { label: '還原後重新 ingest', onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (b) await undoBatch(chapter, b);
                    const r = await ingestChapter(chapter);
                    setToast({ msg: `已重新 ingest:${r.okCount} 成功、${r.failedCount} 失敗`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
              { label: '僅還原', onClick: async () => {
                  setShowPartial(false);
                  const b = await findLatestIngestBatch(chapter);
                  if (b) await undoBatch(chapter, b);
                  if (project) await loadChapters(project.id);
              }},
              { label: '完整重跑', onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (b) await undoBatch(chapter, b);
                    const r = await ingestChapter(chapter);
                    setToast({ msg: `完整重跑完成：${r.okCount} 成功、${r.failedCount} 失敗`, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
            ]
          }
        />
      )}
    </>
  );
}
