import { describe, expect, it, vi } from 'vitest';
import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import { renderComicPanelSegment, renderComicVideo } from './video-renderer';

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
  it('renders one panel segment without validating other panels', async () => {
    const imageAsset: MediaAsset = {
      id: 'image-1',
      projectId: 'book',
      chapterId: 'chapter',
      kind: 'comic_panel_image',
      path: 'C:/media/panel-001.png',
      mimeType: 'image/png',
      createdAt: 1,
    };
    const assets: Record<string, MediaAsset> = { 'image-1': imageAsset };
    const storage = {
      mediaAssets: {
        get: vi.fn(async (id: string) => assets[id]),
        add: vi.fn(async (asset: MediaAsset) => {
          assets[asset.id] = asset;
        }),
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
        durationMs: 2200,
        providerId: 'edge-tts',
        voice: 'zh-TW-HsiaoChenNeural',
      })),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };

    const result = await renderComicPanelSegment({
      comic,
      panel: panel({ id: 'panel-1', narration: '這一格有旁白。' }),
      storage,
      ttsProvider,
      commands,
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

    expect(result.path).toBe('C:/media/book/chapter/comic-video/segments/segment-001.mp4');
    expect(ttsProvider.generate).toHaveBeenCalledTimes(1);
    expect(commands.renderSegment).toHaveBeenCalledTimes(1);
    expect(storage.comicPanels.update).toHaveBeenCalledWith(
      'panel-1',
      expect.objectContaining({
        ttsStatus: 'ready',
        ttsAssetId: 'tts-1',
        ttsDurationMs: 2200,
        ttsVoice: 'zh-TW-HsiaoChenNeural',
      }),
    );
    expect(storage.comicPanels.update).toHaveBeenCalledWith(
      'panel-1',
      expect.objectContaining({ segmentAssetId: result.id }),
    );
    expect(JSON.parse(result.generationParamsJson ?? '{}')).toMatchObject({
      panelId: 'panel-1',
      sourceImageAssetId: 'image-1',
      ttsAssetId: 'tts-1',
      ttsVoice: 'zh-TW-HsiaoChenNeural',
      durationSec: 0,
      panelPauseMs: 400,
      width: 1920,
      height: 1080,
      fps: 30,
    });
  });

  it('reuses matching panel segments when rendering the chapter video', async () => {
    const reusableSegment: MediaAsset = {
      id: 'segment-1',
      projectId: 'book',
      chapterId: 'chapter',
      kind: 'video',
      path: 'C:/media/segments/segment-001.mp4',
      mimeType: 'video/mp4',
      providerId: 'ffmpeg',
      generationParamsJson: JSON.stringify({
        panelId: 'panel-1',
        sourceImageAssetId: 'image-1',
        ttsAssetId: 'tts-1',
        ttsVoice: 'zh-TW-HsiaoChenNeural',
        durationSec: 0,
        panelPauseMs: 400,
        width: 1920,
        height: 1080,
        fps: 30,
        narrationHash: '5254267',
      }),
      createdAt: 1,
    };
    const assets: Record<string, MediaAsset> = {
      'image-1': {
        id: 'image-1',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'comic_panel_image',
        path: 'C:/media/panel-001.png',
        mimeType: 'image/png',
        createdAt: 1,
      },
      'segment-1': reusableSegment,
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
        add: vi.fn(async (asset: MediaAsset) => {
          assets[asset.id] = asset;
        }),
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
      generate: vi.fn(async () => {
        throw new Error('TTS should not regenerate');
      }),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };
    const writeTextFile = vi.fn(async () => undefined);

    await renderComicVideo({
      comic,
      panels: [panel({ id: 'panel-1', segmentAssetId: 'segment-1', narration: '完整章節旁白從這裡開始。' })],
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

    expect(ttsProvider.generate).not.toHaveBeenCalled();
    expect(commands.renderSegment).not.toHaveBeenCalled();
    expect(writeTextFile).toHaveBeenCalledWith(
      'C:/media/book/chapter/comic-video/concat.txt',
      "file 'C:/media/segments/segment-001.mp4'\n",
    );
    expect(commands.concatVideo).toHaveBeenCalledTimes(1);
  });

  it('writes a sidecar SRT subtitle asset when rendering the chapter video', async () => {
    const assets: Record<string, MediaAsset> = {
      'image-1': {
        id: 'image-1',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'comic_panel_image',
        path: 'C:/media/panel-001.png',
        mimeType: 'image/png',
        createdAt: 1,
      },
      'old-subtitle': {
        id: 'old-subtitle',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'subtitle',
        path: 'C:/media/old-subtitle.srt',
        mimeType: 'application/x-subrip',
        createdAt: 1,
      },
    };
    const storage = {
      mediaAssets: {
        get: vi.fn(async (id: string) => assets[id]),
        add: vi.fn(async (asset: MediaAsset) => {
          assets[asset.id] = asset;
        }),
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
        durationMs: 2200,
        providerId: 'edge-tts',
        voice: 'zh-TW-HsiaoChenNeural',
      })),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };
    const writeTextFile = vi.fn(async () => undefined);

    await renderComicVideo({
      comic: { ...comic, subtitleAssetId: 'old-subtitle' },
      panels: [
        panel({ id: 'panel-1', order: 1, narration: '第一格旁白。' }),
        panel({ id: 'panel-2', order: 2, narration: '第二格旁白。', durationSec: 1 }),
      ],
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

    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/media/old-subtitle.srt' });
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('old-subtitle');
    expect(writeTextFile).toHaveBeenCalledWith(
      'C:/media/book/chapter/comic-video/chapter-video.srt',
      [
        '1',
        '00:00:00,000 --> 00:00:02,600',
        '第一格旁白。',
        '',
        '2',
        '00:00:02,600 --> 00:00:05,200',
        '第二格旁白。',
        '',
      ].join('\n'),
    );
    expect(storage.mediaAssets.add).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'subtitle',
      path: 'C:/media/book/chapter/comic-video/chapter-video.srt',
      mimeType: 'application/x-subrip',
      providerId: 'srt',
    }));
    expect(storage.comics.update).toHaveBeenCalledWith(
      'comic',
      expect.objectContaining({
        subtitleAssetId: expect.any(String),
      }),
    );
  });

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
