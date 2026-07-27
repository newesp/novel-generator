import { storage } from '../storage';
import { completeNormalized } from '../llm';
import { renderTemplate } from '../prompt-template';
import {
  DEFAULT_MULTI_AGENT_CRITIC_TEMPLATE,
  DEFAULT_MULTI_AGENT_CRITIC_REPAIR_TEMPLATE,
} from '../prompt-defaults';
import type {
  GenerationStep,
  GenerationCheckpoint,
  LLMProfile,
  CriticRubricWeights,
  ChapterVersion,
} from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { assertRunWritable, isCancellationError } from './resilience';

export interface CriticScores {
  instructionAndBeat: number;
  plotLogic: number;
  characterConsistency: number;
  contextAndWorld: number;
  styleAndQuality: number;
  pacingAndStructure: number;
}

export interface CriticFeedback {
  draftVersion: number;
  scores: CriticScores;
  totalScore: number;
  hasMajorFlaw: boolean;
  majorFlawReason: string;
  draftEvidence: string;
  requiredChanges: string[];
}

export function recalculateTotalScore(
  scores: CriticScores,
  weights: CriticRubricWeights,
): number {
  const clamp = (val: unknown) => Math.max(0, Math.min(100, typeof val === 'number' && !Number.isNaN(val) ? val : 0));
  const sInstruction = clamp(scores.instructionAndBeat);
  const sPlot = clamp(scores.plotLogic);
  const sChar = clamp(scores.characterConsistency);
  const sWorld = clamp(scores.contextAndWorld);
  const sStyle = clamp(scores.styleAndQuality);
  const sPacing = clamp(scores.pacingAndStructure);

  const weighted =
    sInstruction * (weights.instructionAndBeat / 100) +
    sPlot * (weights.plotLogic / 100) +
    sChar * (weights.characterConsistency / 100) +
    sWorld * (weights.contextAndWorld / 100) +
    sStyle * (weights.styleAndQuality / 100) +
    sPacing * (weights.pacingAndStructure / 100);

  return Number(weighted.toFixed(2));
}

export function parseCriticResponse(
  rawText: string,
  expectedDraftVersion: number,
  weights: CriticRubricWeights,
): CriticFeedback {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  let obj: any;
  try {
    obj = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`無法解析 Critic 回應 JSON：${(err as Error).message}`);
  }

  if (!obj || typeof obj !== 'object') {
    throw new Error('Critic 回應非有效 JSON 物件');
  }

  const draftVersion = Number(obj.draftVersion);
  if (Number.isNaN(draftVersion) || draftVersion !== expectedDraftVersion) {
    throw new Error(
      `Critic 回應的草稿版本 (${obj.draftVersion}) 與期待評審的版本 (v${expectedDraftVersion}) 不符`,
    );
  }

  const rawScores = obj.scores || {};
  const scores: CriticScores = {
    instructionAndBeat: Number(rawScores.instructionAndBeat ?? rawScores.instructionGoal ?? 0),
    plotLogic: Number(rawScores.plotLogic ?? 0),
    characterConsistency: Number(rawScores.characterConsistency ?? 0),
    contextAndWorld: Number(rawScores.contextAndWorld ?? rawScores.worldContinuity ?? 0),
    styleAndQuality: Number(rawScores.styleAndQuality ?? rawScores.writingQuality ?? 0),
    pacingAndStructure: Number(rawScores.pacingAndStructure ?? rawScores.pacingStructure ?? 0),
  };

  const totalScore = recalculateTotalScore(scores, weights);
  const hasMajorFlaw = Boolean(obj.hasMajorFlaw);
  const majorFlawReason = typeof obj.majorFlawReason === 'string' ? obj.majorFlawReason.trim() : '';
  const draftEvidence = typeof obj.draftEvidence === 'string' ? obj.draftEvidence.trim() : '';

  let requiredChanges: string[] = [];
  if (Array.isArray(obj.requiredChanges)) {
    requiredChanges = obj.requiredChanges.filter((c: unknown) => typeof c === 'string' && c.trim().length > 0);
  } else if (typeof obj.requiredChanges === 'string' && obj.requiredChanges.trim()) {
    requiredChanges = [obj.requiredChanges.trim()];
  }

  return {
    draftVersion,
    scores,
    totalScore,
    hasMajorFlaw,
    majorFlawReason,
    draftEvidence,
    requiredChanges,
  };
}

