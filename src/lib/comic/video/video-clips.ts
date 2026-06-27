import type {
  ComicPanel,
  ComicPanelVideoClipAudioMode,
  ComicPanelVideoClipLoopMode,
  MediaAsset,
} from '../../../types';

export interface PanelVideoClipMetadata {
  source: 'manual_upload';
  fileName: string;
  panelId: string;
  order: number;
  durationMs?: number;
  hasAudio?: boolean;
}

export function panelVideoClipAssetIds(panel: ComicPanel): string[] {
  return (panel.videoClipAssetIds ?? []).filter(Boolean);
}

export function panelHasVideoClips(panel: ComicPanel): boolean {
  return panelVideoClipAssetIds(panel).length > 0;
}

export function panelHasVisualSource(panel: ComicPanel): boolean {
  return Boolean(panel.assetId) || panelHasVideoClips(panel);
}

export function normalizePanelVideoClipAudioMode(
  value: unknown,
): ComicPanelVideoClipAudioMode {
  return value === 'keep' ? 'keep' : 'mute';
}

export function normalizePanelVideoClipAudioVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(200, Math.max(0, Math.round(value)))
    : 100;
}

export function normalizePanelVideoClipLoopMode(
  value: unknown,
): ComicPanelVideoClipLoopMode {
  return value === 'loop' ? 'loop' : 'freeze';
}

export function buildPanelVideoClipMetadata({
  fileName,
  panelId,
  order,
  durationMs,
  hasAudio,
}: {
  fileName: string;
  panelId: string;
  order: number;
  durationMs?: number;
  hasAudio?: boolean;
}): string {
  const metadata: PanelVideoClipMetadata = {
    source: 'manual_upload',
    fileName,
    panelId,
    order,
    durationMs,
    hasAudio,
  };
  return JSON.stringify(metadata);
}

export function panelVideoClipDurationMs(asset: MediaAsset | undefined): number {
  if (!asset?.generationParamsJson) return 0;
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as Partial<PanelVideoClipMetadata>;
    return typeof metadata.durationMs === 'number' && Number.isFinite(metadata.durationMs)
      ? Math.max(0, metadata.durationMs)
      : 0;
  } catch {
    return 0;
  }
}

export function panelVideoClipHasAudio(asset: MediaAsset | undefined): boolean {
  if (!asset?.generationParamsJson) return false;
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as Partial<PanelVideoClipMetadata>;
    return metadata.hasAudio === true;
  } catch {
    return false;
  }
}

export function panelVideoClipFileName(asset: MediaAsset | undefined): string {
  if (!asset?.generationParamsJson) return asset?.path ?? 'clip.mp4';
  try {
    const metadata = JSON.parse(asset.generationParamsJson) as Partial<PanelVideoClipMetadata>;
    return typeof metadata.fileName === 'string' && metadata.fileName.trim()
      ? metadata.fileName
      : asset.path ?? 'clip.mp4';
  } catch {
    return asset.path ?? 'clip.mp4';
  }
}
