import { Toolbar } from './components/Toolbar';
import { ResizablePane } from './components/layout/ResizablePane';
import { OutlinePanel } from './components/outline/OutlinePanel';
import { CharactersPanel } from './components/characters/CharactersPanel';
import { ChaptersPanel } from './components/chapters/ChaptersPanel';
import { ChapterEditor } from './components/chapters/ChapterEditor';
import { HomePage } from './components/home/HomePage';
import { useUIStore } from './stores/uiStore';
import { useProjectStore } from './stores/projectStore';

import type { TabName } from './types';

const TABS: { key: TabName; label: string; disabled?: boolean }[] = [
  { key: 'outline', label: '大綱' },
  { key: 'characters', label: '角色' },
  { key: 'chapters', label: '章節' },
  { key: 'wiki', label: 'Wiki', disabled: true },
];

export default function App() {
  const { view, activeTab, setActiveTab } = useUIStore();
  const { project } = useProjectStore();

  return (
    <>
      <Toolbar />

      {view === 'home' ? (
        <HomePage />
      ) : (
        <ResizablePane
          left={
            <>
              <div className="left-pane-tabs">
                {TABS.map((t) => (
                  <div
                    key={t.key}
                    className={`tab${activeTab === t.key ? ' active' : ''}${t.disabled ? ' disabled' : ''}`}
                    onClick={() => !t.disabled && setActiveTab(t.key)}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
              {activeTab === 'outline' && <OutlinePanel />}
              {activeTab === 'characters' && <CharactersPanel />}
              {activeTab === 'chapters' && <ChaptersPanel />}
              {activeTab === 'wiki' && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: 'var(--text-tertiary)', fontSize: 14,
                }}>
                  🔒 Phase 2 開放
                </div>
              )}
            </>
          }
          right={
            project ? <ChapterEditor /> : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--text-tertiary)', fontSize: 14,
              }}>
                請從左側選擇或新增章節
              </div>
            )
          }
        />
      )}
    </>
  );
}
