import { describe, expect, it } from 'vitest';
import type { ComicPanel, MediaAsset } from '../../../types';
import {
  buildPanelVideoClipMetadata,
  panelHasVideoClips,
  panelHasVisualSource,
  panelVideoClipAssetIds,
  panelVideoClipDurationMs,
  panelVideoClipFileName,
  normalizePanelVideoClipAudioMode,
  normalizePanelVideoClipLoopMode,
} from './video-clips';

const panel = (patch: Partial<ComicPanel> = {}): ComicPanel => ({
  id: 'panel-1',
  comicId: 'comic',
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
  ...patch,
});

describe('panel video clips', () => {
  it('treats uploaded clips as a valid panel visual source', () => {
    expect(panelVideoClipAssetIds(panel({ videoClipAssetIds: ['clip-1', '', 'clip-2'] }))).toEqual(['clip-1', 'clip-2']);
    expect(panelHasVideoClips(panel({ videoClipAssetIds: ['clip-1'] }))).toBe(true);
    expect(panelHasVisualSource(panel({ videoClipAssetIds: ['clip-1'] }))).toBe(true);
    expect(panelHasVisualSource(panel({ assetId: 'image-1' }))).toBe(true);
    expect(panelHasVisualSource(panel())).toBe(false);
  });

  it('stores and reads upload metadata', () => {
    const asset: MediaAsset = {
      id: 'clip-1',
      projectId: 'book',
      chapterId: 'chapter',
      kind: 'video',
      path: 'C:/media/clip.mp4',
      mimeType: 'video/mp4',
      generationParamsJson: buildPanelVideoClipMetadata({
        fileName: 'source.mp4',
        panelId: 'panel-1',
        order: 2,
        durationMs: 9123,
      }),
      createdAt: 1,
    };

    expect(panelVideoClipDurationMs(asset)).toBe(9123);
    expect(panelVideoClipFileName(asset)).toBe('source.mp4');
  });

  it('normalizes optional clip render modes', () => {
    expect(normalizePanelVideoClipAudioMode('keep')).toBe('keep');
    expect(normalizePanelVideoClipAudioMode(undefined)).toBe('mute');
    expect(normalizePanelVideoClipAudioMode('bad')).toBe('mute');
    expect(normalizePanelVideoClipLoopMode('loop')).toBe('loop');
    expect(normalizePanelVideoClipLoopMode(undefined)).toBe('freeze');
    expect(normalizePanelVideoClipLoopMode('bad')).toBe('freeze');
  });
});
