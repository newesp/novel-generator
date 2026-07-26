import { storage } from '../storage';
import { adoptCandidateDraft } from './critic';
import { executeEditorStep } from './editor';
import type { GenerationCheckpoint, GenerationStep } from '../../types';

export async function humanAdoptDraft(runId: string): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);

  const checkpoints = await storage.generationCheckpoints.listByRun(runId);
  const draftChk = checkpoints
    .filter((c) => c.stateName === 'writer_done' || c.stateName === 'editor_done' || c.stateName === 'human_edited')
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!draftChk) throw new Error('找不到可採用的候選草稿');

  const { candidateDraft, draftVersion } = JSON.parse(draftChk.data);
  await adoptCandidateDraft(runId, candidateDraft, draftVersion);

  const curSummary = run.summary || {
    totalSteps: (await storage.generationSteps.listByRun(runId)).length,
    totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    revisionsUsed: 0,
  };

  await storage.generationRuns.update(runId, {
    summary: {
      ...curSummary,
      finalDecision: 'human_pass',
      completedAt: Date.now(),
    },
  });
}

export async function humanSendToEditor(
  runId: string,
  customDirection?: string,
  allowExtraRevision = false,
): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);

  if (customDirection && customDirection.trim().length > 0) {
    const checkpoints = await storage.generationCheckpoints.listByRun(runId);
    const criticChk = checkpoints
      .filter((c) => c.stateName === 'critic_done')
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (criticChk) {
      try {
        const feedback = JSON.parse(criticChk.data);
        feedback.requiredChanges = [
          ...(feedback.requiredChanges || []),
          `[使用者人工補充方向]: ${customDirection.trim()}`,
        ];
        await storage.generationCheckpoints.update?.(criticChk.id, {
          data: JSON.stringify(feedback),
        } as any);
      } catch {}
    }
  }

  if (allowExtraRevision) {
    // Increase snapshot maxRevisions by 1 for user-authorized extra iteration
    await storage.generationRuns.update(runId, {
      snapshot: {
        ...run.snapshot,
        maxRevisions: (run.snapshot.maxRevisions || 3) + 1,
      },
    });
  }

  await executeEditorStep(runId);
}

export async function humanEditDraft(
  runId: string,
  editedText: string,
): Promise<{ draftVersion: number; checkpoint: GenerationCheckpoint }> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);

  const checkpoints = await storage.generationCheckpoints.listByRun(runId);
  const draftChk = checkpoints
    .filter((c) => c.stateName === 'writer_done' || c.stateName === 'editor_done' || c.stateName === 'human_edited')
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  let currentVersion = 1;
  if (draftChk) {
    try {
      currentVersion = Number(JSON.parse(draftChk.data).draftVersion || 1);
    } catch {}
  }

  const nextDraftVersion = currentVersion + 1;
  const stepId = `step_${Date.now()}_human_edit`;

  const step: GenerationStep = {
    id: stepId,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    role: 'editor',
    status: 'completed',
    attempt: 1,
    prompt: '[人工直接修改草稿]',
    response: editedText,
    createdAt: Date.now(),
    completedAt: Date.now(),
  };
  await storage.generationSteps.add(step);

  const checkpoint: GenerationCheckpoint = {
    id: `chk_${Date.now()}_human_edited_${nextDraftVersion}`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stepId,
    stateName: 'human_edited',
    data: JSON.stringify({ candidateDraft: editedText, draftVersion: nextDraftVersion }),
    createdAt: Date.now(),
  };
  await storage.generationCheckpoints.add(checkpoint);

  await storage.generationRuns.update(runId, {
    status: 'awaiting_input',
    updatedAt: Date.now(),
  });

  return { draftVersion: nextDraftVersion, checkpoint };
}
