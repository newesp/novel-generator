import { storage } from '../storage';
import type {
  GenerationRun,
  GenerationRunActivity,
  GenerationStepRole,
} from '../../types';
import { useGenerationRunStore, syncGenerationRun } from '../../stores/generationRunStore';
import { createGenerationRun } from './run-manager';
import { applyPlannerReviewChoice, executePlannerStep } from './planner';
import { executeWriterStep } from './writer';
import { executeCriticStep } from './critic';
import { executeEditorStep } from './editor';
import {
  humanAdoptDraft,
  humanEditDraft,
  prepareHumanEditorRevision,
} from './human-review';
import {
  cancelRun as persistCancellation,
  isCancellationError,
  isRunCancellationRequested,
  registerRunAbortController,
  releaseRunAbortController,
  sanitizeStartupRuns,
} from './resilience';

type QueueTask = {
  runId: string;
  role: GenerationStepRole;
  execute: (signal: AbortSignal) => Promise<void>;
};

export type ContinueRunCommand =
  | {
      type: 'planner_review';
      choice: 'apply_to_chapter' | 'use_for_run_only';
      beat: string;
      points: string;
    }
  | { type: 'human_adopt' }
  | { type: 'send_to_editor'; customDirection?: string; allowExtraRevision?: boolean }
  | { type: 'save_human_edit'; editedText: string }
  | { type: 'retry' };

export interface StartRunInput {
  bookId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  targetWordCount?: number;
  storyTitle?: string;
}

let queue: QueueTask[] = [];
let activeTask: QueueTask | null = null;
let initializationPromise: Promise<void> | null = null;

function isTerminal(status: GenerationRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

async function updateRun(
  runId: string,
  status: GenerationRun['status'],
  activity: GenerationRunActivity,
  extra?: Partial<GenerationRun>,
): Promise<void> {
  if (status !== 'cancelled' && isRunCancellationRequested(runId)) return;
  await storage.generationRuns.update(runId, {
    ...extra,
    status,
    activity,
    updatedAt: Date.now(),
  });
  await syncGenerationRun(runId);
}

async function patchActivity(
  runId: string,
  status: GenerationRun['status'],
  patch: Partial<GenerationRunActivity>,
  extra?: Partial<GenerationRun>,
): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) return;
  await updateRun(runId, status, {
    ...(run.activity ?? { phase: 'preparing' }),
    ...patch,
  }, extra);
}

async function refreshQueuePositions(): Promise<void> {
  await Promise.all(queue.map(async (task, index) => {
    const run = await storage.generationRuns.get(task.runId);
    if (
      !run
      || isTerminal(run.status)
      || isRunCancellationRequested(task.runId)
      || !queue.some((queuedTask) => queuedTask.runId === task.runId)
    ) return;
    await storage.generationRuns.update(task.runId, {
      status: 'pending',
      activity: {
        ...(run.activity ?? { phase: 'queued' }),
        phase: 'queued',
        currentRole: task.role,
        queuePosition: index + 1,
        pauseReason: undefined,
        message: index === 0 ? '等待 AI 執行槽' : `前方還有 ${index} 個任務`,
        errorMessage: undefined,
      },
      updatedAt: Date.now(),
    });
  }));
  await useGenerationRunStore.getState().refreshAll();
}

function enqueue(task: QueueTask): void {
  if (activeTask?.runId === task.runId || queue.some((item) => item.runId === task.runId)) {
    throw new Error('此生成執行已在 AI 佇列中');
  }
  queue = [...queue, task];
  void refreshQueuePositions().then(drainQueue);
}

