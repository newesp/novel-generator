import type { ComicPanel } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import type { desktopComicVideoCommands } from './desktop-commands';

type Commands = Pick<typeof desktopComicVideoCommands, 'deleteMediaFile'>;
type CleanupStorage = {
  mediaAssets: Pick<StorageAdapter['mediaAssets'], 'delete' | 'get'>;
};

export async function cleanupPanelVideoArtifacts({
  panel,
  storage,
  commands,
}: {
  panel: ComicPanel;
  storage: CleanupStorage;
  commands: Commands;
}): Promise<void> {
  const assetIds = Array.from(
    new Set([
      panel.ttsAssetId,
      panel.segmentAssetId,
      ...(panel.videoClipAssetIds ?? []),
    ].filter((id): id is string => Boolean(id))),
  );

  for (const assetId of assetIds) {
    const asset = await storage.mediaAssets.get(assetId);
    if (asset?.path) {
      await commands.deleteMediaFile({ path: asset.path });
    }
    await storage.mediaAssets.delete(assetId);
  }
}
