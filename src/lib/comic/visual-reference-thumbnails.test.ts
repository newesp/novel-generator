import { describe, expect, it } from 'vitest';
import type { Character, MediaAsset, SceneVisual } from '../../types';
import { firstReferenceAssetId, mapReferenceThumbnails } from './visual-reference-thumbnails';

const asset = (id: string, url?: string): MediaAsset => ({
  id,
  projectId: 'project-1',
  kind: 'character_reference_image',
  url,
  mimeType: 'image/png',
  createdAt: 1,
});

describe('visual reference thumbnails', () => {
  it('uses the first reference asset id as the thumbnail source', () => {
    const character = { referenceAssetIds: ['asset-1', 'asset-2'] } as Character;
    const scene = { referenceAssetIds: ['scene-1'] } as SceneVisual;

    expect(firstReferenceAssetId(character)).toBe('asset-1');
    expect(firstReferenceAssetId(scene)).toBe('scene-1');
  });

  it('maps usable media assets to thumbnail urls', () => {
    expect(mapReferenceThumbnails([asset('asset-1', 'data:image/png;base64,a'), asset('asset-2')])).toEqual({
      'asset-1': 'data:image/png;base64,a',
    });
  });
});
