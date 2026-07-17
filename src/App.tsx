import { useEffect, useState, type ComponentType } from 'react';
import {
  BookOpen,
  ChevronLeft,
  FileText,
  Film,
  Image,
  Library,
  List,
  Map,
  Users,
} from 'lucide-react';
import { Toolbar } from './components/Toolbar';
import { ResizablePane } from './components/layout/ResizablePane';
import { OutlinePanel } from './components/outline/OutlinePanel';
import { CharactersPanel } from './components/characters/CharactersPanel';
import { ChaptersPanel } from './components/chapters/ChaptersPanel';
import { ChapterEditor } from './components/chapters/ChapterEditor';
import { WikiPanel } from './components/wiki/WikiPanel';
import { ComicModal, type ComicWorkspaceMode } from './components/comic/ComicModal';
import { HomePage } from './components/home/HomePage';
import { useUIStore } from './stores/uiStore';
import { useProjectStore } from './stores/projectStore';

type WorkspaceName = 'outline' | 'characters' | 'chapters' | 'wiki' | 'scene' | 'comic' | 'video';

interface NavigationItem {
  key: WorkspaceName;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const NAVIGATION: NavigationItem[] = [
  { key: 'outline', label: '大綱', icon: List },
  { key: 'characters', label: '角色', icon: Users },
  { key: 'scene', label: '場景', icon: Map },
  { key: 'chapters', label: '章節', icon: FileText },
  { key: 'wiki', label: 'Wiki', icon: BookOpen },
  { key: 'comic', label: '漫畫', icon: Image },
  { key: 'video', label: '影片', icon: Film },
];

export default function App() {
  const { view, activeTab, setActiveTab, selectedChapterId, setSelectedChapterId } = useUIStore();
  const { project, chapters, characters } = useProjectStore();
  const [workspace, setWorkspace] = useState<WorkspaceName>(activeTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null;

  useEffect(() => {
    if (!selectedChapterId && chapters[0]) setSelectedChapterId(chapters[0].id);
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  if (view === 'home') {
    return (
      <>
        <Toolbar />
        <HomePage />
      </>
    );
  }

  const openWorkspace = (next: WorkspaceName) => {
    setWorkspace(next);
    if (next === 'outline' || next === 'characters' || next === 'chapters' || next === 'wiki') {
      setActiveTab(next);
    }
  };

  const editor = project ? (
    <ChapterEditor />
  ) : (
    <div className="v2-empty-state">請從左側選擇或新增章節</div>
  );

  const standardWorkspace = (
    <ResizablePane
      left={
        <div className="v2-resource-pane">
          {workspace === 'outline' && <OutlinePanel />}
          {workspace === 'characters' && <CharactersPanel />}
          {workspace === 'chapters' && <ChaptersPanel />}
        </div>
      }
      right={editor}
    />
  );

  const mediaMode: ComicWorkspaceMode | null =
    workspace === 'scene' || workspace === 'comic' || workspace === 'video' ? workspace : null;

  return (
    <div className={`v2-app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="v2-sidebar">
        <div className="v2-brand">
          <Library size={19} strokeWidth={2} />
          <strong>小說產生器</strong>
        </div>

        <nav className="v2-navigation" aria-label="主要功能">
          {NAVIGATION.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={workspace === item.key ? 'active' : ''}
                onClick={() => openWorkspace(item.key)}
                title={item.label}
                aria-label={item.label}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className="v2-collapse-button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          title={sidebarCollapsed ? '展開側欄' : '收起側欄'}
          aria-label={sidebarCollapsed ? '展開側欄' : '收起側欄'}
        >
          <ChevronLeft size={16} />
          <span>{sidebarCollapsed ? '展開' : '收起'}</span>
        </button>
      </aside>

      <main className="v2-main">
        <Toolbar variant="workspace" />
        <div className="v2-workspace">
          {(workspace === 'outline' || workspace === 'characters' || workspace === 'chapters') && standardWorkspace}
          {workspace === 'wiki' && <WikiPanel workspace />}
          {mediaMode && selectedChapter && project && (
            <ComicModal
              open
              embedded
              workspaceMode={mediaMode}
              onClose={() => openWorkspace('chapters')}
              project={project}
              chapter={selectedChapter}
              chapters={chapters}
              characters={characters}
              onChapterChange={setSelectedChapterId}
            />
          )}
          {mediaMode && (!selectedChapter || !project) && (
            <div className="v2-empty-state">請先建立並選擇章節</div>
          )}
        </div>
      </main>
    </div>
  );
}
