import { storage } from '../storage';

export async function pruneOldRunTraces(chapterId: string): Promise<void> {
  const runs = await storage.generationRuns.listByChapter(chapterId);
  const finishedRuns = runs.filter(
    (r) => (r.status === 'completed' || r.status === 'cancelled') && !r.summary?.finalDecision,
  );

  // Sort by completedAt / updatedAt descending
  finishedRuns.sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt));

  // Keep full payload for top 3 finished runs; prune older ones
  const runsToPrune = finishedRuns.slice(3);

  for (const run of runsToPrune) {
    const steps = await storage.generationSteps.listByRun(run.id);
    for (const step of steps) {
      // Clear large prompt/response text, retain usage/status/model trace summary
      await storage.generationSteps.update(step.id, {
        prompt: '[過期軌跡大內容已清理]',
        response: step.response ? '[過期軌跡大內容已清理]' : undefined,
      });
    }
  }
}

export async function deleteGenerationRunRecord(runId: string): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);

  if (run.status === 'running' || run.status === 'pending' || run.status === 'awaiting_input') {
    throw new Error('未結束之生成執行不可直接刪除，請先取消該執行。');
  }

  // Deleting run removes steps & checkpoints, leaves Chapter.content and ChapterVersion untouched
  await storage.generationCheckpoints.deleteByRun(runId);
  await storage.generationSteps.deleteByRun(runId);
  await storage.generationRuns.delete(runId);
}
