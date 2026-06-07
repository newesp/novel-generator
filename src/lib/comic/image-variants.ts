import type { ComicPanel, ComicPanelImageVariant, MediaAsset } from '../../types';

interface BuildReadyImageVariantInput {
  id: string;
  projectId: string;
  chapterId: string;
  panel: ComicPanel;
  asset: MediaAsset;
  referenceAssetIds: string[];
  referenceImageLabels: string[];
  createdAt: number;
}

export function buildReadyImageVariant({
  id,
  projectId,
  chapterId,
  panel,
  asset,
  referenceAssetIds,
  referenceImageLabels,
  createdAt,
}: BuildReadyImageVariantInput): ComicPanelImageVariant {
  return {
    id,
    projectId,
    chapterId,
    comicId: panel.comicId,
    panelId: panel.id,
    assetId: asset.id,
    status: 'ready',
    providerId: asset.providerId ?? '',
    promptSnapshot: panel.finalPromptSnapshot ?? panel.visualPrompt,
    negativePromptSnapshot: panel.finalNegativePromptSnapshot ?? panel.negativePrompt,
    referenceAssetIds,
    referenceImageLabels,
    seed: panel.seed,
    generationParamsJson: asset.generationParamsJson,
    createdAt,
  };
}

export function canDeleteImageVariant({
  panelAssetId,
  variantAssetId,
}: {
  panelAssetId?: string;
  variantAssetId?: string;
}): boolean {
  return Boolean(variantAssetId && variantAssetId !== panelAssetId);
}
