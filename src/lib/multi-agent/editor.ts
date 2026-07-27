import { storage } from '../storage';
import { completeNormalized } from '../llm';
import { renderTemplate } from '../prompt-template';
import { DEFAULT_MULTI_AGENT_EDITOR_TEMPLATE } from '../prompt-defaults';
import type {
  GenerationStep,
  GenerationCheckpoint,
  LLMProfile,
} from '../../types';
import type { CriticFeedback } from './critic';
import { useSettingsStore } from '../../stores/settingsStore';
import { assertRunWritable, isCancellationError } from './resilience';

export interface EditorResult {
  revisedDraft: string;
  nextDraftVersion: number;
  checkpoint: GenerationCheckpoint;
}

export async function executeEditorStep(runId: string, signal?: AbortSignal): Promise<EditorResult> {
  const run = await storage.generationRuns.get(runId);
  if (!run) throw new Error(`找不到 Run: ${runId}`);

  const checkpoints = await storage.generationCheckpoints.listByRun(runId);
  const draftChk = checkpoints
    .filter((c) => c.stateName === 'writer_done' || c.stateName === 'editor_done')
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  const criticChk = checkpoints
    .filter((c) => c.stateName === 'critic_done')
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!draftChk || !criticChk) {
    throw new Error('缺少前置 Candidate Draft 或 Critic Checkpoint');
  }

  let candidateDraft = '';
  let draftVersion = 1;
  try {
    const data = JSON.parse(draftChk.data);
    candidateDraft = data.candidateDraft || '';
    draftVersion = Number(data.draftVersion || 1);
  } catch {
    throw new Error('解析 Candidate Draft Checkpoint 失敗');
  }

  let feedback: CriticFeedback;
  try {
    feedback = JSON.parse(criticChk.data);
  } catch {
    throw new Error('解析 Critic Checkpoint 失敗');
  }

  // Strict version matching invariant!
  if (feedback.draftVersion !== draftVersion) {
    throw new Error(
      `Critic feedback 版本 (v${feedback.draftVersion}) 與當前草稿版本 (v${draftVersion}) 不符`,
    );
  }

  // Check maxRevisions limit
  const steps = await storage.generationSteps.listByRun(runId);
  const completedEditorSteps = steps.filter(
    (s) => s.role === 'editor' && s.status === 'completed',
  ).length;

  const maxRevisions = run.snapshot.maxRevisions || 3;
  if (completedEditorSteps >= maxRevisions) {
    await storage.generationRuns.update(runId, {
      status: 'awaiting_input',
      updatedAt: Date.now(),
    });
    throw new Error(
      `已達到最高 Editor 修訂上限 (${maxRevisions} 次)，停止自動修訂並轉入人工審核。`,
    );
  }

  const { llmProfiles, activeProfileId } = useSettingsStore.getState();
  const editorConfig = run.snapshot.rolesConfig.editor;
  const profileId = editorConfig.profileId || activeProfileId;
  const profileSnapshot = run.snapshot.profilesSnapshot[profileId];

  const liveProfile = llmProfiles.find((p) => p.id === profileId) || llmProfiles[0];
  if (!liveProfile || !liveProfile.apiKey) {
    await storage.generationRuns.update(runId, { status: 'failed', updatedAt: Date.now() });
    throw new Error(`Editor 使用的 Profile「${profileSnapshot?.name || profileId}」未設定 API Key`);
  }

  const targetProfile: LLMProfile = {
    ...liveProfile,
    model: editorConfig.modelOverride || profileSnapshot?.model || liveProfile.model,
    temperature: editorConfig.temperatureOverride ?? profileSnapshot?.temperature ?? liveProfile.temperature,
    maxTokens: editorConfig.maxTokensOverride ?? profileSnapshot?.maxTokens ?? liveProfile.maxTokens,
  };

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

  const nextDraftVersion = draftVersion + 1;
  const majorFlawSection = feedback.hasMajorFlaw
    ? `⚠️ **重大缺陷問題**：${feedback.majorFlawReason}`
    : '';

  const requiredChangesList = feedback.requiredChanges.length > 0
    ? feedback.requiredChanges.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '無額外指定，請綜合提升正文品質。';

  const promptVars = {
    chapterTitle: run.snapshot.chapterTitle || chapter?.title || '未命名章節',
    beat,
    points,
    candidateDraft,
    draftVersion: String(draftVersion),
    nextDraftVersion: String(nextDraftVersion),
    majorFlawSection,
    requiredChangesList,
    roleGuidance: editorConfig.roleGuidance || '依目前候選草稿與同版本 Critic feedback 進行針對性修訂。',
  };

  const prompt = renderTemplate(DEFAULT_MULTI_AGENT_EDITOR_TEMPLATE, promptVars);

  await storage.generationRuns.update(runId, { status: 'running', updatedAt: Date.now() });

  const stepId = `step_${Date.now()}_editor_${completedEditorSteps + 1}`;
  const step: GenerationStep = {
    id: stepId,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    role: 'editor',
    status: 'running',
    attempt: 1,
    prompt,
    createdAt: Date.now(),
  };
  await storage.generationSteps.add(step);

  let response: Awaited<ReturnType<typeof completeNormalized>>;
  try {
    response = await completeNormalized(
      prompt,
      {
        systemPrompt: '你是專業小說責任編輯，請直接輸出修訂後的小說正文。',
        maxTokens: targetProfile.maxTokens,
        temperature: targetProfile.temperature,
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
    throw new Error(`Editor 呼叫 LLM 失敗：${errorText}`);
  }

  await assertRunWritable(runId);
  const revisedDraft = response.text.trim();
  const checkpoint: GenerationCheckpoint = {
    id: `chk_${Date.now()}_editor_${nextDraftVersion}`,
    runId: run.id,
    bookId: run.bookId,
    chapterId: run.chapterId,
    stepId,
    stateName: 'editor_done',
    data: JSON.stringify({ candidateDraft: revisedDraft, draftVersion: nextDraftVersion }),
    createdAt: Date.now(),
  };
  await storage.generationCheckpoints.add(checkpoint);

  return { revisedDraft, nextDraftVersion, checkpoint };
}
