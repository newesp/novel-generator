import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGenerationRunStore } from '../../stores/generationRunStore';
import { ChapterInspector } from './ChapterInspector';
import { AdjustContentModal } from './AdjustContentModal';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ContextMenu } from '../common/ContextMenu';
import { complete, isLLMReady } from '../../lib/llm';
import { allocateBudget, buildGenerationPrompt, formatCharacters } from '../../lib/context-budget';
import { loadWikiForGeneration } from '../../lib/wiki-loader';
import { formatWikiSection } from '../../lib/wiki-section';
import { loadOlderChapterSummaryFromWiki } from '../../lib/wiki-summary-loader';
import { logPromptToTemp } from '../../lib/prompt-log';
import { regenerateChapterPoints } from '../../lib/ai-tasks';
import { EditPreviewTabs, type EditPreviewMode } from '../common/EditPreviewTabs';
import { MarkdownView } from '../common/MarkdownView';
import { ingestChapter, retryRemaining, getFailedCountForChapter } from '../../lib/wiki-ingest';
import { undoBatch, findLatestIngestBatch } from '../../lib/wiki-undo';
import { IngestToast } from '../wiki/IngestToast';
import { IngestDiffModal } from '../wiki/IngestDiffModal';
import { WikiPartialModal } from '../wiki/WikiPartialModal';
import { MultiAgentPreflightModal } from './MultiAgentPreflightModal';
import { cancelRun, continueRun, startRun } from '../../lib/multi-agent/orchestrator';
import {
  generationRunTitle,
  generationRunTone,
  isOpenGenerationRun,
  isReviewPause,
  normalizedActivity,
} from '../../lib/multi-agent/presentation';
import {
  loadGenerationReviewContext,
  type GenerationReviewContext,
} from '../../lib/multi-agent/review-context';
import { AIActivityCard } from '../common/AIActivityCard';
import { PlannerReviewModal } from './PlannerReviewModal';
import { HumanReviewModal } from './HumanReviewModal';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';

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
  const openAgentRun = useUIStore((state) => state.openAgentRun);
  const openSettings = useUIStore((state) => state.openSettings);
  const { llmConfig, wikiPrefs } = useSettingsStore();
  const generationRuns = useGenerationRunStore((state) => state.runs);

  const chapter = chapters.find((c) => c.id === selectedChapterId);
  const chapterRuns = chapter
    ? generationRuns.filter((run) => run.chapterId === chapter.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];
  const activeRun = chapterRuns.find(isOpenGenerationRun);
  const latestRun = chapterRuns[0];
  const visibleRun = activeRun ?? latestRun;
  const isChapterLocked = Boolean(activeRun);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const observedRunRef = useRef<{ id: string; status: string } | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [beat, setBeat] = useState('');
  const [targetWords, setTargetWords] = useState<string>('');
  const [points, setPoints] = useState('');
  const [referenceChapterId, setReferenceChapterId] = useState('');
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingPoints, setIsRegeneratingPoints] = useState(false);
  const quickGenerationActivity = useLocalAIActivity();
  const pointsActivity = useLocalAIActivity();
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

  // —— Multi-Agent 高品質生成 相關狀態 ——
  const [showPreflightModal, setShowPreflightModal] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [showSplitMenu, setShowSplitMenu] = useState(false);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [reviewContext, setReviewContext] = useState<GenerationReviewContext | null>(null);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);
  const [isCancellingRun, setIsCancellingRun] = useState(false);

  const handleConfirmStartMultiAgent = async () => {
    if (!chapter || !project) return;
    setIsStartingRun(true);
    try {
      await startRun({
        bookId: project.id,
        chapterId: chapter.id,
        chapterTitle: title,
        chapterNumber: chapter.order + 1,
        targetWordCount: targetWords ? Number(targetWords) : 2000,
        storyTitle: project.title,
      });
      setShowPreflightModal(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsStartingRun(false);
    }
  };

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
  }, [chapter?.id, chapter?.updatedAt]);

  useEffect(() => {
    const current = latestRun ? { id: latestRun.id, status: latestRun.status } : null;
    const previous = observedRunRef.current;
    observedRunRef.current = current;
    if (
      project
      && chapter
      && current
      && previous?.id === current.id
      && ['pending', 'running', 'awaiting_input'].includes(previous.status)
      && ['completed', 'failed', 'cancelled'].includes(current.status)
    ) {
      void loadChapters(project.id);
      void loadVersions(chapter.id);
    }
  }, [latestRun?.id, latestRun?.status, project?.id, chapter?.id, loadChapters, loadVersions]);

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
      selectionMode: wikiPrefs.enablePickPages ? 'pick-pages' : 'auto',
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
    const olderChapterSummary = await loadOlderChapterSummaryFromWiki({
      bookId: chapter.projectId,
      currentChapterOrder: chapter.order,
      referenceChapterOrder: refChapter?.order,
      referenceChapterHasFullContent: !!refChapter?.content.trim(),
      title,
      points,
      beat,
      characterNames: characters.map((c) => c.name),
    });

    const allocation = allocateBudget({
      worldSetting: project?.worldSetting ?? '',
      mainPlot: project?.mainPlot ?? '',
      characters: formatCharacters(characters),
      beat,
      chapterPoints: points,
      referenceChapterTitle: refChapter?.title ?? '',
      referenceChapterContent: refChapter?.content ?? '',
      olderChapterSummary,
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
    const signal = quickGenerationActivity.start(
      '依章節設定、參考內容與 Wiki 組裝正文；完成前不會覆寫目前正文…',
    );
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
      const result = await complete(prompt, undefined, signal);
      setContent(result);
      await updateChapter(chapter.id, { content: result });
      quickGenerationActivity.succeed('快速生成正文已完成並儲存');
    } catch (err) {
      quickGenerationActivity.fail(err);
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
    const signal = pointsActivity.start('保留目前要點，依章節語氣與參考章節產生新版本…');
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
      }, signal);
      if (newPoints) {
        setPoints(newPoints);
        pointsActivity.succeed('已產生新要點；按儲存後才會寫入章節');
      } else {
        throw new Error('AI 未產出章節要點');
      }
    } catch (err) {
      pointsActivity.fail(err);
    } finally {
      setIsRegeneratingPoints(false);
    }
  };

  // —— 右鍵選單：調整內容 ——
  const handleTextareaContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (isChapterLocked) return;
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
    if (isChapterLocked) return;
    // 先把調整前的內容存為 inline 版本快照
    await saveVersion(chapter.id, content, '', 'inline');
    setContent(newContent);
    await updateChapter(chapter.id, { content: newContent });
    setInlineEditTarget(null);
  };

  const openRunReview = async (runId: string) => {
    const run = generationRuns.find((item) => item.id === runId);
    if (!run) return;
    if (!isReviewPause(run.activity?.pauseReason)) {
      openAgentRun(run.chapterId, run.id);
      return;
    }
    try {
      const context = await loadGenerationReviewContext(run);
      setReviewRunId(run.id);
      setReviewContext(context);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleCancelGenerationRun = async (runId: string) => {
    const confirmed = confirm(
      '停止高品質生成並解鎖正文？\n\n'
      + '• 正在進行的請求會嘗試立即停止，但 provider 可能已經計費。\n'
      + '• 候選草稿不會寫入正式正文。\n'
      + '• 執行軌跡會保留。\n'
      + '• 已明確採用的 Planner 節拍與要點不會回滾。',
    );
    if (!confirmed) return;
    setIsCancellingRun(true);
    try {
      await cancelRun(runId);
      setReviewContext(null);
      setReviewRunId(null);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setIsCancellingRun(false);
    }
  };

  const submitReview = async (action: () => Promise<void>, reloadChapter = false) => {
    setIsReviewSubmitting(true);
    try {
      await action();
      setReviewContext(null);
      setReviewRunId(null);
      if (reloadChapter && project) await loadChapters(project.id);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  const handleRunPrimaryAction = async () => {
    if (!visibleRun) return;
    const pauseReason = visibleRun.activity?.pauseReason;
    if (isReviewPause(pauseReason)) {
      await openRunReview(visibleRun.id);
      return;
    }
    if (
      pauseReason === 'interrupted'
      || pauseReason === 'format_repair_failed'
    ) {
      try {
        await continueRun(visibleRun.id, { type: 'retry' });
      } catch (error) {
        alert((error as Error).message);
      }
      return;
    }
    if (pauseReason === 'configuration_blocked') {
      openSettings('llm');
      return;
    }
    openAgentRun(visibleRun.chapterId, visibleRun.id);
  };

  const [dismissedRunIds, setDismissedRunIds] = useState<Set<string>>(new Set());

  const otherChapters = chapters.filter((c) => c.id !== chapter.id);
  const visibleActivity = visibleRun ? normalizedActivity(visibleRun) : null;
  const runPrimaryLabel =
    visibleRun?.status === 'completed' || visibleRun?.status === 'cancelled'
      ? '查看紀錄'
      : visibleRun?.status === 'failed'
        ? '查看錯誤'
        : visibleActivity && isReviewPause(visibleActivity.pauseReason)
          ? '立即審核'
          : visibleActivity?.pauseReason === 'configuration_blocked'
            ? '修復設定'
            : visibleActivity?.pauseReason === 'interrupted'
              || visibleActivity?.pauseReason === 'format_repair_failed'
              ? '重試此步驟'
              : '查看執行';

  return (
    <>
      <div className="editor-header">
        <span className="toolbar-label" style={{ fontSize: 13 }}>章節標題</span>
        <div className="editor-title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !isChapterLocked && handleSave()}
            placeholder="輸入章節標題..."
            readOnly={isChapterLocked}
            aria-readonly={isChapterLocked}
          />
        </div>
        <Button
          variant="text"
          onClick={handleDelete}
          disabled={isChapterLocked}
          style={{ color: 'var(--text-tertiary)' }}
        >
          🗑 刪除
        </Button>
      </div>

      <div className="editor-toolbar">
        <Button
          variant="secondary"
          style={{ height: 32, fontSize: 13 }}
          onClick={() => setShowPointsModal(true)}
          disabled={isChapterLocked}
        >
          章節設定
        </Button>
        <span className="chapter-settings-summary">
          {beat || '未設定語氣'} · {targetWords ? `${targetWords} 字` : '未設定字數'}
          {points ? ` · 要點 ${points.length} 字` : ''}
        </span>
        <div className="toolbar-spacer" />
      </div>

      {visibleRun && visibleActivity && !dismissedRunIds.has(visibleRun.id) && (
        <div className="chapter-ai-activity">
          <AIActivityCard
            role={visibleActivity.currentRole}
            title={generationRunTitle(visibleRun)}
            message={visibleActivity.message}
            errorMessage={visibleActivity.errorMessage}
            startedAt={visibleActivity.startedAt ?? visibleRun.createdAt}
            tone={generationRunTone(visibleRun)}
            running={visibleRun.status === 'running' || visibleRun.status === 'pending'}
            onDismiss={() => setDismissedRunIds((prev) => new Set(prev).add(visibleRun.id))}
            steps={
              <div className="agent-phase-steps" aria-label="Agent 流程">
                {(['planner', 'writer', 'critic', 'editor'] as const).map((role) => (
                  <span key={role} className={visibleActivity.currentRole === role ? 'active' : ''}>
                    {role[0].toUpperCase() + role.slice(1)}
                  </span>
                ))}
              </div>
            }
            primaryAction={{
              label: runPrimaryLabel,
              onClick: () => void handleRunPrimaryAction(),
              disabled: isCancellingRun,
            }}
            secondaryAction={isOpenGenerationRun(visibleRun) ? {
              label: isCancellingRun ? '停止中…' : '停止並解鎖',
              onClick: () => void handleCancelGenerationRun(visibleRun.id),
              disabled: isCancellingRun,
              danger: true,
            } : undefined}
          />
        </div>
      )}

      {quickGenerationActivity.activity.phase !== 'idle' && (
        <div className="chapter-ai-activity">
          <LocalAIActivityCard
            activity={quickGenerationActivity.activity}
            title="AI 助理快速生成正文"
            message="依章節設定、參考內容與 Wiki 組裝正文…"
            onCancel={quickGenerationActivity.cancel}
            onDismiss={quickGenerationActivity.reset}
            compact
          />
        </div>
      )}

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
              readOnly={isChapterLocked}
              aria-readonly={isChapterLocked}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => !isChapterLocked && handleSave()}
              onContextMenu={handleTextareaContextMenu}
              placeholder={
                isChapterLocked
                  ? '此章節正由 Multi-Agent 進行高品質生成中，正文編輯已鎖定...'
                  : '在此輸入章節正文，或點擊「生成」讓 AI 為您創作（選取段落 → 右鍵可局部調整）...'
              }
            />
          ) : (
            <div className="editor-preview" onDoubleClick={() => setContentViewMode('edit')} title="雙擊回到編輯模式">
              <MarkdownView source={content} />
            </div>
          )}
        </div>

        <ChapterInspector
          chapterId={chapter.id}
          onOpenReviewModal={(runId) => void openRunReview(runId)}
          onApplyVersion={(c) => {
            if (!isChapterLocked) {
              setContent(c);
              void updateChapter(chapter.id, { content: c });
            }
          }}
        />
      </div>

      <div className="action-bar">
        <Button variant="secondary" onClick={handleSaveVersion} disabled={!content.trim() || isChapterLocked}>
          💾 存入版本
        </Button>
        {(() => {
          const s = chapter.wikiSyncStatus;
          const label =
            s === 'unsynced'      ? '📚 存入 Wiki' :
            s === 'synced'        ? '🔄 重新存入 Wiki' :
            s === 'stale'         ? '⚠️ Wiki 已過時，重新存入' :
            s === 'partial'       ? `⚠️ Wiki 部分失敗 (${failedCount})` :
                                    '⚠️ 部分失敗 + 已過時';
          const onWikiClick = async () => {
            if (wikiBusy || isChapterLocked) return;
            if (s === 'partial' || s === 'partial_stale') { setShowPartial(true); return; }
            setWikiBusy(true);
            try {
              const r = await ingestChapter(chapter);
              const createN = r.plan.operations.filter((o) => o.action === 'create').length;
              const updateN = r.plan.operations.filter((o) => o.action === 'update').length;
              const msg = `Wiki 已更新：新增 ${createN} 頁、修改 ${updateN} 頁` +
                          (r.failedCount > 0 ? `（${r.failedCount} 個失敗）` : '');
              setToast({ msg, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
              if (project) await loadChapters(project.id);
            } catch (e) {
              setToast({ msg: `Ingest 失敗：${(e as Error).message}`, variant: 'danger', batchId: '' });
            } finally {
              setWikiBusy(false);
            }
          };
          const noContent = !content.trim();
          const tooltip = isChapterLocked
            ? '此章節有未結束的高品質生成 Run，已鎖定'
            : noContent
            ? '請先撰寫章節內容'
            : s === 'synced'
              ? '點擊以重新讓 AI 整理 Wiki（既有頁會被合併更新）'
              : undefined;
          return (
            <Button
              variant="secondary"
              onClick={onWikiClick}
              disabled={wikiBusy || noContent || isChapterLocked}
              title={tooltip}
            >
              {wikiBusy ? '存入中…' : label}
            </Button>
          );
        })()}
        <div className="toolbar-spacer" />
        <Button variant="secondary" onClick={handleSave} disabled={isChapterLocked}>{saveLabel}</Button>
        
        {/* Split action button */}
        <div style={{ display: 'inline-flex', position: 'relative' }}>
          <Button
            variant="primary"
            onClick={runGeneration}
            disabled={isGenerating || !apiReady || !worldReady || isChapterLocked}
            style={{ borderRadius: '6px 0 0 6px' }}
            title={
              isChapterLocked ? '此章節有未結束的高品質生成執行，正文編輯已鎖定'
              : !apiReady ? '請先設定 API'
              : !worldReady ? '請先在大綱頁設定世界觀'
              : ''
            }
          >
            {isGenerating ? '✨ 快速生成中...' : '⚡ 快速生成本章'}
          </Button>
          <Button
            variant="primary"
            disabled={isGenerating || !apiReady || !worldReady || isChapterLocked}
            onClick={() => setShowSplitMenu((v) => !v)}
            style={{ borderRadius: '0 6px 6px 0', borderLeft: '1px solid rgba(255, 255, 255, 0.2)', padding: '0 8px' }}
            title="選擇生成模式"
          >
            ▾
          </Button>
          {showSplitMenu && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                bottom: '100%',
                marginBottom: 6,
                background: 'var(--bg-tertiary, #1f2937)',
                border: '1px solid var(--border-color, #374151)',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                zIndex: 100,
                minWidth: 240,
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, #374151)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onClick={() => {
                  setShowSplitMenu(false);
                  setShowPreflightModal(true);
                }}
              >
                🤖 高品質生成 (Multi-Agent)...
              </button>
            </div>
          )}
        </div>
      </div>

      <MultiAgentPreflightModal
        open={showPreflightModal}
        onClose={() => setShowPreflightModal(false)}
        onConfirmStart={handleConfirmStartMultiAgent}
        chapterTitle={title}
        chapterNumber={chapter.order + 1}
        targetWordCount={targetWords ? Number(targetWords) : 2000}
        storyTitle={project?.title}
        isStarting={isStartingRun}
      />

      {reviewRunId && reviewContext?.kind === 'planner' && (
        <PlannerReviewModal
          key={reviewRunId}
          open
          onClose={() => {
            if (!isReviewSubmitting) {
              setReviewRunId(null);
              setReviewContext(null);
            }
          }}
          plan={reviewContext.plan}
          originalBeat={beat}
          originalPoints={points}
          isSubmitting={isReviewSubmitting}
          onConfirmChoice={(choice, finalBeat, finalPoints) => submitReview(
            () => continueRun(reviewRunId, {
              type: 'planner_review',
              choice,
              beat: finalBeat,
              points: finalPoints,
            }),
            choice === 'apply_to_chapter',
          )}
        />
      )}

      {reviewRunId && reviewContext?.kind === 'human' && (
        <HumanReviewModal
          key={`${reviewRunId}-${reviewContext.draftVersion}`}
          open
          onClose={() => {
            if (!isReviewSubmitting) {
              setReviewRunId(null);
              setReviewContext(null);
            }
          }}
          candidateDraft={reviewContext.candidateDraft}
          draftVersion={reviewContext.draftVersion}
          criticFeedback={reviewContext.feedback}
          isMaxRevisionsReached={reviewContext.isMaxRevisionsReached}
          isSubmitting={isReviewSubmitting}
          onDirectAdopt={() => submitReview(
            () => continueRun(reviewRunId, { type: 'human_adopt' }),
            true,
          )}
          onSendToEditor={(customDirection, allowExtraRevision) => submitReview(
            () => continueRun(reviewRunId, {
              type: 'send_to_editor',
              customDirection,
              allowExtraRevision,
            }),
          )}
          onSaveHumanEdit={(editedText) => submitReview(
            () => continueRun(reviewRunId, { type: 'save_human_edit', editedText }),
          )}
        />
      )}

      {/* 章節設定 Modal */}
      <Modal
        open={showPointsModal}
        onClose={() => !isRegeneratingPoints && setShowPointsModal(false)}
        title="章節設定"
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPointsModal(false)} disabled={isRegeneratingPoints}>取消</Button>
            <Button variant="primary" disabled={isRegeneratingPoints} onClick={async () => {
              await updateChapter(chapter.id, {
                referenceChapterId: referenceChapterId || null,
                beat,
                targetWords: targetWords ? parseInt(targetWords, 10) : null,
                points,
              });
              setShowPointsModal(false);
            }}>儲存</Button>
          </>
        }
      >
        <div className="chapter-settings-form">
          {pointsActivity.activity.phase !== 'idle' && (
            <LocalAIActivityCard
              activity={pointsActivity.activity}
              title="AI 助理整理章節要點"
              message="保留目前內容，依章節語氣與參考章節產生新版本…"
              onCancel={pointsActivity.cancel}
              onDismiss={pointsActivity.reset}
              compact
            />
          )}
          <label className="form-group">
            <span className="form-label">參考章節</span>
            <select
              className="form-select"
              value={referenceChapterId}
              onChange={(event) => setReferenceChapterId(event.target.value)}
              disabled={isRegeneratingPoints}
            >
              <option value="">無</option>
              {otherChapters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}{item.content ? '' : '（無內容）'}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">目標字數</span>
            <input
              type="number"
              className="form-input"
              value={targetWords}
              onChange={(event) => setTargetWords(event.target.value)}
              placeholder="留空讓 AI 自行決定"
              disabled={isRegeneratingPoints}
            />
          </label>

          <label className="form-group">
            <span className="form-label">章節語氣</span>
            <input
              className="form-input"
              list="beat-list"
              value={beat}
              onChange={(event) => setBeat(event.target.value)}
              placeholder="選擇或輸入自訂語氣"
              disabled={isRegeneratingPoints}
            />
            <datalist id="beat-list">
              {BEATS.map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>

          <div className="form-group">
            <div className="chapter-points-label">
              <span className="form-label">章節要點</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRegeneratePoints}
                disabled={isRegeneratingPoints || !apiReady}
                title={!apiReady ? '請先設定 API' : !beat ? '建議先設定章節語氣' : ''}
              >
                {isRegeneratingPoints ? '生成中…' : 'AI 重新整理'}
              </Button>
            </div>
            <textarea
              className="form-textarea"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="輸入整章的情節、語氣或方向提示"
              style={{ minHeight: 160 }}
              disabled={isRegeneratingPoints}
            />
            <p className="form-hint">
              AI 重新整理會依章節語氣
              {referenceChapterId
                ? `與參考章節「${chapters.find((item) => item.id === referenceChapterId)?.title || '未知'}」`
                : '（未設定參考章節）'}
              產生要點。
            </p>
          </div>
        </div>
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
              disabled: !apiReady || isChapterLocked,
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
