import type { ComicPanel, MediaAsset } from '../../types';

export function mapPanelAssets(panels: ComicPanel[], assets: MediaAsset[]): Record<string, MediaAsset> {
  const byAssetId = new Map(assets.map((asset) => [asset.id, asset]));
  return panels.reduce<Record<string, MediaAsset>>((acc, panel) => {
    if (!panel.assetId) return acc;
    const asset = byAssetId.get(panel.assetId);
    if (asset) acc[panel.id] = asset;
    return acc;
  }, {});
}
