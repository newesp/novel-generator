import { describe, expect, it } from 'vitest';
import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import { buildComicVideoLibrary } from './video-library';

const comic = (patch: Partial<ChapterComic> = {}): ChapterComic => ({
  id: 'comic-1',
  projectId: 'book-1',
  chapterId: 'chapter-1',
  title: 'Chapter 1 comic',
  status: 'ready',
  stylePreset: '',
  providerId: '',
  visualContinuityBibleJson: '',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

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
  narration: '',
  durationSec: 0,
  status: 'ready',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const videoAsset = (patch: Partial<MediaAsset>): MediaAsset => ({
  id: 'asset-1',
  projectId: 'book-1',
  chapterId: 'chapter-1',
  kind: 'video',
  path: 'C:/media/video.mp4',
  mimeType: 'video/mp4',
  providerId: 'ffmpeg',
  createdAt: 10,
  ...patch,
});

describe('buildComicVideoLibrary', () => {
  it('lists the chapter video and panel segments with ready asset paths', () => {
    const result = buildComicVideoLibrary({
      comic: comic({ videoStatus: 'ready', videoAssetId: 'chapter-video' }),
      panels: [
        panel({ id: 'panel-2', order: 2, beat: 'Second panel', segmentAssetId: 'segment-2' }),
      ],
      assets: [
        videoAsset({ id: 'chapter-video', path: 'C:/media/chapter-video.mp4', createdAt: 20 }),
        videoAsset({ id: 'segment-2', path: 'C:/media/segment-002.mp4', createdAt: 30 }),
      ],
    });

    expect(result.map((item) => ({
      kind: item.kind,
      label: item.label,
      status: item.status,
      path: item.path,
    }))).toEqual([
      {
        kind: 'chapter',
        label: '整章 MP4',
        status: 'ready',
        path: 'C:/media/chapter-video.mp4',
      },
      {
        kind: 'panel',
        label: '#2 Second panel',
        status: 'ready',
        path: 'C:/media/segment-002.mp4',
      },
    ]);
  });

  it('marks referenced videos as missing when the media asset is gone', () => {
    const result = buildComicVideoLibrary({
      comic: comic({ videoStatus: 'ready', videoAssetId: 'missing-video' }),
      panels: [panel({ segmentAssetId: 'missing-segment' })],
      assets: [],
    });

    expect(result.map((item) => ({
      kind: item.kind,
      assetId: item.assetId,
      status: item.status,
      path: item.path,
    }))).toEqual([
      { kind: 'chapter', assetId: 'missing-video', status: 'missing', path: undefined },
      { kind: 'panel', assetId: 'missing-segment', status: 'missing', path: undefined },
    ]);
  });
});
