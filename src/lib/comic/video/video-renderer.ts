import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import { buildConcatList } from './concat-list';
import type { desktopComicVideoCommands } from './desktop-commands';
import { buildOffsetSrt, parseSrt, type OffsetSubtitleCueGroup, type SubtitleCue } from './subtitles';
import { calculatePanelTiming } from './timing';
import type { TTSGenerationResult, TTSProvider } from './tts-provider';

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

export interface RenderComicPanelSegmentInput {
  comic: ChapterComic;
  panel: ComicPanel;
  storage: VideoRendererStorage;
  ttsProvider: TTSProvider;
  commands: Commands;
  settings: ComicVideoSettings;
}

export async function renderComicVideo(input: RenderComicVideoInput): Promise<MediaAsset> {
  const { comic, storage, ttsProvider, commands, settings } = input;
  const panels = [...input.panels].sort((a, b) => a.order - b.order);
  const segmentPaths: string[] = [];
  const subtitleGroups: OffsetSubtitleCueGroup[] = [];
  let subtitleOffsetMs = 0;

  await deleteAssetFileAndRecord(comic.videoAssetId, storage, commands);
  await deleteAssetFileAndRecord(comic.subtitleAssetId, storage, commands);

  await storage.comics.update(comic.id, {
    videoStatus: 'generating_audio',
    videoAssetId: undefined,
    subtitleAssetId: undefined,
    videoErrorMessage: undefined,
    updatedAt: Date.now(),
  });

  for (const panel of panels) {
    if (!panel.assetId) throw new Error(`Panel #${panel.order} has no image asset.`);
    if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

    const reusableSegment = await findReusableSegment(panel, storage, settings);
    if (reusableSegment?.path) {
      const durationMs = segmentDurationMs(reusableSegment);
      segmentPaths.push(reusableSegment.path);
      subtitleGroups.push({
        offsetMs: subtitleOffsetMs,
        cues: segmentSubtitleCues(reusableSegment) ?? narrationFallbackCue(panel, durationMs),
      });
      subtitleOffsetMs += durationMs;
      continue;
    }

    const segmentAsset = await renderComicPanelSegment({
      comic,
      panel,
      storage,
      ttsProvider,
      commands,
      settings,
    });
    const durationMs = segmentDurationMs(segmentAsset);
    segmentPaths.push(segmentAsset.path ?? `${settings.mediaRoot}/segments/segment-${String(panel.order).padStart(3, '0')}.mp4`);
    subtitleGroups.push({
      offsetMs: subtitleOffsetMs,
      cues: segmentSubtitleCues(segmentAsset) ?? narrationFallbackCue(panel, durationMs),
    });
    subtitleOffsetMs += durationMs;
  }

  const concatListPath = `${settings.mediaRoot}/concat.txt`;
  await input.writeTextFile(concatListPath, buildConcatList(segmentPaths));

  const outputPath = `${settings.mediaRoot}/chapter-video.mp4`;
  await storage.comics.update(comic.id, { videoStatus: 'concatenating', updatedAt: Date.now() });
  await commands.concatVideo({ ffmpegBin: settings.ffmpegBin, concatListPath, outputPath });

  const subtitlePath = `${settings.mediaRoot}/chapter-video.srt`;
  const subtitleText = buildOffsetSrt(subtitleGroups);
  await input.writeTextFile(subtitlePath, subtitleText);
  const subtitleAsset: MediaAsset = {
    id: crypto.randomUUID(),
    projectId: comic.projectId,
    chapterId: comic.chapterId,
    kind: 'subtitle',
    path: subtitlePath,
    mimeType: 'application/x-subrip',
    providerId: 'srt',
    generationParamsJson: JSON.stringify({
      sourcePanelIds: panels.map((panel) => panel.id),
      panelPauseMs: settings.panelPauseMs,
      voice: settings.voice,
      format: 'srt',
    }),
    createdAt: Date.now(),
  };

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
  await storage.mediaAssets.add(subtitleAsset);
  await storage.mediaAssets.add(videoAsset);
  await storage.comics.update(comic.id, {
    videoStatus: 'ready',
    videoAssetId: videoAsset.id,
    subtitleAssetId: subtitleAsset.id,
    videoProviderId: 'ffmpeg',
    videoSettingsJson: videoAsset.generationParamsJson,
    videoErrorMessage: undefined,
    updatedAt: Date.now(),
  });

  return videoAsset;
}

