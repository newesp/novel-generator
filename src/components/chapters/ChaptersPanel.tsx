import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGenerationRunStore } from '../../stores/generationRunStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { generateChapterDrafts, type ExistingChapterSummary } from '../../lib/ai-tasks';
import { isLLMReady } from '../../lib/llm';
import { formatCharacters } from '../../lib/context-budget';
import type { Chapter } from '../../types';
import { ingestChapter, retryRemaining } from '../../lib/wiki-ingest';
import { undoBatch, findLatestIngestBatch } from '../../lib/wiki-undo';
import {
  generationRunBadge,
  generationRunTone,
  isOpenGenerationRun,
} from '../../lib/multi-agent/presentation';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';
import { resolveBeatLabel, t } from '../../lib/language-policy';

function WikiBadge({ status, locale }: { status: Chapter['wikiSyncStatus']; locale: string }) {
  if (status === 'synced') return null;
  const map: Record<Exclude<Chapter['wikiSyncStatus'], 'synced'>, { text: string; color: string }> = {
    unsynced:      { text: t('chapters.wikiUnsynced', undefined, locale), color: 'var(--accent-warning, #d18b00)' },
    stale:         { text: t('chapters.wikiStale', undefined, locale), color: 'var(--accent-warning, #d18b00)' },
    partial:       { text: t('chapters.wikiPartial', undefined, locale), color: 'var(--accent-danger, crimson)'  },
    partial_stale: { text: t('chapters.wikiPartialStale', undefined, locale), color: 'var(--accent-danger, crimson)'  },
  };
  const m = map[status];
  return <span style={{ fontSize: 10, color: m.color, marginLeft: 6 }}>{m.text}</span>;
}

