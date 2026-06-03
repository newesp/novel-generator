import { describe, expect, it } from 'vitest';
import { createDefaultSceneVisual, slugifySceneTitle } from './scene-visuals';

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
});
