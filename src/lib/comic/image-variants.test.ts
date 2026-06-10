import { describe, expect, it } from 'vitest';
import type { ComicPanel, MediaAsset } from '../../types';
import { buildReadyImageVariant, buildLegacyCurrentImageVariant, canDeleteImageVariant } from './image-variants';

const panel: ComicPanel = {
  id: 'panel-1',
  comicId: 'comic-1',
  order: 1,
  beat: 'beat',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: 'raw prompt',
  negativePrompt: 'raw negative',
  finalPromptSnapshot: 'final prompt',
  finalNegativePromptSnapshot: 'final negative',
  dialogue: '',
  narration: '',
  durationSec: 4,
  seed: 42,
  status: 'ready',
  createdAt: 1,
  updatedAt: 2,
};

const asset: MediaAsset = {
  id: 'asset-1',
  projectId: 'project-1',
  chapterId: 'chapter-1',
  kind: 'comic_panel_image',
  url: 'data:image/png;base64,a',
  mimeType: 'image/png',
  providerId: 'deepinfra-flux',
  generationParamsJson: '{"model":"flux"}',
  createdAt: 3,
};

describe('comic image variants', () => {
  it('builds a ready variant from a generated panel image', () => {
    expect(buildReadyImageVariant({
      id: 'variant-1',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      panel,
      asset,
      referenceAssetIds: ['ref-1'],
      referenceImageLabels: ['image 1 = ref'],
      createdAt: 4,
    })).toEqual({
      id: 'variant-1',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      comicId: 'comic-1',
      panelId: 'panel-1',
      assetId: 'asset-1',
      status: 'ready',
      providerId: 'deepinfra-flux',
      promptSnapshot: 'final prompt',
      negativePromptSnapshot: 'final negative',
      referenceAssetIds: ['ref-1'],
      referenceImageLabels: ['image 1 = ref'],
      seed: 42,
      generationParamsJson: '{"model":"flux"}',
      createdAt: 4,
    });
  });

  it('blocks deleting the current selected panel image variant', () => {
    expect(canDeleteImageVariant({ panelAssetId: 'asset-1', variantAssetId: 'asset-1' })).toBe(false);
    expect(canDeleteImageVariant({ panelAssetId: 'asset-current', variantAssetId: 'asset-old' })).toBe(true);
  });

  it('builds a legacy current-image variant for panels that predate history rows', () => {
    expect(buildLegacyCurrentImageVariant({
      id: 'variant-legacy',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      panel,
      asset,
      createdAt: 5,
    })).toEqual({
      id: 'variant-legacy',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      comicId: 'comic-1',
      panelId: 'panel-1',
      assetId: 'asset-1',
      status: 'ready',
      providerId: 'deepinfra-flux',
      promptSnapshot: 'final prompt',
      negativePromptSnapshot: 'final negative',
      referenceAssetIds: [],
      referenceImageLabels: ['current panel image imported from existing asset'],
      seed: 42,
      generationParamsJson: '{"model":"flux"}',
      createdAt: 5,
    });
  });
});
