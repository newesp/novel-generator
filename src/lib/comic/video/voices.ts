export interface ComicVideoVoice {
  id: string;
  label: string;
}

export interface ComicVideoVoiceGroup {
  label: string;
  voices: ComicVideoVoice[];
}

export const COMIC_VIDEO_VOICE_GROUPS: ComicVideoVoiceGroup[] = [
  {
    label: '台灣普通話',
    voices: [
      { id: 'zh-TW-HsiaoChenNeural', label: 'zh-TW-HsiaoChenNeural' },
      { id: 'zh-TW-HsiaoYuNeural', label: 'zh-TW-HsiaoYuNeural' },
      { id: 'zh-TW-YunJheNeural', label: 'zh-TW-YunJheNeural' },
    ],
  },
  {
    label: '中國普通話',
    voices: [
      { id: 'zh-CN-XiaochenMultilingualNeural', label: 'zh-CN-XiaochenMultilingualNeural' },
      { id: 'zh-CN-XiaochenNeural', label: 'zh-CN-XiaochenNeural' },
      { id: 'zh-CN-XiaohanNeural', label: 'zh-CN-XiaohanNeural' },
      { id: 'zh-CN-XiaomengNeural', label: 'zh-CN-XiaomengNeural' },
      { id: 'zh-CN-XiaomoNeural', label: 'zh-CN-XiaomoNeural' },
      { id: 'zh-CN-XiaoqiuNeural', label: 'zh-CN-XiaoqiuNeural' },
      { id: 'zh-CN-XiaorouNeural', label: 'zh-CN-XiaorouNeural' },
      { id: 'zh-CN-XiaoruiNeural', label: 'zh-CN-XiaoruiNeural' },
      { id: 'zh-CN-XiaoshuangMultilingualNeural', label: 'zh-CN-XiaoshuangMultilingualNeural' },
      { id: 'zh-CN-XiaoshuangNeural', label: 'zh-CN-XiaoshuangNeural' },
      { id: 'zh-CN-XiaoxiaoDialectsNeural', label: 'zh-CN-XiaoxiaoDialectsNeural' },
      { id: 'zh-CN-XiaoxiaoMultilingualNeural', label: 'zh-CN-XiaoxiaoMultilingualNeural' },
      { id: 'zh-CN-XiaoxiaoNeural', label: 'zh-CN-XiaoxiaoNeural' },
      { id: 'zh-CN-XiaoyanNeural', label: 'zh-CN-XiaoyanNeural' },
      { id: 'zh-CN-XiaoyiNeural', label: 'zh-CN-XiaoyiNeural' },
      { id: 'zh-CN-XiaoyouMultilingualNeural', label: 'zh-CN-XiaoyouMultilingualNeural' },
      { id: 'zh-CN-XiaoyouNeural', label: 'zh-CN-XiaoyouNeural' },
      { id: 'zh-CN-XiaoyuMultilingualNeural', label: 'zh-CN-XiaoyuMultilingualNeural' },
      { id: 'zh-CN-XiaozhenNeural', label: 'zh-CN-XiaozhenNeural' },
      { id: 'zh-CN-YunfanMultilingualNeural', label: 'zh-CN-YunfanMultilingualNeural' },
      { id: 'zh-CN-YunfengNeural', label: 'zh-CN-YunfengNeural' },
      { id: 'zh-CN-YunhaoNeural', label: 'zh-CN-YunhaoNeural' },
      { id: 'zh-CN-YunjianNeural', label: 'zh-CN-YunjianNeural' },
      { id: 'zh-CN-YunjieNeural', label: 'zh-CN-YunjieNeural' },
      { id: 'zh-CN-YunxiaNeural', label: 'zh-CN-YunxiaNeural' },
      { id: 'zh-CN-YunxiaoMultilingualNeural', label: 'zh-CN-YunxiaoMultilingualNeural' },
      { id: 'zh-CN-YunxiNeural', label: 'zh-CN-YunxiNeural' },
      { id: 'zh-CN-YunyeNeural', label: 'zh-CN-YunyeNeural' },
      { id: 'zh-CN-YunyiMultilingualNeural', label: 'zh-CN-YunyiMultilingualNeural' },
      { id: 'zh-CN-YunyangNeural', label: 'zh-CN-YunyangNeural' },
      { id: 'zh-CN-YunzeNeural', label: 'zh-CN-YunzeNeural' },
    ],
  },
  {
    label: '中國地方普通話',
    voices: [
      { id: 'zh-CN-guangxi-YunqiNeural', label: 'zh-CN-guangxi-YunqiNeural' },
      { id: 'zh-CN-henan-YundengNeural', label: 'zh-CN-henan-YundengNeural' },
      { id: 'zh-CN-liaoning-XiaobeiNeural', label: 'zh-CN-liaoning-XiaobeiNeural' },
      { id: 'zh-CN-liaoning-YunbiaoNeural', label: 'zh-CN-liaoning-YunbiaoNeural' },
      { id: 'zh-CN-shaanxi-XiaoniNeural', label: 'zh-CN-shaanxi-XiaoniNeural' },
      { id: 'zh-CN-shandong-YunxiangNeural', label: 'zh-CN-shandong-YunxiangNeural' },
      { id: 'zh-CN-sichuan-YunxiNeural', label: 'zh-CN-sichuan-YunxiNeural' },
    ],
  },
];

export const COMIC_VIDEO_VOICES: ComicVideoVoice[] = COMIC_VIDEO_VOICE_GROUPS.flatMap(
  (group) => group.voices,
);
