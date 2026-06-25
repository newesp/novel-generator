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
  it('renders uploaded video clips with TTS audio as a panel segment', async () => {
    const assets: Record<string, MediaAsset> = {
      'clip-1': {
        id: 'clip-1',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'video',
        path: 'C:/media/clip-1.mp4',
        mimeType: 'video/mp4',
        generationParamsJson: JSON.stringify({ durationMs: 9000 }),
        createdAt: 1,
      },
      'clip-2': {
        id: 'clip-2',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'video',
        path: 'C:/media/clip-2.mp4',
        mimeType: 'video/mp4',
        generationParamsJson: JSON.stringify({ durationMs: 9000 }),
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
        durationMs: 5000,
        providerId: 'edge-tts',
        voice: 'zh-TW-HsiaoChenNeural',
      })),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      renderVideoClipSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };

    const result = await renderComicPanelSegment({
      comic,
      panel: panel({
        id: 'panel-1',
        assetId: undefined,
        videoClipAssetIds: ['clip-1', 'clip-2'],
        narration: '這一格使用外部影片。',
      } as Partial<ComicPanel>),
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
    expect(commands.renderSegment).not.toHaveBeenCalled();
    expect(commands.renderVideoClipSegment).toHaveBeenCalledWith(expect.objectContaining({
      videoClipPaths: ['C:/media/clip-1.mp4', 'C:/media/clip-2.mp4'],
      durationMs: 18400,
      trailingSilenceMs: 13400,
      visualDurationMs: 18000,
      preserveClipAudio: false,
      loopVideo: false,
    }));
    expect(storage.mediaAssets.add).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'video',
      generationParamsJson: expect.stringContaining('"visualSource":"video_clips"'),
    }));
  });

  it('passes panel clip audio and loop settings to the desktop clip renderer', async () => {
    const assets: Record<string, MediaAsset> = {
      'clip-1': {
        id: 'clip-1',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'video',
        path: 'C:/media/clip-1.mp4',
        mimeType: 'video/mp4',
        generationParamsJson: JSON.stringify({ durationMs: 9000 }),
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
        durationMs: 12000,
        providerId: 'edge-tts',
        voice: 'zh-TW-HsiaoChenNeural',
      })),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      renderVideoClipSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };

    const result = await renderComicPanelSegment({
      comic,
      panel: panel({
        id: 'panel-1',
        assetId: undefined,
        videoClipAssetIds: ['clip-1'],
        videoClipAudioMode: 'keep',
        videoClipLoopMode: 'loop',
        narration: '這一格保留影片聲音並重播影片。',
      } as Partial<ComicPanel>),
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

    expect(commands.renderVideoClipSegment).toHaveBeenCalledWith(expect.objectContaining({
      preserveClipAudio: true,
      loopVideo: true,
      durationMs: 12400,
      visualDurationMs: 9000,
    }));
    expect(JSON.parse(result.generationParamsJson ?? '{}')).toMatchObject({
      videoClipAudioMode: 'keep',
      videoClipLoopMode: 'loop',
    });
  });

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
      panel: panel({ id: 'panel-1', narration: '這一格有旁白。', motionEffect: 'slow_zoom_in' } as Partial<ComicPanel>),
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
    expect(ttsProvider.generate).toHaveBeenCalledWith(expect.objectContaining({
      outputPath: 'C:/media/book/chapter/comic-video/audio/panel-001.mp3',
      subtitlePath: 'C:/media/book/chapter/comic-video/subtitles/panel-001.srt',
    }));
    expect(commands.renderSegment).toHaveBeenCalledTimes(1);
    expect(commands.renderSegment).toHaveBeenCalledWith(expect.objectContaining({
      motionEffect: 'slow_zoom_in',
    }));
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
      motionEffect: 'slow_zoom_in',
    });
  });

  it('rerenders a panel segment when the motion effect changes', async () => {
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
      'tts-1': {
        id: 'tts-1',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'tts_audio',
        path: 'C:/media/audio.mp3',
        mimeType: 'audio/mpeg',
        generationParamsJson: JSON.stringify({
          subtitleText: [
            '1',
            '00:00:00,000 --> 00:00:02,200',
            'Motion narration',
            '',
          ].join('\n'),
        }),
        createdAt: 2,
      },
      'segment-1': {
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
          motionEffect: 'none',
          narrationHash: '83c8c24d',
          durationMs: 2600,
          subtitleCues: [
            { startMs: 0, endMs: 2200, text: 'Motion narration' },
          ],
        }),
        createdAt: 3,
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
        throw new Error('TTS should be reused');
      }),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };

    const result = await renderComicPanelSegment({
      comic,
      panel: panel({
        id: 'panel-1',
        narration: 'Motion narration',
        ttsAssetId: 'tts-1',
        ttsDurationMs: 2200,
        ttsVoice: 'zh-TW-HsiaoChenNeural',
        segmentAssetId: 'segment-1',
        motionEffect: 'slow_zoom_in',
      } as Partial<ComicPanel>),
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

    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/media/segments/segment-001.mp4' });
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('segment-1');
    expect(ttsProvider.generate).not.toHaveBeenCalled();
    expect(commands.renderSegment).toHaveBeenCalledWith(expect.objectContaining({
      motionEffect: 'slow_zoom_in',
    }));
    expect(JSON.parse(result.generationParamsJson ?? '{}')).toMatchObject({
      motionEffect: 'slow_zoom_in',
      ttsAssetId: 'tts-1',
    });
  });

  it('forces a matching panel segment to rerender for explicit single-panel export', async () => {
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
      'tts-1': {
        id: 'tts-1',
        projectId: 'book',
        chapterId: 'chapter',
        kind: 'tts_audio',
        path: 'C:/media/audio.mp3',
        mimeType: 'audio/mpeg',
        generationParamsJson: JSON.stringify({
          subtitleText: [
            '1',
            '00:00:00,000 --> 00:00:02,200',
            'Force narration',
            '',
          ].join('\n'),
        }),
        createdAt: 2,
      },
      'segment-1': {
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
          motionEffect: 'slow_zoom_in',
          narrationHash: '7df86a0e',
          durationMs: 2600,
          subtitleCues: [
            { startMs: 0, endMs: 2200, text: 'Force narration' },
          ],
        }),
        createdAt: 3,
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
        throw new Error('TTS should be reused');
      }),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      deleteMediaFile: vi.fn(async () => undefined),
      writeBinaryFile: vi.fn(async () => undefined),
    };

    const result = await renderComicPanelSegment({
      comic,
      panel: panel({
        id: 'panel-1',
        narration: 'Force narration',
        ttsAssetId: 'tts-1',
        ttsDurationMs: 2200,
        ttsVoice: 'zh-TW-HsiaoChenNeural',
        segmentAssetId: 'segment-1',
        motionEffect: 'slow_zoom_in',
      } as Partial<ComicPanel>),
      storage,
      ttsProvider,
      commands,
      forceRender: true,
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

    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/media/segments/segment-001.mp4' });
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('segment-1');
    expect(ttsProvider.generate).not.toHaveBeenCalled();
    expect(commands.renderSegment).toHaveBeenCalledTimes(1);
    expect(result.id).not.toBe('segment-1');
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
        durationMs: 2600,
        subtitleCues: [
          { startMs: 100, endMs: 1200, text: '完整章節旁白從這裡開始。' },
        ],
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
      generate: vi.fn(async (request: { text: string }) => ({
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
        subtitleText: request.text === '第一格旁白。'
          ? [
            '1',
            '00:00:00,100 --> 00:00:01,200',
            '第一格旁白。',
            '',
          ].join('\n')
          : [
            '1',
            '00:00:00,200 --> 00:00:00,900',
            '第二格旁白。',
            '',
          ].join('\n'),
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
        '00:00:00,100 --> 00:00:01,200',
        '第一格旁白。',
        '',
        '2',
        '00:00:02,800 --> 00:00:03,500',
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
