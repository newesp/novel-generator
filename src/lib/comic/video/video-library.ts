import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';

export type ComicVideoLibraryItemKind = 'chapter' | 'panel' | 'subtitle';
export type ComicVideoLibraryItemStatus = 'ready' | 'missing';

export interface ComicVideoLibraryItem {
  id: string;
  kind: ComicVideoLibraryItemKind;
  label: string;
  status: ComicVideoLibraryItemStatus;
  assetId?: string;
  path?: string;
  createdAt?: number;
  panelId?: string;
  panelOrder?: number;
}

export function buildComicVideoLibrary({
  comic,
  panels,
  assets,
  locale = 'zh-TW',
}: {
  comic: ChapterComic | null;
  panels: ComicPanel[];
  assets: MediaAsset[];
  locale?: 'zh-TW' | 'en';
}): ComicVideoLibraryItem[] {
  if (!comic) return [];
  const assetById = new Map(
    assets
      .filter((asset) => asset.kind === 'video' || asset.kind === 'subtitle')
      .map((asset) => [asset.id, asset]),
  );
  const items: ComicVideoLibraryItem[] = [];

  if (comic.videoAssetId) {
    items.push(videoItem({
      id: `chapter:${comic.id}`,
      kind: 'chapter',
      label: locale === 'en' ? 'Chapter MP4' : '整章 MP4',
      assetId: comic.videoAssetId,
      asset: assetById.get(comic.videoAssetId),
    }));
  }

  if (comic.subtitleAssetId) {
    items.push(videoItem({
      id: `subtitle:${comic.id}`,
      kind: 'subtitle',
      label: locale === 'en' ? 'Chapter Subtitles SRT' : '整章字幕 SRT',
      assetId: comic.subtitleAssetId,
      asset: assetById.get(comic.subtitleAssetId),
    }));
  }

  for (const panel of [...panels].sort((a, b) => a.order - b.order)) {
    if (!panel.segmentAssetId) continue;
    items.push(videoItem({
      id: `panel:${panel.id}`,
      kind: 'panel',
      label: `#${panel.order} ${panel.beat}`.trim(),
      assetId: panel.segmentAssetId,
      asset: assetById.get(panel.segmentAssetId),
      panel,
    }));
  }

  return items;
}

function videoItem({
  id,
  kind,
  label,
  assetId,
  asset,
  panel,
}: {
  id: string;
  kind: ComicVideoLibraryItemKind;
  label: string;
  assetId: string;
  asset?: MediaAsset;
  panel?: ComicPanel;
}): ComicVideoLibraryItem {
  return {
    id,
    kind,
    label,
    status: asset?.path ? 'ready' : 'missing',
    assetId,
    path: asset?.path,
    createdAt: asset?.createdAt,
    panelId: panel?.id,
    panelOrder: panel?.order,
  };
}
