import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import { buildConcatList } from './concat-list';
import type { desktopComicVideoCommands } from './desktop-commands';
import { calculatePanelTiming } from './timing';
import type { TTSProvider } from './tts-provider';

type Commands = Pick<typeof desktopComicVideoCommands, 'concatVideo' | 'renderSegment'>;
type VideoRendererStorage = {
  mediaAssets: Pick<StorageAdapter['mediaAssets'], 'add' | 'get'>;
  comicPanels: Pick<StorageAdapter['comicPanels'], 'update'>;
  comics: Pick<StorageAdapter['comics'], 'update'>;
};

export interface ComicVideoSettings {
  mediaRoot: string;
  edgeTtsBin: string;
  ffmpegBin: string;
  ffprobeBin: string;
  voice: string;
  panelPauseMs: number;
  width: number;
  height: number;
  fps: number;
}

export interface RenderComicVideoInput {
  comic: ChapterComic;
  panels: ComicPanel[];
  storage: VideoRendererStorage;
  ttsProvider: TTSProvider;
  commands: Commands;
  writeTextFile: (path: string, content: string) => Promise<void>;
  settings: ComicVideoSettings;
}

export async function renderComicVideo(input: RenderComicVideoInput): Promise<MediaAsset> {
  const { comic, storage, ttsProvider, commands, settings } = input;
  const panels = [...input.panels].sort((a, b) => a.order - b.order);
  const segmentPaths: string[] = [];

  await storage.comics.update(comic.id, {
    videoStatus: 'generating_audio',
    videoErrorMessage: undefined,
    updatedAt: Date.now(),
  });

  for (const panel of panels) {
    if (!panel.assetId) throw new Error(`Panel #${panel.order} has no image asset.`);
    if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

    const imageAsset = await storage.mediaAssets.get(panel.assetId);
    const imagePath = imageAsset?.path ?? imageAsset?.url;
    if (!imagePath) throw new Error(`Panel #${panel.order} image has no file path or URL.`);

    const paddedOrder = String(panel.order).padStart(3, '0');
    const audioPath = `${settings.mediaRoot}/audio/panel-${paddedOrder}.mp3`;
    await storage.comicPanels.update(panel.id, {
      ttsStatus: 'generating',
      ttsErrorMessage: undefined,
      updatedAt: Date.now(),
    });

    const tts = await ttsProvider.generate({
      projectId: comic.projectId,
      chapterId: comic.chapterId,
      text: panel.narration,
      voice: settings.voice,
      outputPath: audioPath,
      edgeTtsBin: settings.edgeTtsBin,
      ffprobeBin: settings.ffprobeBin,
    });
    await storage.mediaAssets.add(tts.asset);
    await storage.comicPanels.update(panel.id, {
      ttsStatus: 'ready',
      ttsAssetId: tts.asset.id,
      ttsDurationMs: tts.durationMs,
      ttsProviderId: tts.providerId,
      ttsVoice: tts.voice,
      updatedAt: Date.now(),
    });

    const timing = calculatePanelTiming({
      audioDurationMs: tts.durationMs,
      durationSec: panel.durationSec,
      panelPauseMs: settings.panelPauseMs,
    });
    const segmentPath = `${settings.mediaRoot}/segments/segment-${paddedOrder}.mp4`;
    await storage.comics.update(comic.id, { videoStatus: 'rendering_segments', updatedAt: Date.now() });
    await commands.renderSegment({
      ffmpegBin: settings.ffmpegBin,
      imagePath,
      audioPath,
      outputPath: segmentPath,
      durationMs: timing.effectiveDurationMs,
      trailingSilenceMs: timing.trailingSilenceMs,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
    });

    const segmentAsset: MediaAsset = {
      id: crypto.randomUUID(),
      projectId: comic.projectId,
      chapterId: comic.chapterId,
      kind: 'video',
      path: segmentPath,
      mimeType: 'video/mp4',
      providerId: 'ffmpeg',
      generationParamsJson: JSON.stringify({
        panelId: panel.id,
        audioDurationMs: timing.audioDurationMs,
        durationMs: timing.effectiveDurationMs,
        trailingSilenceMs: timing.trailingSilenceMs,
      }),
      createdAt: Date.now(),
    };
    await storage.mediaAssets.add(segmentAsset);
    await storage.comicPanels.update(panel.id, {
      segmentAssetId: segmentAsset.id,
      updatedAt: Date.now(),
    });
    segmentPaths.push(segmentPath);
  }

  const concatListPath = `${settings.mediaRoot}/concat.txt`;
  await input.writeTextFile(concatListPath, buildConcatList(segmentPaths));

  const outputPath = `${settings.mediaRoot}/chapter-video.mp4`;
  await storage.comics.update(comic.id, { videoStatus: 'concatenating', updatedAt: Date.now() });
  await commands.concatVideo({ ffmpegBin: settings.ffmpegBin, concatListPath, outputPath });

  const videoAsset: MediaAsset = {
    id: crypto.randomUUID(),
    projectId: comic.projectId,
    chapterId: comic.chapterId,
    kind: 'video',
    path: outputPath,
    mimeType: 'video/mp4',
    providerId: 'ffmpeg',
    generationParamsJson: JSON.stringify({
      ...settings,
      sourcePanelIds: panels.map((panel) => panel.id),
    }),
    createdAt: Date.now(),
  };
  await storage.mediaAssets.add(videoAsset);
  await storage.comics.update(comic.id, {
    videoStatus: 'ready',
    videoAssetId: videoAsset.id,
    videoProviderId: 'ffmpeg',
    videoSettingsJson: videoAsset.generationParamsJson,
    videoErrorMessage: undefined,
    updatedAt: Date.now(),
  });

  return videoAsset;
}