export async function adoptCandidateDraft(
  runId: string,
  candidateDraft: string,
  draftVersion: number,
): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);
  await assertRunWritable(runId);

  const chapter = await storage.chapters.get(run.chapterId);
  if (!chapter) throw new Error(`找不到章節: ${run.chapterId}`);

  // Save previous Chapter.content into ChapterVersion if non-empty
  if (chapter.content && chapter.content.trim().length > 0) {
    const existingVersions = await storage.versions.listByChapterDesc(chapter.id);
    const nextVersionNumber = existingVersions.length + 1;
    const newVersion: ChapterVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      chapterId: chapter.id,
      content: chapter.content,
      prompt: '',
      isPinned: false,
      label: `Multi-Agent 高品質生成採用前備份 (v${nextVersionNumber})`,
      kind: 'full',
      createdAt: Date.now(),
    };
    await assertRunWritable(runId);
    await storage.versions.add(newVersion);
  }

  // Update Chapter.content with adopted candidate draft
  await assertRunWritable(runId);
  await storage.chapters.update(chapter.id, {
    content: candidateDraft,
    updatedAt: Date.now(),
  });

  // End generation run (releases chapter lock!)
  await assertRunWritable(runId);
  await storage.generationRuns.update(runId, {
    status: 'completed',
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });

  const adoptChk: GenerationCheckpoint = {
    id: `chk_${Date.now()}_adopted`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stateName: 'draft_adopted',
    data: JSON.stringify({ draftVersion, candidateDraft, adoptedAt: Date.now() }),
    createdAt: Date.now(),
  };
  await assertRunWritable(runId);
  await storage.generationCheckpoints.add(adoptChk);
}

