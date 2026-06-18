import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import { buildConcatList } from './concat-list';
import type { desktopComicVideoCommands } from './desktop-commands';
import { calculatePanelTiming } from './timing';
import type { TTSProvider } from './tts-provider';

type Commands = Pick<
  typeof desktopComicVideoCommands,
  'concatVideo' | 'deleteMediaFile' | 'renderSegment' | 'writeBinaryFile'
>;
type VideoRendererStorage = {
  mediaAssets: Pick<StorageAdapter['mediaAssets'], 'add' | 'delete' | 'get'>;
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

  await deleteAssetFileAndRecord(comic.videoAssetId, storage, commands);

  await storage.comics.update(comic.id, {
    videoStatus: 'generating_audio',
    videoAssetId: undefined,
    videoErrorMessage: undefined,
    updatedAt: Date.now(),
  });

  for (const panel of panels) {
    if (!panel.assetId) throw new Error(`Panel #${panel.order} has no image asset.`);
    if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

    const paddedOrder = String(panel.order).padStart(3, '0');
    const imageAsset = await storage.mediaAssets.get(panel.assetId);
    const imagePath = await resolvePanelImagePath({
      panel,
      asset: imageAsset,
      outputPath: `${settings.mediaRoot}/images/panel-${paddedOrder}.${imageExtension(imageAsset?.mimeType)}`,
      commands,
    });
    const audioPath = `${settings.mediaRoot}/audio/panel-${paddedOrder}.mp3`;
    await deleteAssetFileAndRecord(panel.ttsAssetId, storage, commands);
    await deleteAssetFileAndRecord(panel.segmentAssetId, storage, commands);
    await storage.comicPanels.update(panel.id, {
      ttsStatus: 'generating',
      ttsAssetId: undefined,
      ttsDurationMs: undefined,
      ttsErrorMessage: undefined,
      segmentAssetId: undefined,
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

async function deleteAssetFileAndRecord(
  assetId: string | undefined,
  storage: VideoRendererStorage,
  commands: Commands,
): Promise<void> {
  if (!assetId) return;

  const asset = await storage.mediaAssets.get(assetId);
  if (asset?.path) {
    await commands.deleteMediaFile({ path: asset.path });
  }
  await storage.mediaAssets.delete(assetId);
}

async function resolvePanelImagePath({
  panel,
  asset,
  outputPath,
  commands,
}: {
  panel: ComicPanel;
  asset: MediaAsset | undefined;
  outputPath: string;
  commands: Commands;
}): Promise<string> {
  if (asset?.path) return asset.path;
  if (!asset?.url?.startsWith('data:')) {
    throw new Error(`Panel #${panel.order} image has no file path or data URL.`);
  }

  await commands.writeBinaryFile({
    path: outputPath,
    bytes: dataUrlToBytes(asset.url),
  });
  return outputPath;
}

function dataUrlToBytes(url: string): number[] {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) {
    throw new Error('Invalid data URL image asset.');
  }

  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  return Array.from(binary, (char) => char.charCodeAt(0));
}

function imageExtension(mimeType: string | undefined): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}
