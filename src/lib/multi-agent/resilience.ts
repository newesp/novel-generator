import { storage } from '../storage';
import type { GenerationRunStatus } from '../../types';

const runAbortControllers = new Map<string, AbortController>();

export function registerRunAbortController(runId: string): AbortController {
  const controller = new AbortController();
  runAbortControllers.set(runId, controller);
  return controller;
}

export function getRunAbortController(runId: string): AbortController | undefined {
  return runAbortControllers.get(runId);
}

export async function cancelRun(runId: string): Promise<void> {
  const controller = runAbortControllers.get(runId);
  if (controller) {
    controller.abort('User cancelled generation run');
    runAbortControllers.delete(runId);
  }

  const run = await storage.generationRuns.get(runId);
  if (!run) return;

  await storage.generationRuns.update(runId, {
    status: 'cancelled',
    cancelledAt: Date.now(),
    updatedAt: Date.now(),
  });
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
      await storage.generationRuns.update(run.id, {
        status: 'awaiting_input',
        updatedAt: Date.now(),
      });
    }
  }
}
