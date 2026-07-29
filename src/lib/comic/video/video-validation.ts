import type { ComicPanel, Project } from '../../../types';
import { panelHasVisualSource } from './video-clips';
import { t } from '../../language-policy';
import type { InterfaceLocale } from '../../language-policy';

export type ComicVideoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateComicVideoInputs(panels: ComicPanel[], options?: {
  voiceId?: string;
  writingLanguage?: Project['writingLanguage'];
  locale?: InterfaceLocale;
}): ComicVideoValidationResult {
  const orderedPanels = [...panels].sort((a, b) => a.order - b.order);
  const missingImages = orderedPanels.filter((panel) => !panelHasVisualSource(panel));
  if (missingImages.length) {
    return {
      ok: false,
      message: options?.locale ? t('video.validationMissingImages', { panels: panelList(missingImages, options.locale) }, options.locale) : `無法整章輸出 MP4：${panelList(missingImages)} 尚未建立圖片。請先產生圖片或刪除不需要的分鏡。`,
    };
  }

  const missingNarration = orderedPanels.filter((panel) => !panel.narration.trim());
  if (missingNarration.length) {
    return {
      ok: false,
      message: options?.locale ? t('video.validationMissingNarration', { panels: panelList(missingNarration, options.locale) }, options.locale) : `無法整章輸出 MP4：${panelList(missingNarration)} 尚未填寫旁白。`,
    };
  }

  if (options?.voiceId && options?.writingLanguage) {
    const isEnVoice = options.voiceId.startsWith('en-');
    const isZhVoice = options.voiceId.startsWith('zh-');

    if (options.writingLanguage === 'en' && !isEnVoice) {
      return {
        ok: false,
        message: options.locale ? t('video.validationVoiceMismatch', { writingLanguage: 'English', voiceId: options.voiceId }, options.locale) : `TTS 音色與創作語言不符：英文小說請選擇 en-US 音色。`,
      };
    } else if (options.writingLanguage === 'zh-Hant' && !isZhVoice) {
      return {
        ok: false,
        message: options.locale ? t('video.validationVoiceMismatch', { writingLanguage: '繁體中文', voiceId: options.voiceId }, options.locale) : `TTS 音色與創作語言不符：中文小說請選擇 zh-TW 等中文音色。`,
      };
    }
  }

  return { ok: true };
}

function panelList(panels: ComicPanel[], locale?: InterfaceLocale): string {
  if (locale === 'en') {
    return `Panels ${panels.map((panel) => `#${panel.order}`).join(', ')}`;
  }
  return `分鏡 ${panels.map((panel) => `#${panel.order}`).join('、')}`;
}
