import type {
  GenerationRun,
  GenerationRunActivity,
  GenerationRunPauseReason,
  GenerationStepRole,
} from '../../types';

export type ActivityTone = 'active' | 'warning' | 'danger' | 'muted' | 'success';

const ROLE_LABELS: Record<GenerationStepRole, string> = {
  planner: 'Planner',
  writer: 'Writer',
  critic: 'Critic',
  editor: 'Editor',
};

export function generationRoleLabel(role?: GenerationStepRole): string {
  return role ? ROLE_LABELS[role] : 'AI 助理';
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

export function generationRunTitle(run: GenerationRun): string {
  const activity = normalizedActivity(run);
  if (run.status === 'failed') return '高品質生成失敗';
  if (run.status === 'cancelled') return '高品質生成已取消';
  if (run.status === 'completed') return '高品質生成已完成';
  if (activity.phase === 'queued') {
    return activity.queuePosition && activity.queuePosition > 1
      ? `等待 AI 執行槽（排隊 #${activity.queuePosition}）`
      : '等待 AI 執行槽';
  }
  if (activity.pauseReason === 'planner_review') return 'Planner 已完成，等待你審核';
  if (activity.pauseReason === 'human_review') return '候選草稿需要你決定';
  if (activity.pauseReason === 'revision_limit') return '已達修訂上限，等待你審核';
  if (activity.pauseReason === 'interrupted') return '上次執行被中斷';
  if (activity.pauseReason === 'configuration_blocked') return 'LLM 設定需要修復';
  if (activity.pauseReason === 'format_repair_failed') return '回應格式需要手動重試';

  switch (activity.phase) {
    case 'preparing': return '正在準備生成資料';
    case 'planning': return 'Planner 正在規劃本章';
    case 'writing': return 'Writer 正在撰寫候選草稿';
    case 'criticizing': return 'Critic 正在評讀候選草稿';
    case 'editing': return 'Editor 正在修訂候選草稿';
    case 'saving': return '正在保存生成結果';
    default: return '高品質生成執行中';
  }
}

export function generationRunBadge(run: GenerationRun): string {
  const activity = normalizedActivity(run);
  if (run.status === 'failed') return '生成失敗';
  if (activity.pauseReason === 'planner_review' || activity.pauseReason === 'human_review' || activity.pauseReason === 'revision_limit') {
    return '等待審核';
  }
  if (activity.pauseReason === 'interrupted') return '執行中斷';
  if (activity.pauseReason === 'configuration_blocked') return '設定阻塞';
  if (activity.phase === 'queued') return activity.queuePosition ? `排隊 #${activity.queuePosition}` : '排隊中';
  return `${generationRoleLabel(activity.currentRole)} 執行中`;
}

export function normalizedActivity(run: GenerationRun): GenerationRunActivity {
  if (run.activity) return run.activity;
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
    message: run.status === 'awaiting_input' ? '此舊執行需要手動重試或取消' : undefined,
  };
}

export function isReviewPause(reason?: GenerationRunPauseReason): boolean {
  return reason === 'planner_review' || reason === 'human_review' || reason === 'revision_limit';
}
