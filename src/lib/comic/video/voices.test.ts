import { describe, expect, it } from 'vitest';
import { COMIC_VIDEO_VOICE_GROUPS, COMIC_VIDEO_VOICES } from './voices';

describe('comic video voices', () => {
  it('includes currently available Chinese Edge-TTS voices', () => {
    expect(COMIC_VIDEO_VOICE_GROUPS.map((group) => group.label)).toEqual([
      '台灣華語',
      '中國普通話',
      '中國方言',
      '香港粵語',
    ]);

    expect(COMIC_VIDEO_VOICES.map((voice) => voice.id)).toEqual([
      'zh-TW-HsiaoChenNeural',
      'zh-TW-HsiaoYuNeural',
      'zh-TW-YunJheNeural',
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-XiaoyiNeural',
      'zh-CN-YunjianNeural',
      'zh-CN-YunxiaNeural',
      'zh-CN-YunxiNeural',
      'zh-CN-YunyangNeural',
      'zh-CN-liaoning-XiaobeiNeural',
      'zh-CN-shaanxi-XiaoniNeural',
      'zh-HK-HiuGaaiNeural',
      'zh-HK-HiuMaanNeural',
      'zh-HK-WanLungNeural',
    ]);
  });

  it('keeps the default voice available', () => {
    expect(COMIC_VIDEO_VOICES.some((voice) => voice.id === 'zh-TW-HsiaoChenNeural')).toBe(true);
  });
});
