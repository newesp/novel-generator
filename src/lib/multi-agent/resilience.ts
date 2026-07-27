import { storage } from '../storage';
import type { GenerationRunStatus } from '../../types';
import { syncGenerationRun } from '../../stores/generationRunStore';

const runAbortControllers = new Map<string, AbortController>();
const cancelledRunIds = new Set<string>();

export function registerRunAbortController(runId: string): AbortController {
  runAbortControllers.get(runId)?.abort('Generation run superseded');
  const controller = new AbortController();
  runAbortControllers.set(runId, controller);
  return controller;
}

export function getRunAbortController(runId: string): AbortController | undefined {
  return runAbortControllers.get(runId);
}

export function releaseRunAbortController(runId: string): void {
  runAbortControllers.delete(runId);
}

export function isCancellationError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && error.name === 'AbortError';
}

export function isRunCancellationRequested(runId: string): boolean {
  return cancelledRunIds.has(runId);
}

export async function assertRunWritable(runId: string): Promise<void> {
  if (cancelledRunIds.has(runId)) {
    throw new DOMException('Generation run was cancelled', 'AbortError');
  }
  const run = await storage.generationRuns.get(runId);
  if (cancelledRunIds.has(runId) || !run || run.status === 'cancelled') {
    throw new DOMException('Generation run was cancelled', 'AbortError');
  }
}

export async function cancelRun(runId: string): Promise<void> {
  cancelledRunIds.add(runId);
  const controller = runAbortControllers.get(runId);
  if (controller) {
    controller.abort('User cancelled generation run');
    runAbortControllers.delete(runId);
  }

  const run = await storage.generationRuns.get(runId);
  if (!run) {
    cancelledRunIds.delete(runId);
    return;
  }
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    cancelledRunIds.delete(runId);
    return;
  }

  await storage.generationRuns.update(runId, {
    status: 'cancelled',
    cancelledAt: Date.now(),
    updatedAt: Date.now(),
    activity: {
      ...(run.activity ?? { phase: 'cancelled' as const }),
      phase: 'cancelled',
      queuePosition: undefined,
      pauseReason: undefined,
      message: '已停止生成，正文已解鎖',
      errorMessage: undefined,
    },
  });
  await syncGenerationRun(runId);
}

export function isRunCancelled(status: GenerationRunStatus): boolean {
  return status === 'cancelled';
}

/**
  * App Startup Safety Check:
  * Ensures no automated paid LLM requests are automatically triggered on app startup.
  * Normalizes any 'running' or 'pending' state into 'awaiting_input' (awaiting resume).
  */
export async function sanitizeStartupRuns(): Promise<void> {
  const allRuns = await storage.generationRuns.listAll();
  for (const run of allRuns) {
    if (run.status === 'running' || run.status === 'pending') {
      const steps = await storage.generationSteps.listByRun(run.id);
      const latestRunningStep = steps
        .filter((step) => step.status === 'running')
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (latestRunningStep) {
        await storage.generationSteps.update(latestRunningStep.id, {
          status: 'failed',
          errorText: 'App 在此步驟執行期間中斷；未自動重送，以避免重複計費。',
          completedAt: Date.now(),
        });
      }
      await storage.generationRuns.update(run.id, {
        status: 'awaiting_input',
        updatedAt: Date.now(),
        activity: {
          ...(run.activity ?? { phase: 'awaiting_input' as const }),
          phase: 'awaiting_input',
          currentRole: latestRunningStep?.role ?? run.activity?.currentRole ?? 'planner',
          queuePosition: undefined,
          pauseReason: 'interrupted',
          message: '上次執行被中斷；為避免重複計費，請手動重試或取消',
        },
      });
    }
  }
}
