import type { MediaAsset } from '../../types';

interface ReferenceSource {
  referenceAssetIds?: string[];
}

export function firstReferenceAssetId(source: ReferenceSource): string | undefined {
  return source.referenceAssetIds?.find(Boolean);
}

export function mapReferenceThumbnails(assets: MediaAsset[]): Record<string, string> {
  return assets.reduce<Record<string, string>>((acc, asset) => {
    if (asset.url) acc[asset.id] = asset.url;
    return acc;
  }, {});
}
