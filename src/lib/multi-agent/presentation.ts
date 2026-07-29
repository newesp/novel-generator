import type {
  GenerationRun,
  GenerationRunActivity,
  GenerationRunPauseReason,
  GenerationStepRole,
} from '../../types';
import type { InterfaceLocale } from '../language-policy';

export type ActivityTone = 'active' | 'warning' | 'danger' | 'muted' | 'success';

const ROLE_LABELS: Record<GenerationStepRole, string> = {
  planner: 'Planner',
  writer: 'Writer',
  critic: 'Critic',
  editor: 'Editor',
};

export function generationRoleLabel(role?: GenerationStepRole, locale: InterfaceLocale | string = 'zh-TW'): string {
  return role ? ROLE_LABELS[role] : locale === 'en' ? 'AI Assistant' : 'AI 助理';
}

export function isOpenGenerationRun(run: GenerationRun): boolean {
  return run.status === 'pending' || run.status === 'running' || run.status === 'awaiting_input';
}

export function generationRunTone(run: GenerationRun): ActivityTone {
  if (run.status === 'failed') return 'danger';
  if (run.status === 'cancelled') return 'muted';
  if (run.status === 'completed') return 'success';
  if (run.status === 'awaiting_input') return 'warning';
  return 'active';
}

export function generationRunTitle(run: GenerationRun, locale: InterfaceLocale | string = 'zh-TW'): string {
  const activity = normalizedActivity(run, locale);
  const isEn = locale === 'en';
  if (run.status === 'failed') return isEn ? 'High-quality generation failed' : '高品質生成失敗';
  if (run.status === 'cancelled') return isEn ? 'High-quality generation cancelled' : '高品質生成已取消';
  if (run.status === 'completed') return isEn ? 'High-quality generation completed' : '高品質生成已完成';
  if (activity.phase === 'queued') {
    return activity.queuePosition && activity.queuePosition > 1
      ? (isEn ? `Waiting for an AI slot (queue #${activity.queuePosition})` : `等待 AI 執行槽（排隊 #${activity.queuePosition}）`)
      : (isEn ? 'Waiting for an AI slot' : '等待 AI 執行槽');
  }
  if (activity.pauseReason === 'planner_review') return isEn ? 'Planner finished; awaiting your review' : 'Planner 已完成，等待你審核';
  if (activity.pauseReason === 'human_review') return isEn ? 'Candidate draft needs your decision' : '候選草稿需要你決定';
  if (activity.pauseReason === 'revision_limit') return isEn ? 'Revision limit reached; awaiting your review' : '已達修訂上限，等待你審核';
  if (activity.pauseReason === 'interrupted') return isEn ? 'Previous run was interrupted' : '上次執行被中斷';
  if (activity.pauseReason === 'configuration_blocked') return isEn ? 'LLM settings need attention' : 'LLM 設定需要修復';
  if (activity.pauseReason === 'format_repair_failed') return isEn ? 'Response format requires a manual retry' : '回應格式需要手動重試';

  switch (activity.phase) {
    case 'preparing': return isEn ? 'Preparing generation context' : '正在準備生成資料';
    case 'planning': return isEn ? 'Planner is outlining this chapter' : 'Planner 正在規劃本章';
    case 'writing': return isEn ? 'Writer is drafting a candidate' : 'Writer 正在撰寫候選草稿';
    case 'criticizing': return isEn ? 'Critic is reviewing the candidate' : 'Critic 正在評讀候選草稿';
    case 'editing': return isEn ? 'Editor is revising the candidate' : 'Editor 正在修訂候選草稿';
    case 'saving': return isEn ? 'Saving generation results' : '正在保存生成結果';
    default: return isEn ? 'High-quality generation in progress' : '高品質生成執行中';
  }
}

