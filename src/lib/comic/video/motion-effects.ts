import type { ComicPanelMotionEffect } from '../../../types';

export interface ComicVideoMotionEffectOption {
  id: ComicPanelMotionEffect;
  label: string;
  description: string;
}

export const DEFAULT_COMIC_PANEL_MOTION_EFFECT: ComicPanelMotionEffect = 'none';

export const COMIC_VIDEO_MOTION_EFFECTS: ComicVideoMotionEffectOption[] = [
  { id: 'none', label: 'None', description: 'Static panel with no camera movement.' },
  { id: 'slow_zoom_in', label: 'Slow zoom in', description: 'Slowly pushes toward the center.' },
  { id: 'slow_zoom_out', label: 'Slow zoom out', description: 'Starts closer and slowly reveals more of the panel.' },
  { id: 'pan_left', label: 'Pan left', description: 'Slowly scans from right to left.' },
  { id: 'pan_right', label: 'Pan right', description: 'Slowly scans from left to right.' },
  { id: 'pan_up', label: 'Pan up', description: 'Slowly scans upward.' },
  { id: 'pan_down', label: 'Pan down', description: 'Slowly scans downward.' },
  { id: 'ken_burns_in_left', label: 'Ken Burns in left', description: 'Pushes in while favoring the left side.' },
  { id: 'ken_burns_in_right', label: 'Ken Burns in right', description: 'Pushes in while favoring the right side.' },
  { id: 'ken_burns_in_top', label: 'Ken Burns in top', description: 'Pushes in while favoring the top.' },
  { id: 'ken_burns_in_bottom', label: 'Ken Burns in bottom', description: 'Pushes in while favoring the bottom.' },
  { id: 'pulse_zoom', label: 'Pulse zoom', description: 'Adds a small heartbeat-like zoom pulse.' },
  { id: 'crash_zoom_in', label: 'Crash zoom in', description: 'Quickly pushes in, then holds.' },
  { id: 'subtle_shake', label: 'Subtle shake', description: 'Adds a light impact shake.' },
  { id: 'fade_in', label: 'Fade in', description: 'Fades the panel in from black.' },
  { id: 'fade_out', label: 'Fade out', description: 'Fades the panel out to black.' },
];

const COMIC_VIDEO_MOTION_EFFECT_IDS = new Set<string>(
  COMIC_VIDEO_MOTION_EFFECTS.map((effect) => effect.id),
);

export function normalizeComicPanelMotionEffect(value: unknown): ComicPanelMotionEffect {
  return typeof value === 'string' && COMIC_VIDEO_MOTION_EFFECT_IDS.has(value)
    ? value as ComicPanelMotionEffect
    : DEFAULT_COMIC_PANEL_MOTION_EFFECT;
}
