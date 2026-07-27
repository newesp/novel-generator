import { storage } from '../storage';
import { completeNormalized } from '../llm';
import { renderTemplate } from '../prompt-template';
import {
  DEFAULT_MULTI_AGENT_PLANNER_TEMPLATE,
  DEFAULT_MULTI_AGENT_REPAIR_TEMPLATE,
} from '../prompt-defaults';
import type {
  GenerationStep,
  GenerationCheckpoint,
  LLMProfile,
} from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { assertRunWritable, isCancellationError } from './resilience';

export interface PlannedOutline {
  beat: string;
  points: string;
  explanation: string;
}

export function parsePlannerResponse(rawText: string): PlannedOutline {
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
    throw new Error(`無法解析 Planner 模型 JSON 回應：${(err as Error).message}`);
  }

  if (!obj || typeof obj !== 'object') {
    throw new Error('Planner 回應非有效 JSON 物件');
  }

  const beat = typeof obj.beat === 'string' ? obj.beat.trim() : '';
  let points = '';
  if (Array.isArray(obj.points)) {
    points = obj.points.filter((p: unknown) => typeof p === 'string').join('\n');
  } else if (typeof obj.points === 'string') {
    points = obj.points.trim();
  }

  if (!beat) {
    throw new Error('Planner 回應缺少「beat」(節拍/語氣) 欄位');
  }
  if (!points) {
    throw new Error('Planner 回應缺少「points」(章節要點) 欄位');
  }

  const explanation = typeof obj.explanation === 'string' ? obj.explanation.trim() : '';

  return { beat, points, explanation };
}

export async function executePlannerStep(runId: string, signal?: AbortSignal): Promise<{
  plan: PlannedOutline;
  checkpoint: GenerationCheckpoint;
}> {
  const run = await storage.generationRuns.get(runId);
  if (!run) {
    throw new Error(`找不到 Run: ${runId}`);
  }

  const { llmProfiles, activeProfileId } = useSettingsStore.getState();
  const plannerConfig = run.snapshot.rolesConfig.planner;
  const profileId = plannerConfig.profileId || activeProfileId;
  const profileSnapshot = run.snapshot.profilesSnapshot[profileId];

  // Resolve LLMProfile with API Key from live settings store
  const liveProfile = llmProfiles.find((p) => p.id === profileId) || llmProfiles[0];
  if (!liveProfile || !liveProfile.apiKey) {
    await storage.generationRuns.update(runId, { status: 'failed', updatedAt: Date.now() });
    throw new Error(`Planner 使用的 Profile「${profileSnapshot?.name || profileId}」未設定 API Key`);
  }

  const targetProfile: LLMProfile = {
    ...liveProfile,
    model: plannerConfig.modelOverride || profileSnapshot?.model || liveProfile.model,
    temperature: plannerConfig.temperatureOverride ?? profileSnapshot?.temperature ?? liveProfile.temperature,
    maxTokens: plannerConfig.maxTokensOverride ?? profileSnapshot?.maxTokens ?? liveProfile.maxTokens,
  };

  const project = await storage.projects.get(run.bookId);
  const chapter = await storage.chapters.get(run.chapterId);

  const promptVars = {
    storyTitle: run.snapshot.storyTitle || project?.title || '未命名小說',
    worldSetting: project?.worldSetting || '無',
    mainPlotSection: project?.mainPlot ? `\n## 主線劇情\n${project.mainPlot}` : '',
    charactersSection: '',
    wikiSection: '',
    olderSummarySection: '',
    chapterNumber: String(run.snapshot.chapterNumber ?? ((chapter?.order ?? 0) + 1)),
    chapterTitle: run.snapshot.chapterTitle || chapter?.title || '未命名章節',
    beat: chapter?.beat || '引入 (Inciting Incident)',
    points: chapter?.points || '無要點',
    targetWords: String(run.snapshot.targetWordCount || chapter?.targetWords || 2000),
    roleGuidance: plannerConfig.roleGuidance || '根據章節節拍、要點、上下文與知識資料產生章節細綱。',
  };

  const prompt = renderTemplate(DEFAULT_MULTI_AGENT_PLANNER_TEMPLATE, promptVars);

  await storage.generationRuns.update(runId, { status: 'running', updatedAt: Date.now() });

  // Attempt 1
  const stepId1 = `step_${Date.now()}_planner_1`;
  const step1: GenerationStep = {
    id: stepId1,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    role: 'planner',
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
        systemPrompt: '你是專業小說大綱與章節細綱規劃專家，請嚴格輸出符合 JSON 規範的回應。',
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
    throw new Error(`Planner 呼叫 LLM 失敗：${errorText}`);
  }

  let plan: PlannedOutline;
  try {
    plan = parsePlannerResponse(response1.text);
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
    await storage.generationSteps.update(stepId1, {
      status: 'failed',
      response: response1.text,
      usage: response1.usage,
      errorText: errorText1,
      completedAt: Date.now(),
    });

    // Format Repair Attempt 2
    const repairPrompt = renderTemplate(DEFAULT_MULTI_AGENT_REPAIR_TEMPLATE, {
      errorText: errorText1,
    });
    const stepId2 = `step_${Date.now()}_planner_2`;
    const step2: GenerationStep = {
      id: stepId2,
      runId: run.id,
      bookId: run.bookId,
      chapterId: run.chapterId,
      role: 'planner',
      status: 'running',
      attempt: 2,
      prompt: repairPrompt,
      createdAt: Date.now(),
    };
    await storage.generationSteps.add(step2);

    try {
      const response2 = await completeNormalized(
        repairPrompt,
        {
          systemPrompt: '請修正並嚴格輸出符合 JSON Schema 的物件。',
          maxTokens: targetProfile.maxTokens,
          temperature: targetProfile.temperature,
        },
        signal,
        targetProfile,
      );
      await assertRunWritable(runId);
      plan = parsePlannerResponse(response2.text);
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
      throw new Error(`Planner 格式自動修復失敗：${errorText2}。流程已暫停，可手動重試。`);
    }
  }

  await assertRunWritable(runId);
  // Save planner_done checkpoint & pause for user review
  const checkpoint: GenerationCheckpoint = {
    id: `chk_${Date.now()}_planner`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stepId: stepId1,
    stateName: 'planner_done',
    data: JSON.stringify(plan),
    createdAt: Date.now(),
  };
  await storage.generationCheckpoints.add(checkpoint);

  await storage.generationRuns.update(runId, {
    status: 'awaiting_input',
    updatedAt: Date.now(),
  });

  return { plan, checkpoint };
}

export async function applyPlannerReviewChoice(
  runId: string,
  choice: 'apply_to_chapter' | 'use_for_run_only',
  finalBeat: string,
  finalPoints: string,
): Promise<void> {
  const run = await storage.generationRuns.get(runId);
  if (!run) {
    throw new Error(`找不到 Run: ${runId}`);
  }

  if (choice === 'apply_to_chapter') {
    await storage.chapters.update(run.chapterId, {
      beat: finalBeat,
      points: finalPoints,
      updatedAt: Date.now(),
    });
  }

  const reviewCheckpoint: GenerationCheckpoint = {
    id: `chk_${Date.now()}_planner_review`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stateName: 'planner_reviewed',
    data: JSON.stringify({
      choice,
      beat: finalBeat,
      points: finalPoints,
      reviewedAt: Date.now(),
    }),
    createdAt: Date.now(),
  };

  await storage.generationCheckpoints.add(reviewCheckpoint);

  await storage.generationRuns.update(runId, {
    status: 'pending',
    updatedAt: Date.now(),
  });
}