async function classifyFailure(runId: string, role: GenerationStepRole, error: unknown, signal: AbortSignal): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run || run.status === 'cancelled' || isCancellationError(error, signal)) {
    if (run && run.status !== 'cancelled') await persistCancellation(runId);
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('未設定 API Key') || message.includes('請先設定 API')) {
    await patchActivity(runId, 'awaiting_input', {
      phase: 'awaiting_input',
      currentRole: role,
      pauseReason: 'configuration_blocked',
      message: 'LLM 連線設定尚未完成',
      errorMessage: message,
    });
    return;
  }
  if (message.includes('格式自動修復失敗') || message.includes('格式修復')) {
    await patchActivity(runId, 'awaiting_input', {
      phase: 'awaiting_input',
      currentRole: role,
      pauseReason: 'format_repair_failed',
      message: '模型回應格式無法自動修復，請手動重試',
      errorMessage: message,
    });
    return;
  }
  if (
    error instanceof TypeError ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch')
  ) {
    await patchActivity(runId, 'awaiting_input', {
      phase: 'awaiting_input',
      currentRole: role,
      pauseReason: 'interrupted',
      message: '請求結果不確定；為避免重複計費，請手動重試',
      errorMessage: message,
    });
    return;
  }

  await patchActivity(runId, 'failed', {
    phase: 'failed',
    currentRole: role,
    pauseReason: undefined,
    queuePosition: undefined,
    message: `${roleLabel(role)} 執行失敗`,
    errorMessage: message,
  }, { completedAt: Date.now() });
}

async function drainQueue(): Promise<void> {
  if (activeTask) return;
  const next = queue[0];
  if (!next) return;
  queue = queue.slice(1);
  activeTask = next;
  await refreshQueuePositions();

  const run = await storage.generationRuns.get(next.runId);
  if (!run || isTerminal(run.status)) {
    activeTask = null;
    void drainQueue();
    return;
  }

  const controller = registerRunAbortController(next.runId);
  try {
    await next.execute(controller.signal);
  } catch (error) {
    await classifyFailure(next.runId, next.role, error, controller.signal);
  } finally {
    releaseRunAbortController(next.runId);
    activeTask = null;
    await refreshQueuePositions();
    void drainQueue();
  }
}

function roleLabel(role: GenerationStepRole): string {
  return role[0].toUpperCase() + role.slice(1);
}

async function runPlanner(runId: string, signal: AbortSignal): Promise<void> {
  await patchActivity(runId, 'running', {
    phase: 'planning',
    currentRole: 'planner',
    queuePosition: undefined,
    pauseReason: undefined,
    message: '整理章節節拍、要點與背景資料…',
    errorMessage: undefined,
  });
  await executePlannerStep(runId, signal);
  await patchActivity(runId, 'awaiting_input', {
    phase: 'awaiting_input',
    currentRole: 'planner',
    pauseReason: 'planner_review',
    message: 'Planner 已完成，確認細綱後 Writer 才會開始',
  });
}

async function runWriterAndReview(runId: string, signal: AbortSignal): Promise<void> {
  await patchActivity(runId, 'running', {
    phase: 'writing',
    currentRole: 'writer',
    queuePosition: undefined,
    pauseReason: undefined,
    message: '依核准細綱完成第一版候選正文…',
    errorMessage: undefined,
  });
  await executeWriterStep(runId, signal);
  await runCriticRoutingLoop(runId, signal);
}

async function runEditorAndReview(runId: string, signal: AbortSignal): Promise<void> {
  const steps = await storage.generationSteps.listByRun(runId);
  const revision = steps.filter((step) => step.role === 'editor' && step.status === 'completed').length + 1;
  await patchActivity(runId, 'running', {
    phase: 'editing',
    currentRole: 'editor',
    queuePosition: undefined,
    pauseReason: undefined,
    message: `依 Critic 意見修訂第 ${revision} 版…`,
    errorMessage: undefined,
  });
  await executeEditorStep(runId, signal);
  await runCriticRoutingLoop(runId, signal);
}

async function runCriticRoutingLoop(runId: string, signal: AbortSignal): Promise<void> {
  const before = await storage.generationSteps.listByRun(runId);
  const round = before.filter((step) => step.role === 'critic' && step.status === 'completed').length + 1;
  await patchActivity(runId, 'running', {
    phase: 'criticizing',
    currentRole: 'critic',
    queuePosition: undefined,
    pauseReason: undefined,
    message: `檢查情節、角色一致性與節奏（第 ${round} 輪）…`,
    errorMessage: undefined,
  });
  const result = await executeCriticStep(runId, signal);
  if (result.adopted) {
    await patchActivity(runId, 'completed', {
      phase: 'completed',
      currentRole: 'critic',
      pauseReason: undefined,
      message: `Critic 評分 ${result.feedback.totalScore}，候選草稿已自動採用`,
    }, { completedAt: Date.now() });
    return;
  }

  const run = await storage.generationRuns.get(runId);
  if (!run) return;
  const { humanReviewFloor } = run.snapshot.criticThresholds;
  if (!result.feedback.hasMajorFlaw && result.feedback.totalScore >= humanReviewFloor) {
    await pauseForHumanReview(runId, result.feedback.totalScore, false);
    return;
  }

  const steps = await storage.generationSteps.listByRun(runId);
  const revisionsUsed = steps.filter((step) => step.role === 'editor' && step.status === 'completed').length;
  if (revisionsUsed >= run.snapshot.maxRevisions) {
    await pauseForHumanReview(runId, result.feedback.totalScore, true);
    return;
  }

  await runEditorAndReview(runId, signal);
}

