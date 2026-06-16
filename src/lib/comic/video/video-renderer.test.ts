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
      path: 'C:/media/image.png',
      mimeType: 'image/png',
      createdAt: 1,
    };
    const storage = {
      mediaAssets: {
        get: vi.fn(async () => imageAsset),
        add: vi.fn(async () => undefined),
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
      deleteMediaFile: vi.fn(),
    };
    const writeTextFile = vi.fn(async () => undefined);

    await renderComicVideo({
      comic,
      panels: [panel({ durationSec: 3 })],
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
        durationMs: 7600,
        trailingSilenceMs: 400,
      }),
    );
    expect(commands.concatVideo).toHaveBeenCalled();
    expect(storage.mediaAssets.add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video' }));
  });
});
