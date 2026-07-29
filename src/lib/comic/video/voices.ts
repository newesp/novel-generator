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
    label: '台灣華語',
    voices: [
      { id: 'zh-TW-HsiaoChenNeural', label: 'zh-TW-HsiaoChenNeural' },
      { id: 'zh-TW-HsiaoYuNeural', label: 'zh-TW-HsiaoYuNeural' },
      { id: 'zh-TW-YunJheNeural', label: 'zh-TW-YunJheNeural' },
    ],
  },
  {
    label: '中國普通話',
    voices: [
      { id: 'zh-CN-XiaoxiaoNeural', label: 'zh-CN-XiaoxiaoNeural' },
      { id: 'zh-CN-XiaoyiNeural', label: 'zh-CN-XiaoyiNeural' },
      { id: 'zh-CN-YunjianNeural', label: 'zh-CN-YunjianNeural' },
      { id: 'zh-CN-YunxiaNeural', label: 'zh-CN-YunxiaNeural' },
      { id: 'zh-CN-YunxiNeural', label: 'zh-CN-YunxiNeural' },
      { id: 'zh-CN-YunyangNeural', label: 'zh-CN-YunyangNeural' },
    ],
  },
  {
    label: '中國方言',
    voices: [
      { id: 'zh-CN-liaoning-XiaobeiNeural', label: 'zh-CN-liaoning-XiaobeiNeural' },
      { id: 'zh-CN-shaanxi-XiaoniNeural', label: 'zh-CN-shaanxi-XiaoniNeural' },
    ],
  },
  {
    label: '香港粵語',
    voices: [
      { id: 'zh-HK-HiuGaaiNeural', label: 'zh-HK-HiuGaaiNeural' },
      { id: 'zh-HK-HiuMaanNeural', label: 'zh-HK-HiuMaanNeural' },
      { id: 'zh-HK-WanLungNeural', label: 'zh-HK-WanLungNeural' },
    ],
  },
  {
    label: 'English (US)',
    voices: [
      { id: 'en-US-AriaNeural', label: 'en-US-AriaNeural' },
      { id: 'en-US-GuyNeural', label: 'en-US-GuyNeural' },
      { id: 'en-US-JennyNeural', label: 'en-US-JennyNeural' },
      { id: 'en-US-ChristopherNeural', label: 'en-US-ChristopherNeural' },
      { id: 'en-US-EricNeural', label: 'en-US-EricNeural' },
      { id: 'en-US-MichelleNeural', label: 'en-US-MichelleNeural' },
    ],
  },
];

export const COMIC_VIDEO_VOICES: ComicVideoVoice[] = COMIC_VIDEO_VOICE_GROUPS.flatMap(
  (group) => group.voices,
);
