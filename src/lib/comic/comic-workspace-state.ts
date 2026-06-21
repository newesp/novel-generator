import type { Chapter, ComicPanel } from '../../types';

export interface ComicWorkspaceState {
  chapterId?: string;
  panelId?: string;
}

export function comicWorkspaceStateKey(projectId: string): string {
  return `comic-workspace-state:${projectId}`;
}

export function resolveComicWorkspaceState(
  saved: ComicWorkspaceState | undefined,
  { chapters, panels }: { chapters: Chapter[]; panels: ComicPanel[] },
): ComicWorkspaceState {
  const chapterId = saved?.chapterId && chapters.some((chapter) => chapter.id === saved.chapterId)
    ? saved.chapterId
    : undefined;
  const panelId = saved?.panelId && panels.some((panel) => panel.id === saved.panelId)
    ? saved.panelId
    : panels[0]?.id;

  return { chapterId, panelId };
}
