import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useGenerationRunStore } from '../../stores/generationRunStore';
import { isOpenGenerationRun } from '../../lib/multi-agent/presentation';
import { VersionPanel } from './VersionPanel';
import { AgentRunPanel } from './AgentRunPanel';

interface ChapterInspectorProps {
  chapterId: string;
  onApplyVersion: (content: string) => void;
  onOpenReviewModal: (runId: string) => void;
}

export function ChapterInspector({
  chapterId,
  onApplyVersion,
  onOpenReviewModal,
}: ChapterInspectorProps) {
  const runs = useGenerationRunStore((state) => state.runs);
  const focusedRunId = useUIStore((state) => state.focusedAgentRunId);
  const clearFocusedAgentRun = useUIStore((state) => state.clearFocusedAgentRun);
  const activeRun = runs.find((run) => run.chapterId === chapterId && isOpenGenerationRun(run));
  const [tab, setTab] = useState<'versions' | 'agent'>(activeRun ? 'agent' : 'versions');
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1100px)').matches);

  useEffect(() => {
    if (activeRun || focusedRunId) {
      setTab('agent');
      setCollapsed(false);
    }
  }, [activeRun?.id, focusedRunId]);

  const selectTab = (next: 'versions' | 'agent') => {
    setTab(next);
    setCollapsed(false);
    if (next === 'versions') clearFocusedAgentRun();
  };

  if (collapsed) {
    return (
      <aside className="chapter-inspector collapsed" aria-label="章節 Inspector">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="展開版本與 Agent Inspector"
          aria-label="展開版本與 Agent Inspector"
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className={`chapter-inspector tab-${tab}`} aria-label="章節 Inspector">
      <div className="chapter-inspector-tabs">
        <button type="button" className={tab === 'versions' ? 'active' : ''} onClick={() => selectTab('versions')}>
          版本
        </button>
        <button type="button" className={tab === 'agent' ? 'active' : ''} onClick={() => selectTab('agent')}>
          Agent{activeRun ? <span className="inspector-active-dot" aria-label="有未結束執行" /> : null}
        </button>
        <button
          type="button"
          className="chapter-inspector-collapse"
          onClick={() => setCollapsed(true)}
          title="收合 Inspector"
          aria-label="收合 Inspector"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="chapter-inspector-body">
        {tab === 'versions' ? (
          <VersionPanel onApplyVersion={onApplyVersion} />
        ) : (
          <AgentRunPanel
            chapterId={chapterId}
            focusedRunId={focusedRunId}
            onOpenReviewModal={onOpenReviewModal}
          />
        )}
      </div>
    </aside>
  );
}
