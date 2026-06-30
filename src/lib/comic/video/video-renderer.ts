import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import { buildConcatList } from './concat-list';
import type { desktopComicVideoCommands } from './desktop-commands';
import { buildOffsetSrt, parseSrt, type OffsetSubtitleCueGroup, type SubtitleCue } from './subtitles';
import { calculatePanelTiming } from './timing';
import type { TTSGenerationResult, TTSProvider } from './tts-provider';
import { normalizeComicPanelMotionEffect } from './motion-effects';
import {
  normalizePanelVideoClipAudioMode,
  normalizePanelVideoClipAudioVolume,
  normalizePanelVideoClipLoopMode,
  panelHasVideoClips,
  panelVideoClipAssetIds,
  panelVideoClipDurationMs,
  panelVideoClipHasAudio,
} from './video-clips';

type Commands = Pick<
  typeof desktopComicVideoCommands,
  'concatVideo' | 'deleteMediaFile' | 'renderSegment' | 'writeBinaryFile'
> & Partial<Pick<typeof desktopComicVideoCommands, 'mediaFileExists' | 'renderVideoClipSegment'>>;
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
  forceRender?: boolean;
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
    if (!panel.assetId && !panelHasVideoClips(panel)) throw new Error(`Panel #${panel.order} has no visual asset.`);
    if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

    const reusableSegment = await findReusableSegment(panel, storage, commands, settings);
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

  const videoClipIds = panelVideoClipAssetIds(panel);
  if (!panel.assetId && !videoClipIds.length) throw new Error(`Panel #${panel.order} has no visual asset.`);
  if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

  const reusableSegment = input.forceRender ? null : await findReusableSegment(panel, storage, commands, settings);
  if (reusableSegment) return reusableSegment;

  const paddedOrder = String(panel.order).padStart(3, '0');
  const imageAsset = panel.assetId ? await storage.mediaAssets.get(panel.assetId) : undefined;
  const videoClipAssets = videoClipIds.length
    ? await resolvePanelVideoClipAssets(panel, storage)
    : [];
  const imagePath = videoClipAssets.length ? null : await resolvePanelImagePath({
      panel,
      asset: imageAsset,
      outputPath: `${settings.mediaRoot}/images/panel-${paddedOrder}.${imageExtension(imageAsset?.mimeType)}`,
      commands,
    });

  await deleteAssetFileAndRecord(panel.segmentAssetId, storage, commands);

  const reusableTts = await findReusableTts(panel, storage, commands, settings);
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
  const motionEffect = normalizeComicPanelMotionEffect(panel.motionEffect);
  const videoClipAudioMode = normalizePanelVideoClipAudioMode(panel.videoClipAudioMode);
  const videoClipAudioVolume = normalizePanelVideoClipAudioVolume(panel.videoClipAudioVolume);
  const videoClipLoopMode = normalizePanelVideoClipLoopMode(panel.videoClipLoopMode);
  const visualDurationMs = videoClipAssets.reduce((total, item) => total + item.durationMs, 0);
  const canPreserveClipAudio = videoClipAssets.length > 0 && videoClipAssets.every((item) => item.hasAudio);
  const effectiveVideoClipAudioMode = videoClipAudioMode === 'keep' && canPreserveClipAudio ? 'keep' : 'mute';
  const effectiveDurationMs = videoClipAssets.length
    ? Math.max(timing.effectiveDurationMs, visualDurationMs + settings.panelPauseMs)
    : timing.effectiveDurationMs;
  const trailingSilenceMs = Math.max(0, effectiveDurationMs - timing.audioDurationMs);
  const segmentPath = `${settings.mediaRoot}/segments/segment-${paddedOrder}.mp4`;
  const audioPath = tts.asset.path ?? `${settings.mediaRoot}/audio/panel-${paddedOrder}.mp3`;
  if (videoClipAssets.length) {
    if (!commands.renderVideoClipSegment) {
      throw new Error('Desktop video clip renderer is unavailable.');
    }
    await commands.renderVideoClipSegment({
      ffmpegBin: settings.ffmpegBin,
      videoClipPaths: videoClipAssets.map((item) => item.path),
      audioPath,
      outputPath: segmentPath,
      durationMs: effectiveDurationMs,
      trailingSilenceMs,
      visualDurationMs,
      preserveClipAudio: effectiveVideoClipAudioMode === 'keep',
      clipAudioVolume: videoClipAudioVolume / 100,
      loopVideo: videoClipLoopMode === 'loop',
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
    });
  } else if (imagePath) {
    await commands.renderSegment({
      ffmpegBin: settings.ffmpegBin,
      imagePath,
      audioPath,
      outputPath: segmentPath,
      durationMs: effectiveDurationMs,
      trailingSilenceMs,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      motionEffect,
    });
  }

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
      visualSource: videoClipAssets.length ? 'video_clips' : 'image',
      sourceImageAssetId: panel.assetId,
      sourceVideoClipAssetIds: videoClipAssets.map((item) => item.id),
      sourceVideoClipDurationsMs: videoClipAssets.map((item) => item.durationMs),
      sourceVideoClipHasAudio: videoClipAssets.map((item) => item.hasAudio),
      ttsAssetId: tts.asset.id,
      ttsVoice: tts.voice,
      durationSec: panel.durationSec,
      panelPauseMs: settings.panelPauseMs,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      motionEffect,
      videoClipAudioMode,
      effectiveVideoClipAudioMode,
      videoClipAudioVolume,
      videoClipLoopMode,
      narrationHash: hashNarration(panel.narration),
      audioDurationMs: timing.audioDurationMs,
      visualDurationMs,
      durationMs: effectiveDurationMs,
      trailingSilenceMs,
      subtitleCues: ttsSubtitleCues(tts, panel, effectiveDurationMs),
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

