import { describe, expect, it } from 'vitest';
import { COMIC_VIDEO_VOICE_GROUPS, COMIC_VIDEO_VOICES } from './voices';

describe('comic video voices', () => {
  it('includes Taiwan and China Mandarin Edge-TTS voices', () => {
    expect(COMIC_VIDEO_VOICE_GROUPS.map((group) => group.label)).toEqual([
      '台灣普通話',
      '中國普通話',
      '中國地方普通話',
    ]);

    expect(COMIC_VIDEO_VOICES.map((voice) => voice.id)).toEqual([
      'zh-TW-HsiaoChenNeural',
      'zh-TW-HsiaoYuNeural',
      'zh-TW-YunJheNeural',
      'zh-CN-XiaochenMultilingualNeural',
      'zh-CN-XiaochenNeural',
      'zh-CN-XiaohanNeural',
      'zh-CN-XiaomengNeural',
      'zh-CN-XiaomoNeural',
      'zh-CN-XiaoqiuNeural',
      'zh-CN-XiaorouNeural',
      'zh-CN-XiaoruiNeural',
      'zh-CN-XiaoshuangMultilingualNeural',
      'zh-CN-XiaoshuangNeural',
      'zh-CN-XiaoxiaoDialectsNeural',
      'zh-CN-XiaoxiaoMultilingualNeural',
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-XiaoyanNeural',
      'zh-CN-XiaoyiNeural',
      'zh-CN-XiaoyouMultilingualNeural',
      'zh-CN-XiaoyouNeural',
      'zh-CN-XiaoyuMultilingualNeural',
      'zh-CN-XiaozhenNeural',
      'zh-CN-YunfanMultilingualNeural',
      'zh-CN-YunfengNeural',
      'zh-CN-YunhaoNeural',
      'zh-CN-YunjianNeural',
      'zh-CN-YunjieNeural',
      'zh-CN-YunxiaNeural',
      'zh-CN-YunxiaoMultilingualNeural',
      'zh-CN-YunxiNeural',
      'zh-CN-YunyeNeural',
      'zh-CN-YunyiMultilingualNeural',
      'zh-CN-YunyangNeural',
      'zh-CN-YunzeNeural',
      'zh-CN-guangxi-YunqiNeural',
      'zh-CN-henan-YundengNeural',
      'zh-CN-liaoning-XiaobeiNeural',
      'zh-CN-liaoning-YunbiaoNeural',
      'zh-CN-shaanxi-XiaoniNeural',
      'zh-CN-shandong-YunxiangNeural',
      'zh-CN-sichuan-YunxiNeural',
    ]);
  });

  it('keeps the default voice available', () => {
    expect(COMIC_VIDEO_VOICES.some((voice) => voice.id === 'zh-TW-HsiaoChenNeural')).toBe(true);
  });
});