export async function executeCriticStep(runId: string, signal?: AbortSignal): Promise<{
  feedback: CriticFeedback;
  checkpoint: GenerationCheckpoint;
  adopted: boolean;
}> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);

  const checkpoints = await storage.generationCheckpoints.listByRun(runId);
  const draftChk = checkpoints
    .filter((c) => c.stateName === 'writer_done' || c.stateName === 'editor_done')
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!draftChk) {
    throw new Error('找不到可供 Critic 評審的候選草稿 Checkpoint');
  }

  let candidateDraft = '';
  let draftVersion = 1;
  try {
    const data = JSON.parse(draftChk.data);
    candidateDraft = data.candidateDraft || '';
    draftVersion = Number(data.draftVersion || 1);
  } catch {
    throw new Error('解析候選草稿 Checkpoint 資料失敗');
  }

  const { llmProfiles, activeProfileId } = useSettingsStore.getState();
  const criticConfig = run.snapshot.rolesConfig.critic;
  const profileId = criticConfig.profileId || activeProfileId;
  const profileSnapshot = run.snapshot.profilesSnapshot[profileId];

  const liveProfile = llmProfiles.find((p) => p.id === profileId) || llmProfiles[0];
  if (!liveProfile || !liveProfile.apiKey) {
    await storage.generationRuns.update(runId, { status: 'failed', updatedAt: Date.now() });
    throw new Error(`Critic 使用的 Profile「${profileSnapshot?.name || profileId}」未設定 API Key`);
  }

  const targetProfile: LLMProfile = {
    ...liveProfile,
    model: criticConfig.modelOverride || profileSnapshot?.model || liveProfile.model,
    temperature: criticConfig.temperatureOverride ?? profileSnapshot?.temperature ?? liveProfile.temperature,
    maxTokens: criticConfig.maxTokensOverride ?? profileSnapshot?.maxTokens ?? liveProfile.maxTokens,
  };

  const project = await storage.projects.get(run.bookId);
  const chapter = await storage.chapters.get(run.chapterId);

  const plannerChk = checkpoints.find((c) => c.stateName === 'planner_reviewed' || c.stateName === 'planner_done');
  let beat = chapter?.beat || '鋪墊';
  let points = chapter?.points || '無要點';
  if (plannerChk) {
    try {
      const data = JSON.parse(plannerChk.data);
      beat = data.beat || beat;
      points = data.points || points;
    } catch {}
  }

  const weights = run.snapshot.criticRubricWeights;
  const promptVars = {
    chapterTitle: run.snapshot.chapterTitle || chapter?.title || '未命名章節',
    beat,
    points,
    worldSetting: project?.worldSetting || '無',
    charactersSection: '',
    wikiSection: '',
    olderSummarySection: '',
    candidateDraft,
    draftVersion: String(draftVersion),
    roleGuidance: criticConfig.roleGuidance || '依固定 rubric 評分、判定重大缺陷並產生修訂要求。',
    weightInstructionGoal: String(weights.instructionAndBeat),
    weightPlotLogic: String(weights.plotLogic),
    weightCharacterConsistency: String(weights.characterConsistency),
    weightWorldContinuity: String(weights.contextAndWorld),
    weightWritingQuality: String(weights.styleAndQuality),
    weightPacingStructure: String(weights.pacingAndStructure),
  };

  const prompt = renderTemplate(DEFAULT_MULTI_AGENT_CRITIC_TEMPLATE, promptVars);

  await storage.generationRuns.update(runId, { status: 'running', updatedAt: Date.now() });

  const stepId1 = `step_${Date.now()}_critic_1`;
  const step1: GenerationStep = {
    id: stepId1,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    role: 'critic',
    status: 'running',
    attempt: 1,
    prompt,
    createdAt: Date.now(),
  };
  await storage.generationSteps.add(step1);

  let response1: Awaited<ReturnType<typeof completeNormalized>>;
  try {
    response1 = await completeNormalized(
      prompt,
      {
        systemPrompt: '你是嚴謹的小說總編輯與文學評論家，請嚴格輸出符合 JSON 規範的回審結果。',
        maxTokens: targetProfile.maxTokens,
        temperature: targetProfile.temperature,
      },
      signal,
      targetProfile,
    );
    await assertRunWritable(runId);
  } catch (err) {
    const errorText = (err as Error).message;
    const cancelled = isCancellationError(err, signal);
    await storage.generationSteps.update(stepId1, {
      status: cancelled ? 'cancelled' : 'failed',
      errorText,
      completedAt: Date.now(),
    });
    if (!cancelled) {
      await storage.generationRuns.update(runId, { status: 'failed', updatedAt: Date.now() });
    }
    throw new Error(`Critic 呼叫 LLM 失敗：${errorText}`);
  }

  let feedback: CriticFeedback;
  try {
    feedback = parseCriticResponse(response1.text, draftVersion, weights);
    await storage.generationSteps.update(stepId1, {
      status: 'completed',
      response: response1.text,
      usage: response1.usage,
      requestId: response1.requestId,
      finishReason: response1.finishReason,
      completedAt: Date.now(),
    });
  } catch (parseErr) {
    const errorText1 = (parseErr as Error).message;
    await storage.generationSteps.update(stepId1, { status: 'failed', response: response1.text, errorText: errorText1, completedAt: Date.now() });

    // Format Repair Attempt 2
    const repairPrompt = renderTemplate(DEFAULT_MULTI_AGENT_CRITIC_REPAIR_TEMPLATE, { errorText: errorText1, draftVersion: String(draftVersion) });
    const stepId2 = `step_${Date.now()}_critic_2`;
    const step2: GenerationStep = {
      id: stepId2,
      runId: run.id,
      bookId: run.bookId,
      chapterId: run.chapterId,
      role: 'critic',
      status: 'running',
      attempt: 2,
      prompt: repairPrompt,
      createdAt: Date.now(),
    };
    await storage.generationSteps.add(step2);

    try {
      const response2 = await completeNormalized(
        repairPrompt,
        { systemPrompt: '請修正並嚴格輸出符合 JSON Schema 的評審結果。', maxTokens: targetProfile.maxTokens, temperature: targetProfile.temperature },
        signal,
        targetProfile,
      );
      await assertRunWritable(runId);
      feedback = parseCriticResponse(response2.text, draftVersion, weights);
      await storage.generationSteps.update(stepId2, {
        status: 'completed',
        response: response2.text,
        usage: response2.usage,
        requestId: response2.requestId,
        finishReason: response2.finishReason,
        completedAt: Date.now(),
      });
    } catch (repairErr) {
      const errorText2 = (repairErr as Error).message;
      const cancelled = isCancellationError(repairErr, signal);
      await storage.generationSteps.update(stepId2, {
        status: cancelled ? 'cancelled' : 'failed',
        errorText: errorText2,
        completedAt: Date.now(),
      });
      if (!cancelled) {
        await storage.generationRuns.update(runId, { status: 'awaiting_input', updatedAt: Date.now() });
      }
      throw new Error(`Critic 格式自動修復失敗：${errorText2}`);
    }
  }

  await assertRunWritable(runId);
  const checkpoint: GenerationCheckpoint = {
    id: `chk_${Date.now()}_critic`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stepId: stepId1,
    stateName: 'critic_done',
    data: JSON.stringify(feedback),
    createdAt: Date.now(),
  };
  await storage.generationCheckpoints.add(checkpoint);

  // Router evaluation
  const thresholds = run.snapshot.criticThresholds;
  const { passScore, humanReviewFloor } = thresholds;

  let adopted = false;

  if (!feedback.hasMajorFlaw && feedback.totalScore >= passScore) {
    // Automatic adoption! (HQ Happy Path)
    await assertRunWritable(runId);
    await adoptCandidateDraft(runId, candidateDraft, draftVersion);
    adopted = true;
  } else if (!feedback.hasMajorFlaw && feedback.totalScore >= humanReviewFloor) {
    // Pause for human review
    await storage.generationRuns.update(runId, { status: 'awaiting_input', updatedAt: Date.now() });
  } else {
    // Needs revision (handled by Issue #11 Editor step or Issue #12 Human Review)
    await storage.generationRuns.update(runId, { status: 'pending', updatedAt: Date.now() });
  }

  return { feedback, checkpoint, adopted };
}
