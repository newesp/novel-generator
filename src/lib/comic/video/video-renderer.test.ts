import { describe, expect, it, vi } from 'vitest';
import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import { renderComicVideo } from './video-renderer';

const comic: ChapterComic = {
  id: 'comic',
  projectId: 'book',
  chapterId: 'chapter',
  title: 'chapter video',
  status: 'ready',
  stylePreset: 'manga',
  providerId: 'comfyui',
  visualContinuityBibleJson: '{}',
  videoAssetId: 'old-video',
  createdAt: 1,
  updatedAt: 2,
};

const panel = (patch: Partial<ComicPanel>): ComicPanel => ({
  id: 'panel-1',
  comicId: 'comic',
  order: 1,
  beat: '開場',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '完整章節旁白從這裡開始。',
  durationSec: 0,
  assetId: 'image-1',
  status: 'ready',
  createdAt: 1,
  updatedAt: 2,
  ...patch,
});

describe('renderComicVideo', () => {
  it('uses max audio/manual duration plus panel pause for segment duration', async () => {
    const imageAsset: MediaAsset = {
      id: 'image-1',
      projectId: 'book',
      chapterId: 'chapter',
      kind: 'comic_panel_image',
      url: 'data:image/png;base64,AQID',
      mimeType: 'image/png',
      createdAt: 1,
    };
    const assets: Record<string, MediaAsset> = {
      'image-1': imageAsset,
      'old-tts': {
        id: 'old-tts',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'tts_audio',
        path: 'C:/media/old-audio.mp3',
        mimeType: 'audio/mpeg',
        createdAt: 1,
      },
      'old-segment': {
        id: 'old-segment',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'video',
        path: 'C:/media/old-segment.mp4',
        mimeType: 'video/mp4',
        createdAt: 1,
      },
      'old-video': {
        id: 'old-video',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'video',
        path: 'C:/media/old-video.mp4',
        mimeType: 'video/mp4',
        createdAt: 1,
      },
    };
    const storage = {
      mediaAssets: {
        get: vi.fn(async (id: string) => assets[id]),
        add: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      comicPanels: {
        update: vi.fn(async () => undefined),
      },
      comics: {
        update: vi.fn(async () => undefined),
      },
    };
    const ttsProvider = {
      id: 'edge-tts',
      label: 'Edge-TTS',
      generate: vi.fn(async () => ({
        asset: {
          id: 'tts-1',
          projectId: 'book',
          chapterId: 'chapter',
          kind: 'tts_audio' as const,
          path: 'C:/media/audio.mp3',
          mimeType: 'audio/mpeg',
          createdAt: 2,
        },
        durationMs: 7200,
        providerId: 'edge-tts',
        voice: 'zh-TW-HsiaoChenNeural',
      })),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      probeAudioDuration: vi.fn(),
      generateTtsAudio: vi.fn(),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };
    const writeTextFile = vi.fn(async () => undefined);

    await renderComicVideo({
      comic,
      panels: [panel({ durationSec: 3, ttsAssetId: 'old-tts', segmentAssetId: 'old-segment' })],
      storage,
      ttsProvider,
      commands,
      writeTextFile,
      settings: {
        mediaRoot: 'C:/media/book/chapter/comic-video',
        edgeTtsBin: 'edge-tts',
        ffmpegBin: 'ffmpeg',
        ffprobeBin: 'ffprobe',
        voice: 'zh-TW-HsiaoChenNeural',
        panelPauseMs: 400,
        width: 1920,
        height: 1080,
        fps: 30,
      },
    });

    expect(commands.renderSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePath: 'C:/media/book/chapter/comic-video/images/panel-001.png',
        durationMs: 7600,
        trailingSilenceMs: 400,
      }),
    );
    expect(commands.writeBinaryFile).toHaveBeenCalledWith({
      path: 'C:/media/book/chapter/comic-video/images/panel-001.png',
      bytes: [1, 2, 3],
    });
    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/media/old-audio.mp3' });
    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/media/old-segment.mp4' });
    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/media/old-video.mp4' });
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('old-tts');
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('old-segment');
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('old-video');
    expect(commands.concatVideo).toHaveBeenCalled();
    expect(storage.mediaAssets.add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video' }));
  });
});
