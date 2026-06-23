import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';

type VideoStateStorage = {
  comics: Pick<StorageAdapter['comics'], 'get'>;
  comicPanels: Pick<StorageAdapter['comicPanels'], 'listByComic'>;
  mediaAssets: Pick<StorageAdapter['mediaAssets'], 'get'>;
};
type VideoStateCommands = {
  resolveMediaRoot: (args: { projectId: string; chapterId: string }) => Promise<string>;
  mediaFileExists: (args: { path: string }) => Promise<boolean>;
};

export interface ComicVideoState {
  comic: ChapterComic | null;
  panels: ComicPanel[];
  assets: Record<string, MediaAsset>;
}

export async function loadComicVideoState({
  comicId,
  storage,
  commands,
}: {
  comicId: string;
  storage: VideoStateStorage;
  commands?: VideoStateCommands;
}): Promise<ComicVideoState> {
  const comic = await storage.comics.get(comicId);
  if (!comic) {
    return { comic: null, panels: [], assets: {} };
  }

  const panels = await storage.comicPanels.listByComic(comic.id);
  const assetIds = Array.from(new Set([
    comic.videoAssetId,
    comic.subtitleAssetId,
    ...panels.map((panel) => panel.segmentAssetId),
  ].filter((id): id is string => Boolean(id))));
  const assets = await Promise.all(assetIds.map((id) => storage.mediaAssets.get(id)));
  const assetRecords = assets
    .filter((asset): asset is MediaAsset => Boolean(asset))
    .reduce<Record<string, MediaAsset>>((acc, asset) => {
      acc[asset.id] = asset;
      return acc;
    }, {});
  await recoverMissingPanelSegmentAssets({ comic, panels, assets: assetRecords, commands });

  return {
    comic,
    panels,
    assets: assetRecords,
  };
}

async function recoverMissingPanelSegmentAssets({
  comic,
  panels,
  assets,
  commands,
}: {
  comic: ChapterComic;
  panels: ComicPanel[];
  assets: Record<string, MediaAsset>;
  commands?: VideoStateCommands;
}) {
  if (!commands) return;
  const panelsWithMissingSegmentAssets = panels.filter((panel) => (
    panel.segmentAssetId && !assets[panel.segmentAssetId]
  ));
  if (!panelsWithMissingSegmentAssets.length) return;

  let mediaRoot: string;
  try {
    mediaRoot = await commands.resolveMediaRoot({ projectId: comic.projectId, chapterId: comic.chapterId });
  } catch {
    return;
  }

  await Promise.all(panelsWithMissingSegmentAssets.map(async (panel) => {
    if (!panel.segmentAssetId) return;
    const path = `${mediaRoot}/segments/segment-${String(panel.order).padStart(3, '0')}.mp4`;
    let exists = false;
    try {
      exists = await commands.mediaFileExists({ path });
    } catch {
      exists = false;
    }
    if (!exists) return;
    assets[panel.segmentAssetId] = {
      id: panel.segmentAssetId,
      projectId: comic.projectId,
      chapterId: comic.chapterId,
      kind: 'video',
      path,
      mimeType: 'video/mp4',
      providerId: 'ffmpeg',
      generationParamsJson: JSON.stringify({
        panelId: panel.id,
        recoveredFromSegmentPath: true,
      }),
      createdAt: panel.updatedAt,
    };
  }));
}