export async function renderComicPanelSegment(input: RenderComicPanelSegmentInput): Promise<MediaAsset> {
  const { comic, panel, storage, ttsProvider, commands, settings } = input;

  if (!panel.assetId) throw new Error(`Panel #${panel.order} has no image asset.`);
  if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

  const reusableSegment = await findReusableSegment(panel, storage, settings);
  if (reusableSegment) return reusableSegment;

  const paddedOrder = String(panel.order).padStart(3, '0');
  const imageAsset = await storage.mediaAssets.get(panel.assetId);
  const imagePath = await resolvePanelImagePath({
      panel,
      asset: imageAsset,
      outputPath: `${settings.mediaRoot}/images/panel-${paddedOrder}.${imageExtension(imageAsset?.mimeType)}`,
      commands,
    });

  await deleteAssetFileAndRecord(panel.segmentAssetId, storage, commands);

  const reusableTts = await findReusableTts(panel, storage, settings);
  const tts = reusableTts ?? await generatePanelTts({
    comic,
    panel,
    storage,
    ttsProvider,
    commands,
    settings,
    audioPath: `${settings.mediaRoot}/audio/panel-${paddedOrder}.mp3`,
    subtitlePath: `${settings.mediaRoot}/subtitles/panel-${paddedOrder}.srt`,
  });

  const timing = calculatePanelTiming({
    audioDurationMs: tts.durationMs,
    durationSec: panel.durationSec,
    panelPauseMs: settings.panelPauseMs,
  });
  const segmentPath = `${settings.mediaRoot}/segments/segment-${paddedOrder}.mp4`;
  await commands.renderSegment({
    ffmpegBin: settings.ffmpegBin,
    imagePath,
    audioPath: tts.asset.path ?? `${settings.mediaRoot}/audio/panel-${paddedOrder}.mp3`,
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
      sourceImageAssetId: panel.assetId,
      ttsAssetId: tts.asset.id,
      ttsVoice: tts.voice,
      durationSec: panel.durationSec,
      panelPauseMs: settings.panelPauseMs,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      narrationHash: hashNarration(panel.narration),
      audioDurationMs: timing.audioDurationMs,
      durationMs: timing.effectiveDurationMs,
      trailingSilenceMs: timing.trailingSilenceMs,
      subtitleCues: ttsSubtitleCues(tts, panel, timing.effectiveDurationMs),
    }),
    createdAt: Date.now(),
  };
  await storage.mediaAssets.add(segmentAsset);
  await storage.comicPanels.update(panel.id, {
    segmentAssetId: segmentAsset.id,
    updatedAt: Date.now(),
  });

  return segmentAsset;
}

async function generatePanelTts({
  comic,
  panel,
  storage,
  ttsProvider,
  commands,
  settings,
  audioPath,
  subtitlePath,
}: {
  comic: ChapterComic;
  panel: ComicPanel;
  storage: VideoRendererStorage;
  ttsProvider: TTSProvider;
  commands: Commands;
  settings: ComicVideoSettings;
  audioPath: string;
  subtitlePath: string;
}): Promise<TTSGenerationResult> {
    await deleteAssetFileAndRecord(panel.ttsAssetId, storage, commands);
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
      subtitlePath,
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

  return tts;
}

async function findReusableTts(panel: ComicPanel, storage: VideoRendererStorage, settings: ComicVideoSettings) {
  if (!panel.ttsAssetId || panel.ttsVoice !== settings.voice || !panel.ttsDurationMs) return null;
  const asset = await storage.mediaAssets.get(panel.ttsAssetId);
  if (!asset?.path) return null;
  const subtitleText = ttsAssetSubtitleText(asset);
  if (!subtitleText) return null;
  return {
    asset,
    durationMs: panel.ttsDurationMs,
    providerId: panel.ttsProviderId ?? 'edge-tts',
    voice: panel.ttsVoice,
    subtitleText,
  };
}

