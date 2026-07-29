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

interface BuildLegacyCurrentImageVariantInput {
  id: string;
  projectId: string;
  chapterId: string;
  panel: ComicPanel;
  asset: MediaAsset;
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

export function buildLegacyCurrentImageVariant({
  id,
  projectId,
  chapterId,
  panel,
  asset,
  createdAt,
}: BuildLegacyCurrentImageVariantInput): ComicPanelImageVariant {
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
    referenceAssetIds: [],
    referenceImageLabels: ['current panel image imported from existing asset'],
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

export function currentVariantDeleteBlockedMessage(locale: 'zh-TW' | 'en' = 'zh-TW'): string {
  return locale === 'en'
    ? 'The current image cannot be deleted. Select another image from history first.'
    : '目前採用圖不能直接刪除；請先選另一張歷史圖。';
}
