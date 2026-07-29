import { describe, expect, it } from 'vitest';
import {
  COMIC_VIDEO_MOTION_EFFECTS,
  comicMotionEffectDescription,
  comicMotionEffectLabel,
} from './motion-effects';

describe('comic motion effect presentation', () => {
  it('uses the interface locale for labels and descriptions', () => {
    const zoomIn = COMIC_VIDEO_MOTION_EFFECTS.find((effect) => effect.id === 'slow_zoom_in');
    expect(zoomIn).toBeDefined();
    expect(comicMotionEffectLabel(zoomIn!, 'en')).toBe('Slow zoom in');
    expect(comicMotionEffectLabel(zoomIn!, 'zh-TW')).toBe('緩慢推近');
    expect(comicMotionEffectDescription(zoomIn!, 'zh-TW')).toContain('鏡頭');
  });
});
