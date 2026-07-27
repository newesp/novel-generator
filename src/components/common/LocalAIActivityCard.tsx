import type { LocalAIActivityState } from '../../hooks/useLocalAIActivity';
import { AIActivityCard } from './AIActivityCard';

interface LocalAIActivityCardProps {
  activity: LocalAIActivityState;
  title: string;
  message?: string;
  onCancel: () => void;
  onDismiss: () => void;
  compact?: boolean;
}

export function LocalAIActivityCard({
  activity,
  title,
  message,
  onCancel,
  onDismiss,
  compact = false,
}: LocalAIActivityCardProps) {
  if (activity.phase === 'idle') return null;
  const running = activity.phase === 'running';
  const failed = activity.phase === 'failed';
  const cancelled = activity.phase === 'cancelled';
  const succeeded = activity.phase === 'success';
  const displayTitle = failed
    ? `${title}：失敗`
    : cancelled
      ? `${title}：已停止`
      : succeeded
        ? `${title}：已完成`
        : title;

  return (
    <AIActivityCard
      role="assistant"
      title={displayTitle}
      message={activity.message ?? message}
      errorMessage={activity.errorMessage}
      startedAt={activity.startedAt}
      running={running}
      tone={failed ? 'danger' : cancelled ? 'muted' : succeeded ? 'success' : 'active'}
      compact={compact}
      secondaryAction={{
        label: running ? '停止' : '關閉',
        onClick: running ? onCancel : onDismiss,
        danger: running,
      }}
    />
  );
}
