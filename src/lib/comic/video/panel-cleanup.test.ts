import { describe, expect, it, vi } from 'vitest';
import type { ComicPanel, MediaAsset } from '../../../types';
import { cleanupPanelVideoArtifacts } from './panel-cleanup';

const panel: ComicPanel = {
  id: 'panel-1',
  comicId: 'comic',
  order: 2,
  beat: '轉折',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '',
  durationSec: 0,
  ttsAssetId: 'tts-1',
  segmentAssetId: 'segment-1',
  videoClipAssetIds: ['clip-1'],
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
};

describe('cleanupPanelVideoArtifacts', () => {
  it('deletes panel-owned TTS and segment assets plus files', async () => {
    const assets: Record<string, MediaAsset> = {
      'tts-1': {
        id: 'tts-1',
        projectId: 'book',
        chapterId: 'ch',
        kind: 'tts_audio',
        path: 'C:/a.mp3',
        mimeType: 'audio/mpeg',
        createdAt: 1,
      },
      'segment-1': {
        id: 'segment-1',
        projectId: 'book',
        chapterId: 'ch',
        kind: 'video',
        path: 'C:/s.mp4',
        mimeType: 'video/mp4',
        createdAt: 1,
      },
      'clip-1': {
        id: 'clip-1',
        projectId: 'book',
        chapterId: 'ch',
        kind: 'video',
        path: 'C:/clip.mp4',
        mimeType: 'video/mp4',
        createdAt: 1,
      },
    };
    const storage = {
      mediaAssets: {
        get: vi.fn(async (id: string) => assets[id]),
        delete: vi.fn(async () => undefined),
      },
    };
    const commands = { deleteMediaFile: vi.fn(async () => undefined) };

    await cleanupPanelVideoArtifacts({ panel, storage, commands });

    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/a.mp3' });
    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/s.mp4' });
    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/clip.mp4' });
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('tts-1');
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('segment-1');
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('clip-1');
  });
});
