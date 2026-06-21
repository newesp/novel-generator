import { describe, expect, it } from 'vitest';
import type { Chapter, ComicPanel } from '../../types';
import {
  comicWorkspaceStateKey,
  resolveComicWorkspaceState,
  type ComicWorkspaceState,
} from './comic-workspace-state';

const chapter = (id: string): Chapter => ({
  id,
  projectId: 'book-1',
  order: 1,
  title: id,
  targetWords: null,
  beat: '',
  points: '',
  content: '',
  referenceChapterId: null,
  wikiSyncedAt: null,
  wikiSyncedHash: null,
  wikiSyncStatus: 'unsynced',
  createdAt: 1,
  updatedAt: 1,
});

const panel = (id: string): ComicPanel => ({
  id,
  comicId: 'comic-1',
  order: 1,
  beat: '',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '',
  durationSec: 0,
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
});

describe('comic workspace state', () => {
  it('stores state under a per-book app meta key', () => {
    expect(comicWorkspaceStateKey('book-1')).toBe('comic-workspace-state:book-1');
    expect(comicWorkspaceStateKey('book-2')).toBe('comic-workspace-state:book-2');
  });

  it('restores a saved chapter and panel when both still exist', () => {
    const saved: ComicWorkspaceState = { chapterId: 'ch-2', panelId: 'panel-3' };

    expect(resolveComicWorkspaceState(saved, {
      chapters: [chapter('ch-1'), chapter('ch-2')],
      panels: [panel('panel-1'), panel('panel-3')],
    })).toEqual(saved);
  });

  it('ignores missing chapters and falls back to the first available panel', () => {
    const saved: ComicWorkspaceState = { chapterId: 'missing-chapter', panelId: 'missing-panel' };

    expect(resolveComicWorkspaceState(saved, {
      chapters: [chapter('ch-1')],
      panels: [panel('panel-1')],
    })).toEqual({ chapterId: undefined, panelId: 'panel-1' });
  });
});
