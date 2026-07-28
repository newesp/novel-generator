import { describe, it, expect, vi } from 'vitest';
import {
  detectInitialLocale,
  mapLocaleToDefaultWritingLanguage,
  formatDate,
  formatNumber,
  formatWordCount,
  formatCost,
  setDocumentLocale,
  t,
  zhTW,
  en,
} from './index';

describe('Language Policy', () => {
  describe('Initial Locale & Writing Language Resolution', () => {
    it('detects zh-TW for Traditional/Simplified Chinese system locales', () => {
      const originalNavigator = global.navigator;
      const testCases = ['zh-TW', 'zh-CN', 'zh-HK', 'zh', 'ZH-tw'];

      for (const lang of testCases) {
        vi.stubGlobal('navigator', { language: lang });
        expect(detectInitialLocale()).toBe('zh-TW');
      }

      vi.stubGlobal('navigator', originalNavigator);
    });

    it('detects en for non-Chinese system locales', () => {
      const originalNavigator = global.navigator;
      const testCases = ['en-US', 'en-GB', 'ja-JP', 'fr-FR', 'es'];

      for (const lang of testCases) {
        vi.stubGlobal('navigator', { language: lang });
        expect(detectInitialLocale()).toBe('en');
      }

      vi.stubGlobal('navigator', originalNavigator);
    });

    it('maps Interface Locale to Default Writing Language independently', () => {
      expect(mapLocaleToDefaultWritingLanguage('zh-TW')).toBe('zh-Hant');
      expect(mapLocaleToDefaultWritingLanguage('en')).toBe('en');
    });
  });

  describe('Formatters', () => {
    it('formats date according to Interface Locale', () => {
      const date = new Date('2026-07-28T12:00:00Z');
      const zhDate = formatDate(date, 'zh-TW');
      const enDate = formatDate(date, 'en');

      expect(zhDate).toBeTruthy();
      expect(enDate).toBeTruthy();
    });

    it('formats number according to Interface Locale', () => {
      expect(formatNumber(1234567, 'zh-TW')).toBe('1,234,567');
      expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    });

    it('formats word count according to Interface Locale', () => {
      expect(formatWordCount(1500, 'zh-TW')).toBe('1,500 字');
      expect(formatWordCount(1, 'en')).toBe('1 word');
      expect(formatWordCount(1500, 'en')).toBe('1,500 words');
    });

    it('formats cost according to Interface Locale', () => {
      const zhCost = formatCost(0.1234, 'USD', 'zh-TW');
      const enCost = formatCost(0.1234, 'USD', 'en');
      expect(zhCost).toContain('0.1234');
      expect(enCost).toContain('0.1234');
    });
  });

  describe('DOM Document Locale', () => {
    it('sets html lang and document title', () => {
      setDocumentLocale('en', 'Novel Generator');
      expect(document.documentElement.lang).toBe('en');
      expect(document.title).toBe('Novel Generator');

      setDocumentLocale('zh-TW', '小說產生器');
      expect(document.documentElement.lang).toBe('zh-TW');
      expect(document.title).toBe('小說產生器');
    });
  });

  describe('Catalog Parity & Contract', () => {
    function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      let keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          keys = keys.concat(getAllKeys(v as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    it('zh-TW and en catalogs have identical keys and non-empty values', () => {
      const zhKeys = getAllKeys(zhTW).sort();
      const enKeys = getAllKeys(en as unknown as Record<string, unknown>).sort();

      expect(zhKeys).toEqual(enKeys);

      for (const key of zhKeys) {
        const zhVal = t(key, undefined, 'zh-TW');
        const enVal = t(key, undefined, 'en');
        expect(zhVal).not.toBe(key);
        expect(enVal).not.toBe(key);
        expect(zhVal.length).toBeGreaterThan(0);
        expect(enVal.length).toBeGreaterThan(0);
      }
    });

    it('interpolates parameters correctly in both locales', () => {
      expect(t('common.words', { count: 500 }, 'zh-TW')).toBe('500 字');
      expect(t('common.words', { count: 500 }, 'en')).toBe('500 words');
      expect(t('book.immutableLanguage', { lang: 'English' }, 'en')).toBe('Writing Language (Immutable): English');
    });
  });
});
