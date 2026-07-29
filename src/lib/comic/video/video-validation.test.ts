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

  it('accepts uploaded MP4 clips as a visual source', () => {
    expect(validateComicVideoInputs([
      panel({ id: 'panel-1', order: 1, videoClipAssetIds: ['clip-1'] }),
    ])).toEqual({ ok: true });
  });

  it('rejects mismatching English voice for zh-Hant project', () => {
    expect(validateComicVideoInputs([
      panel({ id: 'panel-1', order: 1, assetId: 'image-1' }),
    ], { voiceId: 'en-US-AriaNeural', writingLanguage: 'zh-Hant', locale: 'zh-TW' })).toEqual({
      ok: false,
      message: 'TTS 音色與創作語言不符：繁體中文 小說請選擇對應的音色（目前選擇了 en-US-AriaNeural）。',
    });
  });

  it('rejects mismatching Chinese voice for en project', () => {
    expect(validateComicVideoInputs([
      panel({ id: 'panel-1', order: 1, assetId: 'image-1' }),
    ], { voiceId: 'zh-TW-HsiaoChenNeural', writingLanguage: 'en', locale: 'en' })).toEqual({
      ok: false,
      message: 'TTS voice and writing language mismatch: For English book, please select a matching voice (currently zh-TW-HsiaoChenNeural).',
    });
  });
});