export function generationRunBadge(run: GenerationRun, locale: InterfaceLocale | string = 'zh-TW'): string {
  const activity = normalizedActivity(run, locale);
  const isEn = locale === 'en';
  if (run.status === 'failed') return isEn ? 'Generation failed' : '生成失敗';
  if (activity.pauseReason === 'planner_review' || activity.pauseReason === 'human_review' || activity.pauseReason === 'revision_limit') {
    return isEn ? 'Awaiting review' : '等待審核';
  }
  if (activity.pauseReason === 'interrupted') return isEn ? 'Interrupted' : '執行中斷';
  if (activity.pauseReason === 'configuration_blocked') return isEn ? 'Setup blocked' : '設定阻塞';
  if (activity.phase === 'queued') return activity.queuePosition
    ? (isEn ? `Queue #${activity.queuePosition}` : `排隊 #${activity.queuePosition}`)
    : (isEn ? 'Queued' : '排隊中');
  return `${generationRoleLabel(activity.currentRole, locale)} ${isEn ? 'running' : '執行中'}`;
}

export function normalizedActivity(run: GenerationRun, locale: InterfaceLocale | string = 'zh-TW'): GenerationRunActivity {
  if (run.activity) {
    if (locale !== 'en') return run.activity;
    return {
      ...run.activity,
      message: generationRunTitleFromActivity(run.activity),
    };
  }
  const fallbackPhase =
    run.status === 'completed' ? 'completed'
      : run.status === 'failed' ? 'failed'
        : run.status === 'cancelled' ? 'cancelled'
          : run.status === 'awaiting_input' ? 'awaiting_input'
            : run.status === 'running' ? 'planning'
              : 'queued';
  return {
    phase: fallbackPhase,
    currentRole: 'planner',
    pauseReason: run.status === 'awaiting_input' ? 'interrupted' : undefined,
    startedAt: run.createdAt,
    message: run.status === 'awaiting_input'
      ? (locale === 'en' ? 'This older run must be retried or cancelled manually' : '此舊執行需要手動重試或取消')
      : undefined,
  };
}

function generationRunTitleFromActivity(activity: GenerationRunActivity): string {
  if (activity.pauseReason === 'planner_review') return 'Review the Planner proposal to continue.';
  if (activity.pauseReason === 'human_review') return 'Review the candidate draft to continue.';
  if (activity.pauseReason === 'revision_limit') return 'The revision limit was reached; your review is required.';
  if (activity.pauseReason === 'interrupted') return 'The previous operation was interrupted.';
  if (activity.pauseReason === 'configuration_blocked') return 'Update the LLM settings to continue.';
  if (activity.pauseReason === 'format_repair_failed') return 'The response format could not be repaired automatically.';
  switch (activity.phase) {
    case 'queued': return activity.queuePosition ? `Queued at position #${activity.queuePosition}.` : 'Queued for execution.';
    case 'preparing': return 'Preparing chapter context and generation settings.';
    case 'planning': return 'Planner is preparing the chapter outline.';
    case 'writing': return 'Writer is drafting the chapter.';
    case 'criticizing': return 'Critic is reviewing and scoring the draft.';
    case 'editing': return 'Editor is revising the draft.';
    case 'saving': return 'Saving the adopted draft.';
    case 'completed': return 'High-quality generation completed.';
    case 'failed': return 'High-quality generation failed.';
    case 'cancelled': return 'High-quality generation was cancelled.';
    default: return 'Waiting for your input.';
  }
}

export function isReviewPause(reason?: GenerationRunPauseReason): boolean {
  return reason === 'planner_review' || reason === 'human_review' || reason === 'revision_limit';
}

export function generationErrorText(
  message: string,
  locale: InterfaceLocale | string = 'zh-TW',
): string {
  if (locale !== 'en' || !/\p{Script=Han}/u.test(message)) return message;
  if (/API Key|API|連線設定/.test(message)) {
    return 'The LLM connection is not configured correctly. Review the active profile and API key.';
  }
  if (/JSON|格式|解析/.test(message)) {
    return 'The model response format could not be parsed or repaired. Retry this step.';
  }
  if (/找不到/.test(message)) {
    return 'The requested generation run or draft could not be found. Refresh the run history and try again.';
  }
  if (/已結束|未結束|不能繼續|不可/.test(message)) {
    return 'This action is not available in the generation run’s current state.';
  }
  return 'The generation operation failed. Review the run details and retry.';
}
