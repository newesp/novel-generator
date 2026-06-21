import { describe, expect, it } from 'vitest';
import type { ComicPanel } from '../../../types';
import { validateComicVideoInputs } from './video-validation';

const panel = (patch: Partial<ComicPanel>): ComicPanel => ({
  id: 'panel-1',
  comicId: 'comic-1',
  order: 1,
  beat: '',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '旁白',
  durationSec: 0,
  status: 'ready',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

describe('validateComicVideoInputs', () => {
  it('reports every panel missing an image before full chapter export', () => {
    expect(validateComicVideoInputs([
      panel({ id: 'panel-1', order: 1, assetId: 'image-1' }),
      panel({ id: 'panel-2', order: 2 }),
      panel({ id: 'panel-3', order: 3 }),
    ])).toEqual({
      ok: false,
      message: '無法整章輸出 MP4：分鏡 #2、#3 尚未建立圖片。請先產生圖片或刪除不需要的分鏡。',
    });
  });

  it('reports panels missing narration after all images are present', () => {
    expect(validateComicVideoInputs([
      panel({ id: 'panel-1', order: 1, assetId: 'image-1' }),
      panel({ id: 'panel-2', order: 2, assetId: 'image-2', narration: '' }),
    ])).toEqual({
      ok: false,
      message: '無法整章輸出 MP4：分鏡 #2 尚未填寫旁白。',
    });
  });
});