async function pauseForHumanReview(runId: string, score: number, revisionLimit: boolean): Promise<void> {
  await patchActivity(runId, 'awaiting_input', {
    phase: 'awaiting_input',
    currentRole: 'critic',
    pauseReason: revisionLimit ? 'revision_limit' : 'human_review',
    message: revisionLimit
      ? `已達修訂上限；候選草稿（${score} 分）需要你決定`
      : `候選草稿（${score} 分）需要你決定`,
  });
}

export async function initializeGenerationOrchestrator(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await sanitizeStartupRuns();
      await useGenerationRunStore.getState().refreshAll();
    })();
  }
  return initializationPromise;
}

export async function startRun(input: StartRunInput): Promise<GenerationRun> {
  const run = await createGenerationRun(
    input.bookId,
    input.chapterId,
    input.chapterTitle,
    input.chapterNumber,
    input.targetWordCount,
    input.storyTitle,
  );
  useGenerationRunStore.getState().upsert(run);
  enqueue({ runId: run.id, role: 'planner', execute: (signal) => runPlanner(run.id, signal) });
  return (await storage.generationRuns.get(run.id)) ?? run;
}

export async function continueRun(runId: string, command: ContinueRunCommand): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);
  if (isTerminal(run.status)) throw new Error('此生成執行已結束，不能繼續');

  if (command.type === 'planner_review') {
    if (run.activity?.pauseReason !== 'planner_review') throw new Error('此 Run 目前不在 Planner 審核階段');
    await applyPlannerReviewChoice(runId, command.choice, command.beat, command.points);
    await syncGenerationRun(runId);
    enqueue({ runId, role: 'writer', execute: (signal) => runWriterAndReview(runId, signal) });
    return;
  }
  if (command.type === 'human_adopt') {
    await patchActivity(runId, 'running', {
      phase: 'saving',
      message: '正在保存候選草稿與執行結果…',
      pauseReason: undefined,
    });
    await humanAdoptDraft(runId);
    await patchActivity(runId, 'completed', {
      phase: 'completed',
      message: '候選草稿已採用，正文已解鎖',
      pauseReason: undefined,
    }, { completedAt: Date.now() });
    return;
  }
  if (command.type === 'save_human_edit') {
    await humanEditDraft(runId, command.editedText);
    await patchActivity(runId, 'awaiting_input', {
      phase: 'awaiting_input',
      pauseReason: 'human_review',
      message: '人工修改已保存為新候選草稿，請決定採用或送回 Editor',
    });
    return;
  }
  if (command.type === 'send_to_editor') {
    await prepareHumanEditorRevision(runId, command.customDirection, command.allowExtraRevision);
    enqueue({ runId, role: 'editor', execute: (signal) => runEditorAndReview(runId, signal) });
    return;
  }

  const role = run.activity?.currentRole ?? 'planner';
  const task: QueueTask =
    role === 'planner'
      ? { runId, role, execute: (signal) => runPlanner(runId, signal) }
      : role === 'writer'
        ? { runId, role, execute: (signal) => runWriterAndReview(runId, signal) }
        : role === 'critic'
          ? { runId, role, execute: (signal) => runCriticRoutingLoop(runId, signal) }
          : { runId, role, execute: (signal) => runEditorAndReview(runId, signal) };
  enqueue(task);
}

export async function cancelRun(runId: string): Promise<void> {
  queue = queue.filter((task) => task.runId !== runId);
  await persistCancellation(runId);
  await refreshQueuePositions();
}