async function findReusableTts(
  panel: ComicPanel,
  storage: VideoRendererStorage,
  commands: Commands,
  settings: ComicVideoSettings,
) {
  if (!panel.ttsAssetId || panel.ttsVoice !== settings.voice || !panel.ttsDurationMs) return null;
  const asset = await storage.mediaAssets.get(panel.ttsAssetId);
  if (!asset?.path) return null;
  if (!await mediaFileExists(asset.path, commands)) return null;
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
  commands: Commands,
  settings: ComicVideoSettings,
): Promise<MediaAsset | null> {
  if (!panel.segmentAssetId) return null;
  const asset = await storage.mediaAssets.get(panel.segmentAssetId);
  if (!asset?.path || !asset.generationParamsJson) return null;
  if (!await mediaFileExists(asset.path, commands)) return null;
  let metadata: Partial<SegmentMetadata>;
  try {
    metadata = JSON.parse(asset.generationParamsJson) as Partial<SegmentMetadata>;
  } catch {
    return null;
  }
  const expectedVisualSource = panelVisualSource(panel);
  const metadataVisualSource = metadata.visualSource ?? 'image';
  if (
    metadata.panelId !== panel.id ||
    metadataVisualSource !== expectedVisualSource ||
    (expectedVisualSource === 'image' && metadata.sourceImageAssetId !== panel.assetId) ||
    (expectedVisualSource === 'video_clips' && !await panelVideoClipMetadataMatches(panel, metadata, storage)) ||
    metadata.ttsVoice !== settings.voice ||
    metadata.durationSec !== panel.durationSec ||
    metadata.panelPauseMs !== settings.panelPauseMs ||
    metadata.width !== settings.width ||
    metadata.height !== settings.height ||
    metadata.fps !== settings.fps ||
    (expectedVisualSource === 'video_clips'
      && metadata.videoClipAudioMode !== normalizePanelVideoClipAudioMode(panel.videoClipAudioMode)) ||
    (expectedVisualSource === 'video_clips'
      && metadata.videoClipAudioVolume !== normalizePanelVideoClipAudioVolume(panel.videoClipAudioVolume)) ||
    (expectedVisualSource === 'video_clips'
      && metadata.videoClipLoopMode !== normalizePanelVideoClipLoopMode(panel.videoClipLoopMode)) ||
    (expectedVisualSource === 'image'
      && normalizeComicPanelMotionEffect(metadata.motionEffect) !== normalizeComicPanelMotionEffect(panel.motionEffect)) ||
    metadata.narrationHash !== hashNarration(panel.narration)
  ) {
    return null;
  }
  if (!Array.isArray(metadata.subtitleCues) || !metadata.subtitleCues.length) return null;
  return asset;
}

async function mediaFileExists(path: string, commands: Commands): Promise<boolean> {
  if (!commands.mediaFileExists) return true;
  try {
    return await commands.mediaFileExists({ path });
  } catch {
    return false;
  }
}

interface SegmentMetadata {
  panelId: string;
  visualSource?: 'image' | 'video_clips';
  sourceImageAssetId?: string;
  sourceVideoClipAssetIds?: string[];
  sourceVideoClipDurationsMs?: number[];
  sourceVideoClipHasAudio?: boolean[];
  ttsAssetId: string;
  ttsVoice: string;
  durationSec: number;
  panelPauseMs: number;
  width: number;
  height: number;
  fps: number;
  motionEffect?: string;
  videoClipAudioMode?: string;
  effectiveVideoClipAudioMode?: string;
  videoClipAudioVolume?: number;
  videoClipLoopMode?: string;
  narrationHash: string;
  visualDurationMs?: number;
  durationMs?: number;
  subtitleCues?: SubtitleCue[];
}

interface ResolvedPanelVideoClipAsset {
  id: string;
  path: string;
  durationMs: number;
  hasAudio: boolean;
}

async function resolvePanelVideoClipAssets(
  panel: ComicPanel,
  storage: VideoRendererStorage,
): Promise<ResolvedPanelVideoClipAsset[]> {
  const clips: ResolvedPanelVideoClipAsset[] = [];
  for (const assetId of panelVideoClipAssetIds(panel)) {
    const asset = await storage.mediaAssets.get(assetId);
    if (!asset?.path) throw new Error(`Panel #${panel.order} video clip has no file path.`);
    clips.push({
      id: asset.id,
      path: asset.path,
      durationMs: panelVideoClipDurationMs(asset),
      hasAudio: panelVideoClipHasAudio(asset),
    });
  }
  return clips;
}

function panelVisualSource(panel: ComicPanel): 'image' | 'video_clips' {
  return panelHasVideoClips(panel) ? 'video_clips' : 'image';
}

function sameStringArray(left: unknown, right: string[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

async function panelVideoClipMetadataMatches(
  panel: ComicPanel,
  metadata: Partial<SegmentMetadata>,
  storage: VideoRendererStorage,
): Promise<boolean> {
  const clipAssets = await resolvePanelVideoClipAssets(panel, storage);
  return sameStringArray(metadata.sourceVideoClipAssetIds, clipAssets.map((asset) => asset.id))
    && sameNumberArray(metadata.sourceVideoClipDurationsMs, clipAssets.map((asset) => asset.durationMs))
    && sameBooleanArray(metadata.sourceVideoClipHasAudio, clipAssets.map((asset) => asset.hasAudio));
}

function sameNumberArray(left: unknown, right: number[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => typeof value === 'number' && value === right[index]);
}

function sameBooleanArray(left: unknown, right: boolean[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => typeof value === 'boolean' && value === right[index]);
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
