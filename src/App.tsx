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
import { useSettingsStore } from './stores/settingsStore';
import { setDocumentLocale, t } from './lib/language-policy';
import { initializeGenerationOrchestrator } from './lib/multi-agent/orchestrator';
import { isTauri } from './lib/platform';

type WorkspaceName = 'outline' | 'characters' | 'chapters' | 'wiki' | 'scene' | 'comic' | 'video';

interface NavigationItem {
  key: WorkspaceName;
  labelKey: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const NAVIGATION: NavigationItem[] = [
  { key: 'outline', labelKey: 'navigation.outline', icon: List },
  { key: 'characters', labelKey: 'navigation.characters', icon: Users },
  { key: 'scene', labelKey: 'navigation.scene', icon: Map },
  { key: 'chapters', labelKey: 'navigation.chapters', icon: FileText },
  { key: 'wiki', labelKey: 'navigation.wiki', icon: BookOpen },
  { key: 'comic', labelKey: 'navigation.comic', icon: Image },
  { key: 'video', labelKey: 'navigation.video', icon: Film },
];

export default function App() {
  const { view, activeTab, setActiveTab, selectedChapterId, setSelectedChapterId, agentFocusVersion } = useUIStore();
  const { project, chapters, characters } = useProjectStore();
  const { generalPrefs } = useSettingsStore();
  const [workspace, setWorkspace] = useState<WorkspaceName>(activeTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null;

  useEffect(() => {
    const appTitle = t('common.appTitle', undefined, generalPrefs.interfaceLocale);
    setDocumentLocale(generalPrefs.interfaceLocale, appTitle);
    if (isTauri()) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(appTitle))
        .catch((error) => console.warn('[window] failed to localize title', error));
    }
  }, [generalPrefs.interfaceLocale]);

  useEffect(() => {
    if (!selectedChapterId && chapters[0]) setSelectedChapterId(chapters[0].id);
  }, [chapters, selectedChapterId, setSelectedChapterId]);

  useEffect(() => {
    void initializeGenerationOrchestrator().catch((error) => {
      console.error('[multi-agent] startup recovery failed', error);
    });
  }, []);

  useEffect(() => {
    if (agentFocusVersion > 0) setWorkspace('chapters');
  }, [agentFocusVersion]);

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
    <div className="v2-empty-state">{t('app.editorEmptyState', undefined, generalPrefs.interfaceLocale)}</div>
  );

  const chapterWorkspace = (
    <ResizablePane
      left={
        <div className="v2-resource-pane">
          <ChaptersPanel />
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
          <strong>{t('common.appTitle', undefined, generalPrefs.interfaceLocale)}</strong>
        </div>

        <nav className="v2-navigation" aria-label={t('app.mainNav', undefined, generalPrefs.interfaceLocale)}>
          {NAVIGATION.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey, undefined, generalPrefs.interfaceLocale);
            return (
              <button
                key={item.key}
                type="button"
                className={workspace === item.key ? 'active' : ''}
                onClick={() => openWorkspace(item.key)}
                title={label}
                aria-label={label}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className="v2-collapse-button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          title={sidebarCollapsed ? t('app.expandSidebar', undefined, generalPrefs.interfaceLocale) : t('app.collapseSidebar', undefined, generalPrefs.interfaceLocale)}
          aria-label={sidebarCollapsed ? t('app.expandSidebar', undefined, generalPrefs.interfaceLocale) : t('app.collapseSidebar', undefined, generalPrefs.interfaceLocale)}
        >
          <ChevronLeft size={16} />
          <span>{sidebarCollapsed ? t('app.expand', undefined, generalPrefs.interfaceLocale) : t('app.collapse', undefined, generalPrefs.interfaceLocale)}</span>
        </button>
      </aside>

      <main className="v2-main">
        <Toolbar variant="workspace" />
        <div className="v2-workspace">
          {workspace === 'outline' && (
            <div className="v2-full-resource-workspace"><OutlinePanel /></div>
          )}
          {workspace === 'characters' && (
            <div className="v2-full-resource-workspace"><CharactersPanel /></div>
          )}
          {workspace === 'chapters' && chapterWorkspace}
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
            <div className="v2-empty-state">{t('app.mediaEmptyState', undefined, generalPrefs.interfaceLocale)}</div>
          )}
        </div>
      </main>
    </div>
  );
}
