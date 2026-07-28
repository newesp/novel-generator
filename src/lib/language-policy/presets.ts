import type { InterfaceLocale, WritingLanguage } from './types';

export type GenreCode = 'xuanhuan' | 'urban' | 'xianxia' | 'scifi' | 'romance' | 'mystery';
export type StyleCode = 'lighthearted' | 'somber' | 'dark' | 'high_energy' | 'humorous' | 'wish_fulfillment';
export type BeatCode = 'inciting_incident' | 'rising_action' | 'midpoint' | 'climax' | 'resolution' | 'setup';

export interface PresetOption<T extends string> {
  code: T;
  labelZh: string;
  labelEn: string;
  aliases: string[];
}

export const GENRE_PRESETS: PresetOption<GenreCode>[] = [
  { code: 'xuanhuan', labelZh: '玄幻', labelEn: 'Xuanhuan (Eastern Fantasy)', aliases: ['玄幻', 'xuanhuan', 'xuanhuan (eastern fantasy)'] },
  { code: 'urban', labelZh: '都市', labelEn: 'Contemporary / Modern-Day', aliases: ['都市', 'urban', 'contemporary / modern-day', 'contemporary'] },
  { code: 'xianxia', labelZh: '仙俠', labelEn: 'Xianxia (Cultivation Fantasy)', aliases: ['仙俠', 'xianxia', 'xianxia (cultivation fantasy)'] },
  { code: 'scifi', labelZh: '科幻', labelEn: 'Science Fiction', aliases: ['科幻', 'scifi', 'science fiction'] },
  { code: 'romance', labelZh: '言情', labelEn: 'Romance', aliases: ['言情', 'romance'] },
  { code: 'mystery', labelZh: '懸疑', labelEn: 'Mystery / Suspense', aliases: ['懸疑', 'mystery', 'mystery / suspense'] },
];

export const STYLE_PRESETS: PresetOption<StyleCode>[] = [
  { code: 'lighthearted', labelZh: '輕鬆', labelEn: 'Lighthearted', aliases: ['輕鬆', 'lighthearted'] },
  { code: 'somber', labelZh: '沉重', labelEn: 'Somber', aliases: ['沉重', 'somber'] },
  { code: 'dark', labelZh: '黑暗', labelEn: 'Dark', aliases: ['黑暗', 'dark'] },
  { code: 'high_energy', labelZh: '熱血', labelEn: 'High-Energy', aliases: ['熱血', 'high_energy', 'high-energy', 'hot-blooded'] },
  { code: 'humorous', labelZh: '幽默', labelEn: 'Humorous', aliases: ['幽默', 'humorous'] },
  { code: 'wish_fulfillment', labelZh: '爽文', labelEn: 'Wish-Fulfillment', aliases: ['爽文', 'wish_fulfillment', 'wish-fulfillment'] },
];

export const BEAT_PRESETS: PresetOption<BeatCode>[] = [
  { code: 'inciting_incident', labelZh: '引入 (Inciting Incident)', labelEn: 'Inciting Incident', aliases: ['引入', '引入 (inciting incident)', 'inciting_incident', 'inciting incident'] },
  { code: 'rising_action', labelZh: '衝突升級 (Rising Action)', labelEn: 'Rising Action', aliases: ['衝突升級', '衝突升級 (rising action)', 'rising_action', 'rising action'] },
  { code: 'midpoint', labelZh: '中點轉折 (Midpoint Twist)', labelEn: 'Midpoint', aliases: ['中點轉折', '中點轉折 (midpoint twist)', 'midpoint', 'midpoint twist'] },
  { code: 'climax', labelZh: '高潮 (Climax)', labelEn: 'Climax', aliases: ['高潮', '高潮 (climax)', 'climax'] },
  { code: 'resolution', labelZh: '結局 (Resolution)', labelEn: 'Resolution', aliases: ['結局', '結局 (resolution)', 'resolution'] },
  { code: 'setup', labelZh: '鋪墊/過渡', labelEn: 'Setup / Transition', aliases: ['鋪墊/過渡', '鋪墊', '過渡', 'setup', 'setup / transition'] },
];

export function normalizeGenre(input?: string): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  for (const preset of GENRE_PRESETS) {
    if (preset.code === lower || preset.aliases.some((a) => a.toLowerCase() === lower)) {
      return preset.code;
    }
  }

  // Avoid saving "自定義" as preset value if entered verbatim
  if (trimmed === '自定義' || trimmed === 'Custom') {
    return '';
  }

  return trimmed; // Custom value preserved as-is
}

export function normalizeStyle(input?: string): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  for (const preset of STYLE_PRESETS) {
    if (preset.code === lower || preset.aliases.some((a) => a.toLowerCase() === lower)) {
      return preset.code;
    }
  }

  if (trimmed === '自定義' || trimmed === 'Custom') {
    return '';
  }

  return trimmed;
}

export function normalizeBeat(input?: string): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  for (const preset of BEAT_PRESETS) {
    if (preset.code === lower || preset.aliases.some((a) => a.toLowerCase() === lower)) {
      return preset.code;
    }
  }

  if (trimmed === '自定義' || trimmed === 'Custom') {
    return '';
  }

  return trimmed;
}

export function resolveGenreLabel(input: string, locale: InterfaceLocale | WritingLanguage = 'zh-TW'): string {
  const code = normalizeGenre(input);
  const found = GENRE_PRESETS.find((p) => p.code === code);
  if (found) {
    return locale === 'en' ? found.labelEn : found.labelZh;
  }
  return code; // Return custom string as-is
}

export function resolveStyleLabel(input: string, locale: InterfaceLocale | WritingLanguage = 'zh-TW'): string {
  const code = normalizeStyle(input);
  const found = STYLE_PRESETS.find((p) => p.code === code);
  if (found) {
    return locale === 'en' ? found.labelEn : found.labelZh;
  }
  return code;
}

export function resolveBeatLabel(input: string, locale: InterfaceLocale | WritingLanguage = 'zh-TW'): string {
  const code = normalizeBeat(input);
  const found = BEAT_PRESETS.find((p) => p.code === code);
  if (found) {
    return locale === 'en' ? found.labelEn : found.labelZh;
  }
  return code;
}
