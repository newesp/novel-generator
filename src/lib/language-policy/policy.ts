import type { InterfaceLocale, WritingLanguage } from './types';
import { zhTW } from './locales/zh-TW';
import { en } from './locales/en';

const LOCALES = {
  'zh-TW': zhTW,
  en: en,
};

/**
 * 依據系統 / 瀏覽器語系自動偵測首次安裝的 Interface Locale。
 * 只要 navigator.language 以 'zh' 開頭（例如 zh-TW, zh-CN, zh-HK），一律初始化為 'zh-TW'，其餘為 'en'。
 */
export function detectInitialLocale(): InterfaceLocale {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh')) {
      return 'zh-TW';
    }
  }
  return 'en';
}

/**
 * 將首創的 Interface Locale 映射為初始的 Default Writing Language
 * 'zh-TW' -> 'zh-Hant'
 * 'en' -> 'en'
 */
export function mapLocaleToDefaultWritingLanguage(locale: InterfaceLocale): WritingLanguage {
  if (locale === 'zh-TW') {
    return 'zh-Hant';
  }
  return 'en';
}

/**
 * 依據 Interface Locale 格式化日期
 */
export function formatDate(
  timestamp: number | Date,
  locale: InterfaceLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const localeTag = locale === 'zh-TW' ? 'zh-TW' : 'en-US';
  const defaultOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };
  return new Intl.DateTimeFormat(localeTag, defaultOpts).format(d);
}

/**
 * 依據 Interface Locale 格式化數字
 */
export function formatNumber(
  value: number,
  locale: InterfaceLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const localeTag = locale === 'zh-TW' ? 'zh-TW' : 'en-US';
  return new Intl.NumberFormat(localeTag, options).format(value);
}

/**
 * 依據 Interface Locale 格式化字數顯示
 */
export function formatWordCount(count: number, locale: InterfaceLocale): string {
  const numStr = formatNumber(count, locale);
  if (locale === 'zh-TW') {
    return `${numStr} 字`;
  }
  return count === 1 ? `${numStr} word` : `${numStr} words`;
}

/**
 * 依據 Interface Locale 格式化估算成本
 */
export function formatCost(amount: number, currency = 'USD', locale: InterfaceLocale): string {
  const localeTag = locale === 'zh-TW' ? 'zh-TW' : 'en-US';
  try {
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(4)}`;
  }
}

/**
 * 更新 DOM 的 HTML lang 屬性與 document.title（若提供）
 */
export function setDocumentLocale(locale: InterfaceLocale, pageTitle?: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  if (pageTitle) {
    document.title = pageTitle;
  }
}

/**
 * 取用多國語系字串。
 * 支持 key 路徑 (如 'common.save', 'general.title') 及 {param} 插值。
 */
export function t(
  keyPath: string,
  params?: Record<string, string | number>,
  locale: InterfaceLocale | string = 'zh-TW',
): string {
  const catalog = LOCALES[locale as InterfaceLocale] || LOCALES['zh-TW'];
  const keys = keyPath.split('.');
  let current: unknown = catalog;

  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      // Fallback to zh-TW
      current = undefined;
      break;
    }
  }

  if (typeof current !== 'string') {
    // Attempt fallback to zh-TW if target locale was en
    if (locale !== 'zh-TW') {
      let fallbackCurrent: unknown = LOCALES['zh-TW'];
      for (const k of keys) {
        if (fallbackCurrent && typeof fallbackCurrent === 'object' && k in fallbackCurrent) {
          fallbackCurrent = (fallbackCurrent as Record<string, unknown>)[k];
        } else {
          fallbackCurrent = undefined;
          break;
        }
      }
      if (typeof fallbackCurrent === 'string') {
        current = fallbackCurrent;
      }
    }
  }

  if (typeof current !== 'string') {
    return keyPath; // Return key path if missing
  }

  let text = current;
  if (params) {
    for (const [pk, pv] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pk}\\}`, 'g'), String(pv));
    }
  }

  return text;
}
