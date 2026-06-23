import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';

type VideoStateStorage = {
  comics: Pick<StorageAdapter['comics'], 'get'>;
  comicPanels: Pick<StorageAdapter['comicPanels'], 'listByComic'>;
  mediaAssets: Pick<StorageAdapter['mediaAssets'], 'get'>;
};

export interface ComicVideoState {
  comic: ChapterComic | null;
  panels: ComicPanel[];
  assets: Record<string, MediaAsset>;
}

export async function loadComicVideoState({
  comicId,
  storage,
}: {
  comicId: string;
  storage: VideoStateStorage;
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

  return {
    comic,
    panels,
    assets: assets
      .filter((asset): asset is MediaAsset => Boolean(asset))
      .reduce<Record<string, MediaAsset>>((acc, asset) => {
        acc[asset.id] = asset;
        return acc;
      }, {}),
  };
}
