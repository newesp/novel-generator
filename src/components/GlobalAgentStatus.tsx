import { AIActivityCard } from './common/AIActivityCard';
import { useGenerationRunStore } from '../stores/generationRunStore';
import { useUIStore } from '../stores/uiStore';
import {
  generationRunTitle,
  generationRunTone,
  isOpenGenerationRun,
  normalizedActivity,
} from '../lib/multi-agent/presentation';
import { useSettingsStore } from '../stores/settingsStore';
import { t } from '../lib/language-policy';

export function GlobalAgentStatus() {
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const runs = useGenerationRunStore((state) => state.runs);
  const openAgentRun = useUIStore((state) => state.openAgentRun);
  const openRuns = runs.filter(isOpenGenerationRun);
  const current = openRuns.find((run) => run.status === 'running')
    ?? openRuns
      .filter((run) => run.status === 'pending')
      .sort((a, b) => (a.activity?.queuePosition ?? 999) - (b.activity?.queuePosition ?? 999))[0]
    ?? openRuns.find((run) => run.status === 'awaiting_input');

  if (!current) return null;
  const activity = normalizedActivity(current, locale);
  const queuedCount = openRuns.filter((run) => run.id !== current.id && run.status === 'pending').length;
  const chapterTitle = current.snapshot.chapterTitle || t('agent.chapterFallbackTitle', {
    number: current.snapshot.chapterNumber ?? '?',
  }, locale);
  const message = current.status === 'awaiting_input'
    ? activity.message
    : `${chapterTitle}${queuedCount > 0 ? t('agent.additionalQueued', { count: queuedCount }, locale) : ''}`;

  return (
    <div
      className="global-agent-status"
      role="button"
      tabIndex={0}
      title={t('agent.openCurrentRun', undefined, locale)}
      onClick={() => openAgentRun(current.chapterId, current.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openAgentRun(current.chapterId, current.id);
        }
      }}
    >
      <AIActivityCard
        role={activity.currentRole}
        title={generationRunTitle(current, locale)}
        message={message}
        startedAt={activity.startedAt ?? current.createdAt}
        tone={generationRunTone(current)}
        running={current.status === 'running' || current.status === 'pending'}
        compact
      />
    </div>
  );
}