async function findReusableSegment(
  panel: ComicPanel,
  storage: VideoRendererStorage,
  settings: ComicVideoSettings,
): Promise<MediaAsset | null> {
  if (!panel.segmentAssetId) return null;
  const asset = await storage.mediaAssets.get(panel.segmentAssetId);
  if (!asset?.path || !asset.generationParamsJson) return null;
  let metadata: Partial<SegmentMetadata>;
  try {
    metadata = JSON.parse(asset.generationParamsJson) as Partial<SegmentMetadata>;
  } catch {
    return null;
  }
  if (
    metadata.panelId !== panel.id ||
    metadata.sourceImageAssetId !== panel.assetId ||
    metadata.ttsVoice !== settings.voice ||
    metadata.durationSec !== panel.durationSec ||
    metadata.panelPauseMs !== settings.panelPauseMs ||
    metadata.width !== settings.width ||
    metadata.height !== settings.height ||
    metadata.fps !== settings.fps ||
    metadata.narrationHash !== hashNarration(panel.narration)
  ) {
    return null;
  }
  if (!Array.isArray(metadata.subtitleCues) || !metadata.subtitleCues.length) return null;
  return asset;
}

interface SegmentMetadata {
  panelId: string;
  sourceImageAssetId: string;
  ttsAssetId: string;
  ttsVoice: string;
  durationSec: number;
  panelPauseMs: number;
  width: number;
  height: number;
  fps: number;
  narrationHash: string;
  durationMs?: number;
  subtitleCues?: SubtitleCue[];
}

function segmentDurationMs(asset: MediaAsset): number {
  if (!asset.generationParamsJson) return 0;
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as Partial<SegmentMetadata>;
    return typeof metadata.durationMs === 'number' && Number.isFinite(metadata.durationMs)
      ? Math.max(0, metadata.durationMs)
      : 0;
  } catch {
    return 0;
  }
}

function segmentSubtitleCues(asset: MediaAsset): SubtitleCue[] | null {
  if (!asset.generationParamsJson) return null;
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as Partial<SegmentMetadata>;
    if (!Array.isArray(metadata.subtitleCues)) return null;
    const cues = metadata.subtitleCues.filter(isSubtitleCue);
    return cues.length ? cues : null;
  } catch {
    return null;
  }
}

function ttsSubtitleCues(tts: TTSGenerationResult, panel: ComicPanel, durationMs: number): SubtitleCue[] {
  const cues = parseSrt(tts.subtitleText ?? '');
  return cues.length ? cues : narrationFallbackCue(panel, durationMs);
}

function narrationFallbackCue(panel: ComicPanel, durationMs: number): SubtitleCue[] {
  const text = panel.narration.trim().replace(/\s+/g, ' ');
  return text ? [{ startMs: 0, endMs: Math.max(0, durationMs), text }] : [];
}

function isSubtitleCue(value: unknown): value is SubtitleCue {
  if (!value || typeof value !== 'object') return false;
  const cue = value as Partial<SubtitleCue>;
  return typeof cue.startMs === 'number'
    && typeof cue.endMs === 'number'
    && cue.endMs > cue.startMs
    && typeof cue.text === 'string'
    && cue.text.trim().length > 0;
}

function ttsAssetSubtitleText(asset: MediaAsset): string | null {
  if (!asset.generationParamsJson) return null;
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as { subtitleText?: unknown };
    return typeof metadata.subtitleText === 'string' && metadata.subtitleText.trim()
      ? metadata.subtitleText
      : null;
  } catch {
    return null;
  }
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
  for (const path of asset ? sidecarMediaPaths(asset) : []) {
    await commands.deleteMediaFile({ path });
  }
  await storage.mediaAssets.delete(assetId);
}

function sidecarMediaPaths(asset: MediaAsset): string[] {
  if (!asset.generationParamsJson) return [];
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as { subtitlePath?: unknown };
    return typeof metadata.subtitlePath === 'string' && metadata.subtitlePath ? [metadata.subtitlePath] : [];
  } catch {
    return [];
  }
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

function hashNarration(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
