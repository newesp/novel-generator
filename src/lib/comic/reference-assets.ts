import type { MediaAsset } from '../../types';

export interface ResolvedReferenceAssets {
  assets: MediaAsset[];
  warnings: string[];
}

export async function resolveReferenceAssets(
  ids: string[],
  getAsset: (id: string) => Promise<MediaAsset | undefined>,
): Promise<ResolvedReferenceAssets> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const loaded = await Promise.all(uniqueIds.map(async (id) => ({ id, asset: await getAsset(id) })));
  const assets: MediaAsset[] = [];
  const warnings: string[] = [];
  for (const item of loaded) {
    if (!item.asset) {
      warnings.push(`Reference asset ${item.id} was not found`);
      continue;
    }
    if (!item.asset.url && !item.asset.path) {
      warnings.push(`Reference asset ${item.id} has no usable image URL`);
      continue;
    }
    assets.push(item.asset);
  }
  return { assets, warnings };
}
