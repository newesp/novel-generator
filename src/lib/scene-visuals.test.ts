import { describe, expect, it } from 'vitest';
import { createDefaultSceneVisual, filterSceneVisuals, removeSceneReferenceAssetId, slugifySceneTitle } from './scene-visuals';

describe('scene visuals', () => {
  it('creates a reusable project-level scene visual', () => {
    expect(createDefaultSceneVisual({
      id: 'scene-1',
      projectId: 'project-1',
      title: 'Afei room',
      prompt: 'cramped wooden room',
      now: 123,
    })).toMatchObject({
      id: 'scene-1',
      projectId: 'project-1',
      slug: 'afei-room',
      title: 'Afei room',
      prompt: 'cramped wooden room',
      negativePrompt: '',
      referenceAssetIds: [],
      createdAt: 123,
      updatedAt: 123,
    });
  });

  it('uses a deterministic fallback slug for non-ascii titles', () => {
    expect(slugifySceneTitle('阿飛的房間')).not.toBe('');
    expect(slugifySceneTitle('阿飛的房間')).toBe(slugifySceneTitle('阿飛的房間'));
  });

  it('filters scene visuals by visible and prompt fields', () => {
    const scenes = [
      createDefaultSceneVisual({
        id: 'scene-1',
        projectId: 'project-1',
        title: '阿飛的狹窄艙室',
        prompt: 'warm workshop',
        now: 1,
      }),
      createDefaultSceneVisual({
        id: 'scene-2',
        projectId: 'project-1',
        title: '星塵市底層區域',
        prompt: 'metal corridor',
        negativePrompt: 'clean lab',
        now: 1,
      }),
    ];

    expect(filterSceneVisuals(scenes, '阿飛').map((scene) => scene.id)).toEqual(['scene-1']);
    expect(filterSceneVisuals(scenes, 'clean').map((scene) => scene.id)).toEqual(['scene-2']);
    expect(filterSceneVisuals(scenes, '').map((scene) => scene.id)).toEqual(['scene-1', 'scene-2']);
  });

  it('removes one reference asset id while preserving the remaining order', () => {
    expect(removeSceneReferenceAssetId(['asset-1', 'asset-2', 'asset-3'], 'asset-2')).toEqual(['asset-1', 'asset-3']);
    expect(removeSceneReferenceAssetId(['asset-1', 'asset-2'], 'asset-missing')).toEqual(['asset-1', 'asset-2']);
  });
});
