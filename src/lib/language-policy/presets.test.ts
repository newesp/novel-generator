import { describe, it, expect } from 'vitest';
import {
  normalizeGenre,
  normalizeStyle,
  normalizeBeat,
  resolveGenreLabel,
  resolveStyleLabel,
  resolveBeatLabel,
  GENRE_PRESETS,
  STYLE_PRESETS,
  BEAT_PRESETS,
} from './presets';

describe('Stable Code Preset Normalization & Localization (Ticket #18)', () => {
  describe('Genre Normalization', () => {
    it('normalizes Chinese and English legacy names to stable codes', () => {
      expect(normalizeGenre('玄幻')).toBe('xuanhuan');
      expect(normalizeGenre('Xuanhuan (Eastern Fantasy)')).toBe('xuanhuan');
      expect(normalizeGenre('都市')).toBe('urban');
      expect(normalizeGenre('Contemporary / Modern-Day')).toBe('urban');
      expect(normalizeGenre('仙俠')).toBe('xianxia');
      expect(normalizeGenre('科幻')).toBe('scifi');
      expect(normalizeGenre('言情')).toBe('romance');
      expect(normalizeGenre('懸疑')).toBe('mystery');
    });

    it('is idempotent for stable codes', () => {
      for (const preset of GENRE_PRESETS) {
        expect(normalizeGenre(preset.code)).toBe(preset.code);
      }
    });

    it('preserves custom user genre without wiping or mangling', () => {
      expect(normalizeGenre('賽博朋克')).toBe('賽博朋克');
      expect(normalizeGenre('Space Opera')).toBe('Space Opera');
    });

    it('clears placeholder "自定義" or "Custom" strings', () => {
      expect(normalizeGenre('自定義')).toBe('');
      expect(normalizeGenre('Custom')).toBe('');
      expect(normalizeGenre('')).toBe('');
    });
  });

  describe('Style Normalization', () => {
    it('normalizes legacy style names to stable codes', () => {
      expect(normalizeStyle('輕鬆')).toBe('lighthearted');
      expect(normalizeStyle('Lighthearted')).toBe('lighthearted');
      expect(normalizeStyle('沉重')).toBe('somber');
      expect(normalizeStyle('黑暗')).toBe('dark');
      expect(normalizeStyle('熱血')).toBe('high_energy');
      expect(normalizeStyle('High-Energy')).toBe('high_energy');
      expect(normalizeStyle('幽默')).toBe('humorous');
      expect(normalizeStyle('爽文')).toBe('wish_fulfillment');
      expect(normalizeStyle('Wish-Fulfillment')).toBe('wish_fulfillment');
    });

    it('is idempotent for stable codes', () => {
      for (const preset of STYLE_PRESETS) {
        expect(normalizeStyle(preset.code)).toBe(preset.code);
      }
    });

    it('preserves custom user style', () => {
      expect(normalizeStyle('廢土風')).toBe('廢土風');
    });
  });

  describe('Beat Normalization', () => {
    it('normalizes legacy beat strings to stable codes', () => {
      expect(normalizeBeat('引入 (Inciting Incident)')).toBe('inciting_incident');
      expect(normalizeBeat('Inciting Incident')).toBe('inciting_incident');
      expect(normalizeBeat('衝突升級 (Rising Action)')).toBe('rising_action');
      expect(normalizeBeat('Rising Action')).toBe('rising_action');
      expect(normalizeBeat('中點轉折 (Midpoint Twist)')).toBe('midpoint');
      expect(normalizeBeat('Midpoint')).toBe('midpoint');
      expect(normalizeBeat('高潮 (Climax)')).toBe('climax');
      expect(normalizeBeat('Climax')).toBe('climax');
      expect(normalizeBeat('結局 (Resolution)')).toBe('resolution');
      expect(normalizeBeat('Resolution')).toBe('resolution');
      expect(normalizeBeat('鋪墊/過渡')).toBe('setup');
      expect(normalizeBeat('Setup / Transition')).toBe('setup');
    });

    it('is idempotent for stable codes', () => {
      for (const preset of BEAT_PRESETS) {
        expect(normalizeBeat(preset.code)).toBe(preset.code);
      }
    });

    it('preserves custom user beats', () => {
      expect(normalizeBeat('伏筆揭曉')).toBe('伏筆揭曉');
    });
  });

  describe('Label Resolution by Locale & Writing Language', () => {
    it('resolves genre labels accurately for zh-TW and en', () => {
      expect(resolveGenreLabel('xuanhuan', 'zh-TW')).toBe('玄幻');
      expect(resolveGenreLabel('xuanhuan', 'en')).toBe('Xuanhuan (Eastern Fantasy)');

      expect(resolveGenreLabel('urban', 'zh-TW')).toBe('都市');
      expect(resolveGenreLabel('urban', 'en')).toBe('Contemporary / Modern-Day');

      // Custom value fallback
      expect(resolveGenreLabel('Steampunk', 'en')).toBe('Steampunk');
    });

    it('resolves style labels accurately for zh-TW and en', () => {
      expect(resolveStyleLabel('wish_fulfillment', 'zh-TW')).toBe('爽文');
      expect(resolveStyleLabel('wish_fulfillment', 'en')).toBe('Wish-Fulfillment');

      expect(resolveStyleLabel('high_energy', 'zh-TW')).toBe('熱血');
      expect(resolveStyleLabel('high_energy', 'en')).toBe('High-Energy');
    });

    it('resolves beat labels accurately for zh-TW and en', () => {
      expect(resolveBeatLabel('inciting_incident', 'zh-TW')).toBe('引入 (Inciting Incident)');
      expect(resolveBeatLabel('inciting_incident', 'en')).toBe('Inciting Incident');

      expect(resolveBeatLabel('setup', 'zh-TW')).toBe('鋪墊/過渡');
      expect(resolveBeatLabel('setup', 'en')).toBe('Setup / Transition');
    });
  });
});
