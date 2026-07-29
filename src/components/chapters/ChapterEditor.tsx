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
  generationErrorText,
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
import {
  BEAT_PRESETS,
  normalizeBeat,
  resolveBeatLabel,
  t,
} from '../../lib/language-policy';

interface InlineEditTarget {
  start: number;
  end: number;
}

export function ChapterEditor() {
  const { project, chapters, characters, updateChapter, deleteChapter, saveVersion, loadVersions, loadChapters } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();
  const openAgentRun = useUIStore((state) => state.openAgentRun);
  const openSettings = useUIStore((state) => state.openSettings);
  const { llmConfig, wikiPrefs, generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
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
  const quickGenerationActivity = useLocalAIActivity(locale);
  const pointsActivity = useLocalAIActivity(locale);
  const [contentViewMode, setContentViewMode] = useState<EditPreviewMode>('edit');
  const [justSaved, setJustSaved] = useState(false);

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
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<string>>(new Set());
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
      alert(generationErrorText((err as Error).message, locale));
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
      setBeat(resolveBeatLabel(chapter.beat, generalPrefs.interfaceLocale));
      setTargetWords(chapter.targetWords?.toString() ?? '');
      setPoints(chapter.points);
      setReferenceChapterId(chapter.referenceChapterId ?? '');
      loadVersions(chapter.id);
    }
  }, [chapter?.id, chapter?.updatedAt, generalPrefs.interfaceLocale]);

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
        {t('chapterEditor.noChapterSelected', undefined, locale)}
      </div>
    );
  }

  const apiReady = isLLMReady(llmConfig);
  const worldReady = !!(project?.worldSetting);

  const handleSave = async () => {
    try {
      await updateChapter(chapter.id, {
        title, content, beat: normalizeBeat(beat), points,
        targetWords: targetWords ? parseInt(targetWords, 10) : undefined,
        referenceChapterId: referenceChapterId || null,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      alert(t('chapterEditor.saveFailed', { message: (err as Error).message }, locale));
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('chapterEditor.deleteConfirm', { title: chapter.title }, locale))) return;
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
      characters: formatCharacters(characters, project?.writingLanguage ?? 'zh-Hant'),
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
      '',
      project?.writingLanguage ?? 'zh-Hant',
    );
  };

  const runGeneration = async () => {
    if (!apiReady) {
      alert(t('chapterEditor.apiRequired', undefined, locale));
      return;
    }
    if (!worldReady) {
      alert(t('chapterEditor.worldRequired', undefined, locale));
      return;
    }
    const signal = quickGenerationActivity.start(
      t('chapterEditor.quickGenerationActivity', undefined, locale),
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
        targetWords: targetWords || t('chapterEditor.unspecified', undefined, locale),
        referenceChapterId: referenceChapterId || t('chapterEditor.none', undefined, locale),
        provider: llmConfig.provider,
        model: llmConfig.model,
      });
      const result = await complete(prompt, { writingLanguage: project?.writingLanguage }, signal);
      setContent(result);
      await updateChapter(chapter.id, { content: result });
      quickGenerationActivity.succeed(t('chapterEditor.quickGenerationDone', undefined, locale));
    } catch (err) {
      quickGenerationActivity.fail(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegeneratePoints = async () => {
    if (!apiReady) {
      alert(t('chapterEditor.apiRequired', undefined, locale));
      return;
    }
    const refChapter = referenceChapterId
      ? chapters.find((c) => c.id === referenceChapterId)
      : undefined;
    const signal = pointsActivity.start(t('chapterEditor.regeneratePointsActivity', undefined, locale));
    setIsRegeneratingPoints(true);
    try {
      const newPoints = await regenerateChapterPoints({
        worldSetting: project?.worldSetting ?? '',
        mainPlot: project?.mainPlot ?? '',
        charactersList: formatCharacters(characters, project?.writingLanguage ?? 'zh-Hant'),
        chapterTitle: title,
        beat,
        referenceChapter: refChapter
          ? { title: refChapter.title, content: refChapter.content }
          : undefined,
        currentPoints: points,
        writingLanguage: project?.writingLanguage,
      }, signal);
      if (newPoints) {
        setPoints(newPoints);
        pointsActivity.succeed(t('chapterEditor.pointsGenerated', undefined, locale));
      } else {
        throw new Error(t('chapterEditor.pointsNoResult', undefined, locale));
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
      alert(generationErrorText((error as Error).message, locale));
    }
  };

  const handleCancelGenerationRun = async (runId: string) => {
    const confirmed = confirm(t('chapterEditor.cancelRunConfirm', undefined, locale));
    if (!confirmed) return;
    setIsCancellingRun(true);
    try {
      await cancelRun(runId);
      setReviewContext(null);
      setReviewRunId(null);
    } catch (error) {
      alert(generationErrorText((error as Error).message, locale));
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
      alert(generationErrorText((error as Error).message, locale));
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
        alert(generationErrorText((error as Error).message, locale));
      }
      return;
    }
    if (pauseReason === 'configuration_blocked') {
      openSettings('llm');
      return;
    }
    openAgentRun(visibleRun.chapterId, visibleRun.id);
  };

  const otherChapters = chapters.filter((c) => c.id !== chapter.id);
  const visibleActivity = visibleRun ? normalizedActivity(visibleRun, locale) : null;
  const runPrimaryLabel =
    visibleRun?.status === 'completed' || visibleRun?.status === 'cancelled'
      ? t('chapterEditor.viewHistory', undefined, locale)
      : visibleRun?.status === 'failed'
        ? t('chapterEditor.viewError', undefined, locale)
        : visibleActivity && isReviewPause(visibleActivity.pauseReason)
          ? t('chapterEditor.reviewNow', undefined, locale)
          : visibleActivity?.pauseReason === 'configuration_blocked'
            ? t('chapterEditor.fixSettings', undefined, locale)
            : visibleActivity?.pauseReason === 'interrupted'
              || visibleActivity?.pauseReason === 'format_repair_failed'
              ? t('chapterEditor.retryStep', undefined, locale)
              : t('chapterEditor.viewRun', undefined, locale);

  return (
    <>
      <div className="editor-header">
        <span className="toolbar-label" style={{ fontSize: 13 }}>{t('chapterEditor.chapterTitle', undefined, locale)}</span>
        <div className="editor-title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !isChapterLocked && handleSave()}
            placeholder={t('chapterEditor.titlePlaceholder', undefined, locale)}
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
          {t('chapterEditor.delete', undefined, locale)}
        </Button>
      </div>

      <div className="editor-toolbar">
        <Button
          variant="secondary"
          style={{ height: 32, fontSize: 13 }}
          onClick={() => setShowPointsModal(true)}
          disabled={isChapterLocked}
        >
          {t('chapterEditor.settings', undefined, locale)}
        </Button>
        <span className="chapter-settings-summary">
          {beat || t('chapterEditor.noBeat', undefined, locale)} · {targetWords
            ? t('common.words', { count: targetWords }, locale)
            : t('chapterEditor.noTargetLength', undefined, locale)}
          {points ? ` · ${t('chapterEditor.pointsSummary', { count: points.length }, locale)}` : ''}
        </span>
        <div className="toolbar-spacer" />
      </div>

      {visibleRun && visibleActivity && !dismissedRunIds.has(visibleRun.id) && (
        <div className="chapter-ai-activity">
          <AIActivityCard
            role={visibleActivity.currentRole}
            title={generationRunTitle(visibleRun, locale)}
            message={visibleActivity.message}
            errorMessage={visibleActivity.errorMessage}
            startedAt={visibleActivity.startedAt ?? visibleRun.createdAt}
            tone={generationRunTone(visibleRun)}
            running={visibleRun.status === 'running' || visibleRun.status === 'pending'}
            onDismiss={() => setDismissedRunIds((prev) => new Set(prev).add(visibleRun.id))}
            steps={
              <div className="agent-phase-steps" aria-label={t('chapterEditor.agentFlow', undefined, locale)}>
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
              label: isCancellingRun
                ? t('chapterEditor.stopping', undefined, locale)
                : t('chapterEditor.stopAndUnlock', undefined, locale),
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
            title={t('chapterEditor.quickGenerationTitle', undefined, locale)}
            message={t('chapterEditor.quickGenerationActivity', undefined, locale)}
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
            extra={<span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('chapterEditor.contentCharacters', { count: content.length }, locale)}</span>}
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
                  ? t('chapterEditor.lockedPlaceholder', undefined, locale)
                  : t('chapterEditor.bodyPlaceholder', undefined, locale)
              }
            />
          ) : (
            <div className="editor-preview" onDoubleClick={() => setContentViewMode('edit')} title={t('chapterEditor.previewDoubleClick', undefined, locale)}>
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
          {t('chapterEditor.saveVersion', undefined, locale)}
        </Button>
        {(() => {
          const s = chapter.wikiSyncStatus;
          const label =
            s === 'unsynced'      ? t('chapterEditor.saveToWiki', undefined, locale) :
            s === 'synced'        ? t('chapterEditor.resaveToWiki', undefined, locale) :
            s === 'stale'         ? t('chapterEditor.wikiStale', undefined, locale) :
            s === 'partial'       ? t('chapterEditor.wikiPartial', { count: failedCount }, locale) :
                                    t('chapterEditor.wikiPartialStale', undefined, locale);
          const onWikiClick = async () => {
            if (wikiBusy || isChapterLocked) return;
            if (s === 'partial' || s === 'partial_stale') { setShowPartial(true); return; }
            setWikiBusy(true);
            try {
              const r = await ingestChapter(chapter);
              const createN = r.plan.operations.filter((o) => o.action === 'create').length;
              const updateN = r.plan.operations.filter((o) => o.action === 'update').length;
              const failedSuffix = r.failedCount > 0
                ? t('chapterEditor.wikiFailedSuffix', { count: r.failedCount }, locale)
                : '';
              const msg = t('chapterEditor.wikiUpdated', {
                created: createN,
                updated: updateN,
                failedSuffix,
              }, locale);
              setToast({ msg, variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
              if (project) await loadChapters(project.id);
            } catch (e) {
              setToast({ msg: t('chapterEditor.ingestFailed', { message: (e as Error).message }, locale), variant: 'danger', batchId: '' });
            } finally {
              setWikiBusy(false);
            }
          };
          const noContent = !content.trim();
          const tooltip = isChapterLocked
            ? t('chapterEditor.lockedWikiTooltip', undefined, locale)
            : noContent
            ? t('chapterEditor.noContentTooltip', undefined, locale)
            : s === 'synced'
              ? t('chapterEditor.resyncWikiTooltip', undefined, locale)
              : undefined;
          return (
            <Button
              variant="secondary"
              onClick={onWikiClick}
              disabled={wikiBusy || noContent || isChapterLocked}
              title={tooltip}
            >
              {wikiBusy ? t('chapterEditor.savingToWiki', undefined, locale) : label}
            </Button>
          );
        })()}
        <div className="toolbar-spacer" />
        <Button variant="secondary" onClick={handleSave} disabled={isChapterLocked}>
          {justSaved ? t('chapterEditor.saved', undefined, locale) : t('chapterEditor.save', undefined, locale)}
        </Button>
        
        {/* Split action button */}
        <div style={{ display: 'inline-flex', position: 'relative' }}>
          <Button
            variant="primary"
            onClick={runGeneration}
            disabled={isGenerating || !apiReady || !worldReady || isChapterLocked}
            style={{ borderRadius: '6px 0 0 6px' }}
            title={
              isChapterLocked ? t('chapterEditor.lockedGenerationTooltip', undefined, locale)
              : !apiReady ? t('chapters.apiRequired', undefined, locale)
              : !worldReady ? t('chapters.outlineRequired', undefined, locale)
              : ''
            }
          >
            {isGenerating
              ? t('chapterEditor.quickGenerating', undefined, locale)
              : t('chapterEditor.quickGenerate', undefined, locale)}
          </Button>
          <Button
            variant="primary"
            disabled={isGenerating || !apiReady || !worldReady || isChapterLocked}
            onClick={() => setShowSplitMenu((v) => !v)}
            style={{ borderRadius: '0 6px 6px 0', borderLeft: '1px solid rgba(255, 255, 255, 0.2)', padding: '0 8px' }}
            title={t('chapterEditor.chooseGenerationMode', undefined, locale)}
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
                {t('chapterEditor.highQualityGeneration', undefined, locale)}
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
          writingLanguage={generationRuns.find((r) => r.id === reviewRunId)?.snapshot?.writingLanguage}
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
        title={t('chapterEditor.settingsTitle', undefined, locale)}
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPointsModal(false)} disabled={isRegeneratingPoints}>{t('common.cancel', undefined, locale)}</Button>
            <Button variant="primary" disabled={isRegeneratingPoints} onClick={async () => {
              await updateChapter(chapter.id, {
                referenceChapterId: referenceChapterId || null,
                beat: normalizeBeat(beat),
                targetWords: targetWords ? parseInt(targetWords, 10) : undefined,
                points,
              });
              setShowPointsModal(false);
            }}>{t('common.save', undefined, locale)}</Button>
          </>
        }
      >
        <div className="chapter-settings-form">
          {pointsActivity.activity.phase !== 'idle' && (
            <LocalAIActivityCard
              activity={pointsActivity.activity}
              title={t('chapterEditor.pointsActivityTitle', undefined, locale)}
              message={t('chapterEditor.regeneratePointsActivity', undefined, locale)}
              onCancel={pointsActivity.cancel}
              onDismiss={pointsActivity.reset}
              compact
            />
          )}
          <label className="form-group">
            <span className="form-label">{t('chapterEditor.referenceChapter', undefined, locale)}</span>
            <select
              className="form-select"
              value={referenceChapterId}
              onChange={(event) => setReferenceChapterId(event.target.value)}
              disabled={isRegeneratingPoints}
            >
              <option value="">{t('chapterEditor.noReference', undefined, locale)}</option>
              {otherChapters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}{item.content ? '' : t('chapterEditor.referenceNoContent', undefined, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">{t('chapterEditor.targetLength', undefined, locale)}</span>
            <input
              type="number"
              className="form-input"
              value={targetWords}
              onChange={(event) => setTargetWords(event.target.value)}
              placeholder={t('chapterEditor.targetLengthPlaceholder', undefined, locale)}
              disabled={isRegeneratingPoints}
            />
          </label>

          <label className="form-group">
            <span className="form-label">{t('chapterEditor.chapterBeat', undefined, locale)}</span>
            <input
              className="form-input"
              list="beat-list"
              value={beat}
              onChange={(event) => setBeat(event.target.value)}
              placeholder={t('chapterEditor.beatPlaceholder', undefined, locale)}
              disabled={isRegeneratingPoints}
            />
            <datalist id="beat-list">
              {BEAT_PRESETS.map((item) => (
                <option key={item.code} value={generalPrefs.interfaceLocale === 'en' ? item.labelEn : item.labelZh} />
              ))}
            </datalist>
          </label>

          <div className="form-group">
            <div className="chapter-points-label">
              <span className="form-label">{t('chapterEditor.keyPoints', undefined, locale)}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRegeneratePoints}
                disabled={isRegeneratingPoints || !apiReady}
                title={!apiReady
                  ? t('chapterEditor.setApiFirst', undefined, locale)
                  : !beat ? t('chapterEditor.setBeatFirst', undefined, locale) : ''}
              >
                {isRegeneratingPoints
                  ? t('chapterEditor.generating', undefined, locale)
                  : t('chapterEditor.aiReorganize', undefined, locale)}
              </Button>
            </div>
            <textarea
              className="form-textarea"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder={t('chapterEditor.pointsPlaceholder', undefined, locale)}
              style={{ minHeight: 160 }}
              disabled={isRegeneratingPoints}
            />
            <p className="form-hint">
              {t('chapterEditor.pointsReferenceHint', {
                reference: referenceChapterId
                  ? t('chapterEditor.referenceNamed', {
                    title: chapters.find((item) => item.id === referenceChapterId)?.title
                      || t('common.unknown', undefined, locale),
                  }, locale)
                  : t('chapterEditor.referenceNotSet', undefined, locale),
              }, locale)}
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
              label: t('chapterEditor.adjustContent', undefined, locale),
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
              { label: t('chapterEditor.retryRemaining', undefined, locale), onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (!b) { setWikiBusy(false); return; }
                    const r = await retryRemaining(chapter, b);
                    setToast({ msg: t('chapterEditor.retryCompleted', { ok: r.okCount, failed: r.failedCount }, locale), variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
              { label: t('chapterEditor.undo', undefined, locale), onClick: async () => {
                  setShowPartial(false);
                  const b = await findLatestIngestBatch(chapter);
                  if (b) await undoBatch(chapter, b);
                  if (project) await loadChapters(project.id);
              }},
              { label: t('chapterEditor.rerunAll', undefined, locale), onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (b) await undoBatch(chapter, b);
                    const r = await ingestChapter(chapter);
                    setToast({ msg: t('chapterEditor.rerunCompleted', { ok: r.okCount, failed: r.failedCount }, locale), variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
            ] : [
              { label: t('chapterEditor.undoAndReingest', undefined, locale), onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (b) await undoBatch(chapter, b);
                    const r = await ingestChapter(chapter);
                    setToast({ msg: t('chapterEditor.reingestCompleted', { ok: r.okCount, failed: r.failedCount }, locale), variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
              { label: t('chapterEditor.undoOnly', undefined, locale), onClick: async () => {
                  setShowPartial(false);
                  const b = await findLatestIngestBatch(chapter);
                  if (b) await undoBatch(chapter, b);
                  if (project) await loadChapters(project.id);
              }},
              { label: t('chapterEditor.rerunAll', undefined, locale), onClick: async () => {
                  setShowPartial(false); setWikiBusy(true);
                  try {
                    const b = await findLatestIngestBatch(chapter);
                    if (b) await undoBatch(chapter, b);
                    const r = await ingestChapter(chapter);
                    setToast({ msg: t('chapterEditor.rerunCompleted', { ok: r.okCount, failed: r.failedCount }, locale), variant: r.failedCount ? 'warn' : 'success', batchId: r.batchId });
                  } finally { if (project) await loadChapters(project.id); setWikiBusy(false); }
              }},
            ]
          }
        />
      )}

    </>
  );
}