export function ChaptersPanel() {
  const { project, chapters, characters, loadChapters, createChapter, updateChapter, deleteChapter, reorderChapters } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId, openAgentRun } = useUIStore();
  const { llmConfig, generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
  const generationRuns = useGenerationRunStore((state) => state.runs);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiCount, setAiCount] = useState<number | ''>(5);
  const [aiProgress, setAiProgress] = useState<number>(50);
  const [isGenerating, setIsGenerating] = useState(false);
  const chapterDraftActivity = useLocalAIActivity(locale);

  // —— 多選刪除 ——
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  // —— Wiki 批次處理 ——
  const [wikiBusy, setWikiBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; cur: string } | null>(null);

  // —— Drag-and-drop ——
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  /** 'before' = 拖到目標上半部 → 插入到目標前面；'after' = 拖到下半部 → 插入到後面 */
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');

  useEffect(() => {
    if (project) loadChapters(project.id);
  }, [project?.id]);

  // 章節列表變更時，清掉已不存在的 id 在選取集裡的殘留
  useEffect(() => {
    setSelectedForDelete((prev) => {
      const valid = new Set(chapters.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [chapters]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        {t('chapters.noProject', undefined, locale)}
      </div>
    );
  }

  const apiReady = isLLMReady(llmConfig);
  const outlineReady = !!(project.worldSetting || project.mainPlot);

  const handleNewChapter = async () => {
    // 編號由 UI 從 order 自動推導，title 只放主題（保留空白讓用戶輸入）
    const id = await createChapter(
      project.id,
      project.writingLanguage === 'en' ? 'New Chapter' : '新章節',
    );
    setSelectedChapterId(id);
  };

  const handleAIGenerate = async () => {
    const signal = chapterDraftActivity.start(
      t('chapters.aiDraftActivity', { progress: aiProgress }, locale),
    );
    setIsGenerating(true);
    try {
      const existingChapters: ExistingChapterSummary[] = chapters.map((c, i) => ({
        index: i + 1,
        title: c.title,
        beat: c.beat,
        points: c.points,
      }));
      const drafts = await generateChapterDrafts({
        count: typeof aiCount === 'number' ? aiCount : 1,
        worldSetting: project.worldSetting,
        mainPlot: project.mainPlot,
        existingChapters,
        charactersList: formatCharacters(characters, project.writingLanguage),
        targetProgress: aiProgress,
        writingLanguage: project.writingLanguage,
      }, signal);

      if (drafts.length === 0) {
        throw new Error(t('chapters.aiNoResults', undefined, locale));
      }

      let firstId: string | undefined;
      for (const draft of drafts) {
        const id = await createChapter(project.id, draft.title);
        await updateChapter(id, { beat: draft.beat, points: draft.points });
        if (!firstId) firstId = id;
      }
      if (firstId) setSelectedChapterId(firstId);
      chapterDraftActivity.succeed(t('chapters.aiDraftCreated', { count: drafts.length }, locale));
      setShowAIModal(false);
    } catch (err) {
      chapterDraftActivity.fail(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // —— 多選 ——
  const toggleSelect = (id: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = chapters.length > 0 && selectedForDelete.size === chapters.length;
  const someSelected = selectedForDelete.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedForDelete(new Set());
    else setSelectedForDelete(new Set(chapters.map((c) => c.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedForDelete.size === 0) return;
    if (!confirm(t('chapters.deleteSelectedConfirm', { count: selectedForDelete.size }, locale))) return;
    for (const id of selectedForDelete) {
      await deleteChapter(id);
      if (selectedChapterId === id) setSelectedChapterId(null);
    }
    setSelectedForDelete(new Set());
  };

  // —— Drag and drop ——
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 需要 setData 才會觸發拖曳
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 依滑鼠在目標中的 y 位置判斷上半/下半
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const pos: 'before' | 'after' = offsetY < rect.height / 2 ? 'before' : 'after';

    if (targetId !== dragOverId || pos !== dropPosition) {
      setDragOverId(targetId);
      setDropPosition(pos);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只在真的離開卡片（而非進入子元素）時清除
    if (e.currentTarget === e.target) {
      // 不立即清除，避免閃爍；交由 dragend 處理
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = chapters.findIndex((c) => c.id === draggedId);
    let toIdx = chapters.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    // 重排序
    const arr = [...chapters];
    const [moved] = arr.splice(fromIdx, 1);
    // splice 之後 toIdx 可能要調整：若原本在前面被移除了，toIdx 要 -1
    if (fromIdx < toIdx) toIdx -= 1;
    const insertAt = dropPosition === 'after' ? toIdx + 1 : toIdx;
    arr.splice(insertAt, 0, moved);

    setDraggedId(null);
    setDragOverId(null);
    await reorderChapters(arr.map((c) => c.id));
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // —— Wiki 批次處理 ——
  const nonSynced = chapters.filter((c) => c.wikiSyncStatus !== 'synced');

  const batchProcess = async (list: Chapter[]) => {
    setWikiBusy(true);
    setBatchProgress({ done: 0, total: list.length, cur: '' });
    for (let i = 0; i < list.length; i++) {
      const ch = list[i];
      setBatchProgress({ done: i, total: list.length, cur: ch.title });
      try {
        if (ch.wikiSyncStatus === 'unsynced' || ch.wikiSyncStatus === 'stale') {
          await ingestChapter(ch);
        } else if (ch.wikiSyncStatus === 'partial') {
          const b = await findLatestIngestBatch(ch);
          if (b) await retryRemaining(ch, b);
        } else if (ch.wikiSyncStatus === 'partial_stale') {
          const b = await findLatestIngestBatch(ch);
          if (b) await undoBatch(ch, b);
          await ingestChapter(ch);
        }
      } catch (e) {
        console.warn('batch ingest 失敗：', ch.title, e);
      }
    }
    setBatchProgress(null);
    setWikiBusy(false);
    if (project) await loadChapters(project.id);
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
            !apiReady ? t('chapters.apiRequired', undefined, locale)
            : !outlineReady ? t('chapters.outlineRequired', undefined, locale)
            : ''
          }
        >
          {t('chapters.generateWithAI', undefined, locale)}
        </Button>
        <Button
          variant="secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleNewChapter}
        >
          {t('chapters.add', undefined, locale)}
        </Button>
      </div>

      {nonSynced.length > 0 && (
        <div style={{
          background: 'var(--bg-tertiary, #f5f5f5)', padding: 8, fontSize: 12, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', gap: 8, borderRadius: 4, marginBottom: 8,
        }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('chapters.wikiIncompleteNotice', { count: nonSynced.length }, locale)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            onClick={() => void batchProcess(nonSynced)}
            disabled={wikiBusy}
          >
            {t('chapters.batchProcess', undefined, locale)}
          </Button>
        </div>
      )}
      {batchProgress && (
        <div style={{ padding: 8, background: 'var(--bg-tertiary, #f5f5f5)', fontSize: 12, marginBottom: 8, borderRadius: 4 }}>
          {t('chapters.batchProgress', {
            done: batchProgress.done,
            total: batchProgress.total,
            title: batchProgress.cur,
          }, locale)}
        </div>
      )}

      <div className="section">
        <div className="section-title chapter-list-header">
          <span>{t('chapters.list', { count: chapters.length }, locale)}</span>
          {chapters.length > 0 && (
            <label className="select-all-label" title={t('chapters.selectAllToggle', undefined, locale)}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleSelectAll}
              />
              <span>{t('chapters.selectAll', undefined, locale)}</span>
            </label>
          )}
        </div>

        {selectedForDelete.size > 0 && (
          <div className="bulk-actions">
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('chapters.selectedCount', { count: selectedForDelete.size }, locale)}
            </span>
            <div style={{ flex: 1 }} />
            <Button
              variant="text"
              style={{ height: 26, fontSize: 12, padding: '0 8px' }}
              onClick={() => setSelectedForDelete(new Set())}
            >
              {t('chapters.clearSelection', undefined, locale)}
            </Button>
            <Button
              variant="secondary"
              style={{ height: 26, fontSize: 12, padding: '0 10px', color: '#f87171', borderColor: '#7f1d1d' }}
              onClick={handleDeleteSelected}
            >
              {t('chapters.deleteSelected', { count: selectedForDelete.size }, locale)}
            </Button>
          </div>
        )}

        {chapters.map((ch, i) => {
          const chapterRuns = generationRuns
            .filter((run) => run.chapterId === ch.id)
            .sort((a, b) => b.createdAt - a.createdAt);
          const agentRun = chapterRuns.find(isOpenGenerationRun)
            ?? (chapterRuns[0]?.status === 'failed' ? chapterRuns[0] : undefined);
          const isDragged = draggedId === ch.id;
          const isDragOver = dragOverId === ch.id && draggedId !== ch.id;
          const cls = [
            'chapter-item',
            'chapter-item-with-num',
            selectedChapterId === ch.id ? 'active' : '',
            isDragged ? 'dragging' : '',
            isDragOver ? `drag-over drag-over-${dropPosition}` : '',
          ].filter(Boolean).join(' ');
          return (
            <div
              key={ch.id}
              className={cls}
              draggable
              onDragStart={(e) => handleDragStart(e, ch.id)}
              onDragOver={(e) => handleDragOver(e, ch.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, ch.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setSelectedChapterId(ch.id)}
            >
              <div
                className="chapter-select-box"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
              >
                <input
                  type="checkbox"
                  checked={selectedForDelete.has(ch.id)}
                  onChange={() => toggleSelect(ch.id)}
                />
              </div>
              <div className="chapter-num" aria-label={t('chapters.chapterAria', { number: i + 1 }, locale)}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="chapter-item-body">
                <div className="chapter-item-title">{ch.title || t('chapters.untitled', undefined, locale)}</div>
                <div className="chapter-item-meta">
                  <span>{ch.content
                    ? t('chapters.approxCharacters', { count: ch.content.length }, locale)
                    : t('chapters.awaitingGeneration', undefined, locale)}</span>
                  {ch.beat && <span className="badge badge-gray">{resolveBeatLabel(ch.beat, generalPrefs.interfaceLocale)}</span>}
                  <WikiBadge status={ch.wikiSyncStatus} locale={locale} />
                  {agentRun && (
                    <button
                      type="button"
                      className={`badge badge-agent ${generationRunTone(agentRun)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAgentRun(ch.id, agentRun.id);
                      }}
                      title={t('chapters.openAgentRun', undefined, locale)}
                    >
                      {generationRunBadge(agentRun, locale)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {chapters.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
            {t('chapters.empty', undefined, locale)}
          </div>
        )}
      </div>

      <Modal
        open={showAIModal}
        onClose={() => {
          if (!isGenerating) {
            setShowAIModal(false);
            chapterDraftActivity.reset();
          }
        }}
        title={t('chapters.aiModalTitle', undefined, locale)}
        footer={
          <>
            <Button variant="secondary" onClick={() => {
              setShowAIModal(false);
              chapterDraftActivity.reset();
            }} disabled={isGenerating}>
              {t('common.cancel', undefined, locale)}
            </Button>
            <Button variant="primary" onClick={handleAIGenerate} disabled={isGenerating || typeof aiCount !== 'number' || aiCount < 1}>
              {isGenerating
                ? t('chapters.generating', undefined, locale)
                : t('chapters.generateCount', { count: aiCount || 1 }, locale)}
            </Button>
          </>
        }
      >
        {chapterDraftActivity.activity.phase !== 'idle' && (
          <LocalAIActivityCard
            activity={chapterDraftActivity.activity}
            title={t('chapters.aiAssistantPlansCount', { count: typeof aiCount === 'number' ? aiCount : 1 }, locale)}
            message={t('chapters.aiDraftActivity', { progress: aiProgress }, locale)}
            onCancel={chapterDraftActivity.cancel}
            onDismiss={chapterDraftActivity.reset}
            compact
          />
        )}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          {t('chapters.aiExplanation', undefined, locale)}
          {chapters.length > 0 && (
            <><br /><span style={{ color: 'var(--accent)' }}>{t('chapters.continuationMode', undefined, locale)}</span>{' '}{t('chapters.continuationDescription', {
              count: chapters.length,
              nextChapter: chapters.length + 1,
            }, locale)}</>
          )}
          <br />
          {t('chapters.bodyGenerationHint', undefined, locale)}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13 }}>{t('chapters.countLabel', undefined, locale)}</label>
          <input
            type="number"
            className="form-input"
            min={1}
            max={20}
            value={aiCount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') { setAiCount(''); return; }
              const n = parseInt(v, 10);
              if (!isNaN(n)) setAiCount(Math.min(20, n));
            }}
            onBlur={() => {
              const n = typeof aiCount === 'number' ? aiCount : parseInt(String(aiCount), 10);
              setAiCount(isNaN(n) ? 1 : Math.max(1, Math.min(20, n)));
            }}
            style={{ width: 80 }}
            disabled={isGenerating}
          />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('chapters.countHint', undefined, locale)}</span>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 13 }}>
              {t('chapters.storyProgress', undefined, locale)} <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{t('chapters.storyProgressHint', undefined, locale)}</span>
            </label>
            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{aiProgress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={aiProgress}
            onChange={(e) => setAiProgress(parseInt(e.target.value, 10))}
            disabled={isGenerating}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            <span>{t('chapters.phaseBeginning', undefined, locale)}</span>
            <span>{t('chapters.phaseMiddle', undefined, locale)}</span>
            <span>{t('chapters.phaseLate', undefined, locale)}</span>
            <span>{t('chapters.phaseEnding', undefined, locale)}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
