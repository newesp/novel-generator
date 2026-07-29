import { storage } from '../storage';
import { completeNormalized } from '../llm';
import { renderTemplate } from '../prompt-template';
import { DEFAULT_MULTI_AGENT_WRITER_TEMPLATE } from '../prompt-defaults';
import type {
  GenerationStep,
  GenerationCheckpoint,
  LLMProfile,
} from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { assertRunWritable, isCancellationError } from './resilience';
import { resolveBeatLabel } from '../language-policy';

export interface WriterResult {
  candidateDraft: string;
  draftVersion: number;
  checkpoint: GenerationCheckpoint;
}

export async function executeWriterStep(runId: string, signal?: AbortSignal): Promise<WriterResult> {
  const run = await storage.generationRuns.get(runId);
  if (!run) {
    throw new Error(`找不到 Run: ${runId}`);
  }

  // Load checkpoints to find approved planner output
  const checkpoints = await storage.generationCheckpoints.listByRun(runId);
  const reviewChk = checkpoints.find((c) => c.stateName === 'planner_reviewed');
  const plannerDoneChk = checkpoints.find((c) => c.stateName === 'planner_done');

  let approvedBeat = '引入 (Inciting Incident)';
  let approvedPoints = '無要點';

  if (reviewChk) {
    try {
      const data = JSON.parse(reviewChk.data);
      approvedBeat = data.beat || approvedBeat;
      approvedPoints = data.points || approvedPoints;
    } catch {
      // fallback
    }
  } else if (plannerDoneChk) {
    try {
      const data = JSON.parse(plannerDoneChk.data);
      approvedBeat = data.beat || approvedBeat;
      approvedPoints = data.points || approvedPoints;
    } catch {
      // fallback
    }
  }

  const { llmProfiles, activeProfileId } = useSettingsStore.getState();
  const writerConfig = run.snapshot.rolesConfig.writer;
  const profileId = writerConfig.profileId || activeProfileId;
  const profileSnapshot = run.snapshot.profilesSnapshot[profileId];

  const liveProfile = llmProfiles.find((p) => p.id === profileId) || llmProfiles[0];
  if (!liveProfile || !liveProfile.apiKey) {
    await storage.generationRuns.update(runId, { status: 'failed', updatedAt: Date.now() });
    throw new Error(`Writer 使用的 Profile「${profileSnapshot?.name || profileId}」未設定 API Key`);
  }

  const targetProfile: LLMProfile = {
    ...liveProfile,
    model: writerConfig.modelOverride || profileSnapshot?.model || liveProfile.model,
    temperature: writerConfig.temperatureOverride ?? profileSnapshot?.temperature ?? liveProfile.temperature,
    maxTokens: writerConfig.maxTokensOverride ?? profileSnapshot?.maxTokens ?? liveProfile.maxTokens,
  };

  const project = await storage.projects.get(run.bookId);
  const chapter = await storage.chapters.get(run.chapterId);
  const writingLanguage = run.snapshot.writingLanguage || project?.writingLanguage || 'zh-Hant';
  const isEn = writingLanguage === 'en';

  const promptVars = {
    storyTitle: run.snapshot.storyTitle || project?.title || (isEn ? 'Untitled Novel' : '未命名小說'),
    worldSetting: project?.worldSetting || (isEn ? 'None' : '無'),
    mainPlotSection: project?.mainPlot ? `\n## ${isEn ? 'Main Plot' : '主線劇情'}\n${project.mainPlot}` : '',
    charactersSection: '',
    wikiSection: '',
    olderSummarySection: '',
    chapterTitle: run.snapshot.chapterTitle || chapter?.title || (isEn ? 'Untitled Chapter' : '未命名章節'),
    beat: resolveBeatLabel(approvedBeat, isEn ? 'en' : 'zh-TW'),
    points: approvedPoints,
    targetWords: String(run.snapshot.targetWordCount || chapter?.targetWords || 2000),
    roleGuidance: writerConfig.roleGuidance || (isEn ? 'Write the chapter prose in English based on the approved outline and context.' : '依核准的生成細綱與上下文寫作繁體中文章節正文。'),
  };

  const prompt = renderTemplate(DEFAULT_MULTI_AGENT_WRITER_TEMPLATE, promptVars);

  await storage.generationRuns.update(runId, { status: 'running', updatedAt: Date.now() });

  const stepId = `step_${Date.now()}_writer_1`;
  const step: GenerationStep = {
    id: stepId,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    role: 'writer',
    status: 'running',
    attempt: 1,
    prompt,
    createdAt: Date.now(),
  };
  await storage.generationSteps.add(step);

  let response: Awaited<ReturnType<typeof completeNormalized>>;
  try {
    const systemPrompt = isEn
      ? 'You are a professional fiction writer. Write the chapter prose fluently and exclusively in English.'
      : '你是專業小說作家，請直接輸出繁體中文小說正文，嚴禁使用簡體中文或非中文詞彙。';

    response = await completeNormalized(
      prompt,
      {
        systemPrompt,
        maxTokens: targetProfile.maxTokens,
        temperature: targetProfile.temperature,
        writingLanguage: run.snapshot.writingLanguage ?? 'zh-Hant',
      },
      signal,
      targetProfile,
    );

    await assertRunWritable(runId);
    await storage.generationSteps.update(stepId, {
      status: 'completed',
      response: response.text,
      usage: response.usage,
      requestId: response.requestId,
      finishReason: response.finishReason,
      completedAt: Date.now(),
    });
  } catch (err) {
    const errorText = (err as Error).message;
    const cancelled = isCancellationError(err, signal);
    await storage.generationSteps.update(stepId, {
      status: cancelled ? 'cancelled' : 'failed',
      errorText,
      completedAt: Date.now(),
    });
    if (!cancelled) {
      await storage.generationRuns.update(runId, { status: 'failed', updatedAt: Date.now() });
    }
    throw new Error(`Writer 呼叫 LLM 失敗：${errorText}`);
  }

  await assertRunWritable(runId);
  const draftVersion = 1;
  const candidateDraft = response.text.trim();

  const checkpoint: GenerationCheckpoint = {
    id: `chk_${Date.now()}_writer`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stepId,
    stateName: 'writer_done',
    data: JSON.stringify({ candidateDraft, draftVersion }),
    createdAt: Date.now(),
  };
  await storage.generationCheckpoints.add(checkpoint);

  await storage.generationRuns.update(runId, {
    status: 'running',
    updatedAt: Date.now(),
  });

  return { candidateDraft, draftVersion, checkpoint };
}
