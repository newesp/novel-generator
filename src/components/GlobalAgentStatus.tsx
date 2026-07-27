import { AIActivityCard } from './common/AIActivityCard';
import { useGenerationRunStore } from '../stores/generationRunStore';
import { useUIStore } from '../stores/uiStore';
import {
  generationRunTitle,
  generationRunTone,
  isOpenGenerationRun,
  normalizedActivity,
} from '../lib/multi-agent/presentation';

export function GlobalAgentStatus() {
  const runs = useGenerationRunStore((state) => state.runs);
  const openAgentRun = useUIStore((state) => state.openAgentRun);
  const openRuns = runs.filter(isOpenGenerationRun);
  const current = openRuns.find((run) => run.status === 'running')
    ?? openRuns
      .filter((run) => run.status === 'pending')
      .sort((a, b) => (a.activity?.queuePosition ?? 999) - (b.activity?.queuePosition ?? 999))[0]
    ?? openRuns.find((run) => run.status === 'awaiting_input');

  if (!current) return null;
  const activity = normalizedActivity(current);
  const queuedCount = openRuns.filter((run) => run.id !== current.id && run.status === 'pending').length;
  const chapterTitle = current.snapshot.chapterTitle || `第 ${current.snapshot.chapterNumber ?? '?'} 章`;
  const message = current.status === 'awaiting_input'
    ? activity.message
    : `${chapterTitle}${queuedCount > 0 ? ` · 另有 ${queuedCount} 個任務排隊` : ''}`;

  return (
    <div
      className="global-agent-status"
      role="button"
      tabIndex={0}
      title="前往目前的 Agent 執行"
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
        title={generationRunTitle(current)}
        message={message}
        startedAt={activity.startedAt ?? current.createdAt}
        tone={generationRunTone(current)}
        running={current.status === 'running' || current.status === 'pending'}
        compact
      />
    </div>
  );
}
