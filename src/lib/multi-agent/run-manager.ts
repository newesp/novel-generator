import { storage } from '../storage';
import type { GenerationRun, GenerationContextSnapshot, LLMProfile, MultiAgentPrefs } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

export interface PreflightEstimate {
  rolesCount: number;
  maxStepsCount: number;
  maxRevisions: number;
  rolesSummary: Array<{
    role: string;
    profileId: string;
    profileName: string;
    provider: string;
    model: string;
  }>;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  currency: string;
  showTokenAndCost: boolean;
}

export function calculatePreflightEstimate(
  targetWordCount: number,
  prefs: MultiAgentPrefs,
  profiles: LLMProfile[],
): PreflightEstimate {
  // Max steps: Planner (1) + Writer (1) + Critic (1) + maxRevisions * (Editor (1) + Critic (1))
  const maxStepsCount = 1 + 1 + 1 + prefs.maxRevisions * 2;
  const targetWords = Math.max(targetWordCount || 2000, 500);

  const estOutputWriterEditor = Math.round(targetWords * 1.3);
  const estOutputOther = 500;
  const totalSteps = maxStepsCount;

  const estimatedInputTokens = totalSteps * 1500;
  const estimatedOutputTokens =
    (1 + prefs.maxRevisions) * estOutputWriterEditor + (2 + prefs.maxRevisions) * estOutputOther;

  const inputCost = (estimatedInputTokens / 1_000_000) * prefs.costEstimate.inputCostPerMillion;
  const outputCost = (estimatedOutputTokens / 1_000_000) * prefs.costEstimate.outputCostPerMillion;
  const estimatedCost = Number((inputCost + outputCost).toFixed(4));

  const { activeProfileId } = useSettingsStore.getState();
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const defaultProfile = profileMap.get(activeProfileId) || profiles[0];

  const rolesSummary = (['planner', 'writer', 'critic', 'editor'] as const).map((role) => {
    const agentConfig = prefs.agents[role];
    const profile = (agentConfig.profileId ? profileMap.get(agentConfig.profileId) : undefined) || defaultProfile;
    return {
      role,
      profileId: profile?.id ?? 'default',
      profileName: profile?.name ?? '預設模型',
      provider: profile?.provider ?? 'custom',
      model: agentConfig.modelOverride || profile?.model || '',
    };
  });

  return {
    rolesCount: 4,
    maxStepsCount,
    maxRevisions: prefs.maxRevisions,
    rolesSummary,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCost,
    currency: prefs.costEstimate.currency,
    showTokenAndCost: prefs.costEstimate.showTokenAndCost,
  };
}

export async function createGenerationRun(
  bookId: string,
  chapterId: string,
  chapterTitle?: string,
  chapterNumber?: number,
  targetWordCount?: number,
  storyTitle?: string,
): Promise<GenerationRun> {
  const existingUnfinished = await storage.generationRuns.getUnfinishedByChapter(chapterId);
  if (existingUnfinished) {
    throw new Error(`章節 ${chapterId} 已有未完成的高品質生成執行 (Run ID: ${existingUnfinished.id})`);
  }

  const { multiAgentPrefs, llmProfiles } = useSettingsStore.getState();
  const profiles = llmProfiles ?? [];

  const sanitizeProfiles: Record<string, Omit<LLMProfile, 'apiKey'>> = {};
  for (const p of profiles) {
    const { apiKey, ...safeP } = p;
    sanitizeProfiles[p.id] = safeP;
  }

  const snapshot: GenerationContextSnapshot = {
    storyTitle,
    chapterNumber,
    chapterTitle,
    targetWordCount,
    rolesConfig: multiAgentPrefs.agents,
    criticRubricWeights: multiAgentPrefs.criticRubricWeights,
    criticThresholds: multiAgentPrefs.criticThresholds,
    maxRevisions: multiAgentPrefs.maxRevisions,
    profilesSnapshot: sanitizeProfiles,
    createdAt: Date.now(),
  };

  const run: GenerationRun = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    bookId,
    chapterId,
    status: 'pending',
    activity: {
      phase: 'preparing',
      currentRole: 'planner',
      startedAt: Date.now(),
      message: '載入章節、Wiki 與角色背景…',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshot,
  };

  await storage.generationRuns.add(run);
  return run;
}

export async function cancelGenerationRun(runId: string): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) return;
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    return;
  }
  await storage.generationRuns.update(runId, {
    status: 'cancelled',
    cancelledAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function isChapterLockedByRun(chapterId: string): Promise<boolean> {
  const run = await storage.generationRuns.getUnfinishedByChapter(chapterId);
  return Boolean(run);
}

export async function isLLMProfileReferencedByActiveRun(profileId: string): Promise<boolean> {
  const { activeProfileId } = useSettingsStore.getState();
  const allRuns = await storage.generationRuns.listAll();
  const activeRuns = allRuns.filter((r) => ['pending', 'running', 'awaiting_input'].includes(r.status));
  for (const run of activeRuns) {
    const rolesConfig = run.snapshot.rolesConfig;
    if (rolesConfig) {
      for (const roleKey of ['planner', 'writer', 'critic', 'editor'] as const) {
        const assignedId = rolesConfig[roleKey]?.profileId;
        const effectiveId = assignedId || activeProfileId;
        if (effectiveId === profileId) {
          return true;
        }
      }
    }
  }
  return false;
}
