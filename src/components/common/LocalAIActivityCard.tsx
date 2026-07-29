import type { LocalAIActivityState } from '../../hooks/useLocalAIActivity';
import { AIActivityCard } from './AIActivityCard';
import { t } from '../../lib/language-policy';
import { useSettingsStore } from '../../stores/settingsStore';

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
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  if (activity.phase === 'idle') return null;
  const running = activity.phase === 'running';
  const failed = activity.phase === 'failed';
  const cancelled = activity.phase === 'cancelled';
  const succeeded = activity.phase === 'success';
  const displayTitle = failed
    ? t('activity.failedSuffix', { title }, locale)
    : cancelled
      ? t('activity.stoppedSuffix', { title }, locale)
      : succeeded
        ? t('activity.completedSuffix', { title }, locale)
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
        label: running ? t('activity.stop', undefined, locale) : t('common.close', undefined, locale),
        onClick: running ? onCancel : onDismiss,
        danger: running,
      }}
    />
  );
}
