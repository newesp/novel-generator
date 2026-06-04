import { describe, expect, it } from 'vitest';
import type { Chapter, ChapterComic, ComicPanel, MediaAsset } from '../../types';
import { buildPanelReferenceLibrary, mergeReferenceBindings } from './panel-reference-library';

const chapter = (id: string, order: number): Chapter => ({
  id,
  projectId: 'project-1',
  order,
  title: `Chapter ${order}`,
  targetWords: null,
  beat: '',
  points: '',
  content: '',
  referenceChapterId: null,
  wikiSyncedAt: null,
  wikiSyncedHash: null,
  wikiSyncStatus: 'unsynced',
  createdAt: order,
  updatedAt: order,
});

const comic = (id: string, chapterId: string, updatedAt: number): ChapterComic => ({
  id,
  projectId: 'project-1',
  chapterId,
  title: '',
  status: 'ready',
  stylePreset: '',
  providerId: '',
  visualContinuityBibleJson: '',
  createdAt: updatedAt,
  updatedAt,
});

const panel = (id: string, comicId: string, order: number, assetId?: string): ComicPanel => ({
  id,
  comicId,
  order,
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
  assetId,
  status: assetId ? 'ready' : 'draft',
  createdAt: order,
  updatedAt: order,
});

const asset = (id: string): MediaAsset => ({
  id,
  projectId: 'project-1',
  kind: 'comic_panel_image',
  url: `data:image/png;base64,${id}`,
  mimeType: 'image/png',
  createdAt: 1,
});

describe('panel reference library', () => {
  it('lists ready panels by chapter and panel order using the latest comic per chapter', () => {
    const result = buildPanelReferenceLibrary({
      chapters: [chapter('ch-2', 2), chapter('ch-1', 1)],
      comics: [comic('old', 'ch-1', 1), comic('new', 'ch-1', 2), comic('c2', 'ch-2', 3)],
      panels: [
        panel('p2', 'new', 2, 'a2'),
        panel('old-p', 'old', 1, 'old-a'),
        panel('p1', 'new', 1, 'a1'),
        panel('p3', 'c2', 1, 'a3'),
      ],
      assets: [asset('a1'), asset('a2'), asset('a3'), asset('old-a')],
      excludePanelId: 'p2',
    });

    expect(result.map((item) => item.asset.id)).toEqual(['a1', 'a3']);
    expect(result.map((item) => item.label)).toEqual([
      'selected panel reference, chapter 1 panel 1, continuity',
      'selected panel reference, chapter 2 panel 1, continuity',
    ]);
  });

  it('deduplicates explicit and automatic bindings while preserving priority order', () => {
    expect(mergeReferenceBindings(
      [{ assetId: 'character', label: 'character identity' }],
      [{ assetId: 'manual', label: 'manual panel' }, { assetId: 'character', label: 'duplicate' }],
      [{ assetId: 'previous', label: 'previous panel' }],
    )).toEqual([
      { assetId: 'character', label: 'character identity' },
      { assetId: 'manual', label: 'manual panel' },
      { assetId: 'previous', label: 'previous panel' },
    ]);
  });
});
