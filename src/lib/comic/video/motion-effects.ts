import type { ComicPanelMotionEffect } from '../../../types';
import type { InterfaceLocale } from '../../language-policy';

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

const ZH_HANT_MOTION_EFFECTS: Record<ComicPanelMotionEffect, { label: string; description: string }> = {
  none: { label: '無', description: '使用靜態畫面，不套用鏡頭移動。' },
  slow_zoom_in: { label: '緩慢推近', description: '鏡頭緩慢向畫面中央推近。' },
  slow_zoom_out: { label: '緩慢拉遠', description: '從較近的畫面開始，逐步顯示更多內容。' },
  pan_left: { label: '向左平移', description: '鏡頭由右向左緩慢掃過。' },
  pan_right: { label: '向右平移', description: '鏡頭由左向右緩慢掃過。' },
  pan_up: { label: '向上平移', description: '鏡頭緩慢向上掃過。' },
  pan_down: { label: '向下平移', description: '鏡頭緩慢向下掃過。' },
  ken_burns_in_left: { label: 'Ken Burns 推近左側', description: '推近畫面並偏重左側。' },
  ken_burns_in_right: { label: 'Ken Burns 推近右側', description: '推近畫面並偏重右側。' },
  ken_burns_in_top: { label: 'Ken Burns 推近上方', description: '推近畫面並偏重上方。' },
  ken_burns_in_bottom: { label: 'Ken Burns 推近下方', description: '推近畫面並偏重下方。' },
  pulse_zoom: { label: '脈衝縮放', description: '加入輕微、如心跳般的縮放脈衝。' },
  crash_zoom_in: { label: '快速推近', description: '鏡頭快速推近後停住。' },
  subtle_shake: { label: '輕微震動', description: '加入輕微的衝擊震動。' },
  fade_in: { label: '淡入', description: '畫面由黑色逐漸顯現。' },
  fade_out: { label: '淡出', description: '畫面逐漸轉為黑色。' },
};

export function comicMotionEffectLabel(
  effect: ComicVideoMotionEffectOption,
  locale: InterfaceLocale,
): string {
  return locale === 'en' ? effect.label : ZH_HANT_MOTION_EFFECTS[effect.id].label;
}

export function comicMotionEffectDescription(
  effect: ComicVideoMotionEffectOption,
  locale: InterfaceLocale,
): string {
  return locale === 'en' ? effect.description : ZH_HANT_MOTION_EFFECTS[effect.id].description;
}

const COMIC_VIDEO_MOTION_EFFECT_IDS = new Set<string>(
  COMIC_VIDEO_MOTION_EFFECTS.map((effect) => effect.id),
);

export function normalizeComicPanelMotionEffect(value: unknown): ComicPanelMotionEffect {
  return typeof value === 'string' && COMIC_VIDEO_MOTION_EFFECT_IDS.has(value)
    ? value as ComicPanelMotionEffect
    : DEFAULT_COMIC_PANEL_MOTION_EFFECT;
}
