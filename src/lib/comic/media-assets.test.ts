import { describe, expect, it } from 'vitest';
import type { ComicPanel, MediaAsset } from '../../types';
import { mapPanelAssets } from './media-assets';

const panel = (id: string, assetId?: string): ComicPanel => ({
  id,
  comicId: 'comic-1',
  order: 1,
  beat: 'beat',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '',
  durationSec: 3,
  assetId,
  status: assetId ? 'ready' : 'draft',
  createdAt: 1,
  updatedAt: 1,
});

const asset = (id: string): MediaAsset => ({
  id,
  projectId: 'project-1',
  chapterId: 'chapter-1',
  kind: 'comic_panel_image',
  url: `data:image/png;base64,${id}`,
  mimeType: 'image/png',
  createdAt: 1,
});

describe('mapPanelAssets', () => {
  it('maps panels to their media asset by asset id', () => {
    const result = mapPanelAssets(
      [panel('panel-1', 'asset-1'), panel('panel-2'), panel('panel-3', 'missing')],
      [asset('asset-1'), asset('asset-2')],
    );

    expect(result).toEqual({
      'panel-1': asset('asset-1'),
    });
  });
});
