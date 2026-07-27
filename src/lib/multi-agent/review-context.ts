import { storage } from '../storage';
import type { GenerationRun } from '../../types';
import type { PlannedOutline } from './planner';
import type { CriticFeedback } from './critic';

export interface PlannerReviewContext {
  kind: 'planner';
  plan: PlannedOutline;
}

export interface HumanReviewContext {
  kind: 'human';
  candidateDraft: string;
  draftVersion: number;
  feedback?: CriticFeedback;
  isMaxRevisionsReached: boolean;
}

export type GenerationReviewContext = PlannerReviewContext | HumanReviewContext;

function newest<T extends { createdAt: number }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function loadGenerationReviewContext(run: GenerationRun): Promise<GenerationReviewContext> {
  const checkpoints = await storage.generationCheckpoints.listByRun(run.id);
  if (run.activity?.pauseReason === 'planner_review') {
    const plannerCheckpoint = newest(checkpoints.filter((checkpoint) => checkpoint.stateName === 'planner_done'));
    if (!plannerCheckpoint) throw new Error('找不到 Planner 細綱檢查點');
    return { kind: 'planner', plan: JSON.parse(plannerCheckpoint.data) as PlannedOutline };
  }

  const draftCheckpoint = newest(checkpoints.filter((checkpoint) =>
    checkpoint.stateName === 'writer_done'
    || checkpoint.stateName === 'editor_done'
    || checkpoint.stateName === 'human_edited'));
  if (!draftCheckpoint) throw new Error('找不到候選草稿檢查點');
  const draftData = JSON.parse(draftCheckpoint.data) as {
    candidateDraft: string;
    draftVersion: number;
  };
  const criticCheckpoint = newest(checkpoints.filter((checkpoint) => checkpoint.stateName === 'critic_done'));
  const feedback = criticCheckpoint
    ? JSON.parse(criticCheckpoint.data) as CriticFeedback
    : undefined;
  const steps = await storage.generationSteps.listByRun(run.id);
  const revisionsUsed = steps.filter((step) => step.role === 'editor' && step.status === 'completed').length;

  return {
    kind: 'human',
    candidateDraft: draftData.candidateDraft,
    draftVersion: Number(draftData.draftVersion),
    feedback,
    isMaxRevisionsReached: revisionsUsed >= run.snapshot.maxRevisions,
  };
}
