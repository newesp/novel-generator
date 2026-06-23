import { describe, expect, it, vi } from 'vitest';
import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import { loadComicVideoState } from './video-state-refresh';

const comic: ChapterComic = {
  id: 'comic-1',
  projectId: 'book-1',
  chapterId: 'chapter-1',
  title: 'Chapter 1',
  status: 'ready',
  stylePreset: '',
  providerId: '',
  visualContinuityBibleJson: '',
  videoStatus: 'ready',
  videoAssetId: 'chapter-video',
  subtitleAssetId: 'subtitle-1',
  createdAt: 1,
  updatedAt: 2,
};

const panel = (patch: Partial<ComicPanel>): ComicPanel => ({
  id: 'panel-1',
  comicId: 'comic-1',
  order: 1,
  beat: 'Opening',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '旁白',
  durationSec: 0,
  status: 'ready',
  createdAt: 1,
  updatedAt: 2,
  ...patch,
});

const asset = (patch: Partial<MediaAsset>): MediaAsset => ({
  id: 'asset-1',
  projectId: 'book-1',
  chapterId: 'chapter-1',
  kind: 'video',
  path: 'C:/media/file.mp4',
  mimeType: 'video/mp4',
  createdAt: 3,
  ...patch,
});

describe('loadComicVideoState', () => {
  it('reloads comic, refreshed panel segment ids, and all video library assets', async () => {
    const storage = {
      comics: {
        get: vi.fn(async () => comic),
      },
      comicPanels: {
        listByComic: vi.fn(async () => [
          panel({ id: 'panel-1', order: 1, segmentAssetId: 'fresh-segment' }),
        ]),
      },
      mediaAssets: {
        get: vi.fn(async (id: string) => ({
          'chapter-video': asset({ id: 'chapter-video', path: 'C:/media/chapter-video.mp4' }),
          'subtitle-1': asset({ id: 'subtitle-1', kind: 'subtitle', path: 'C:/media/chapter-video.srt', mimeType: 'application/x-subrip' }),
          'fresh-segment': asset({ id: 'fresh-segment', path: 'C:/media/segment-001.mp4' }),
        })[id]),
      },
    };

    const result = await loadComicVideoState({ comicId: 'comic-1', storage });

    expect(result.comic?.subtitleAssetId).toBe('subtitle-1');
    expect(result.panels.map((item) => item.segmentAssetId)).toEqual(['fresh-segment']);
    expect(Object.keys(result.assets).sort()).toEqual(['chapter-video', 'fresh-segment', 'subtitle-1']);
  });
});
