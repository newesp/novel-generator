import { v4 as uuid } from 'uuid';
import type { ComicPanel } from '../../types';

interface StoryboardNormalizeResult {
  chapterTitle: string;
  storyboardStyle: string;
  visualContinuityBibleJson: string;
  panels: ComicPanel[];
  qualityNotes: string[];
}

type UnknownRecord = Record<string, unknown>;

export function normalizeStoryboardDraft(raw: unknown): StoryboardNormalizeResult {
  const input = asRecord(raw);
  const chapterTitle = stringValue(input.chapterTitle, 'Untitled Chapter');
  const storyboardStyle = stringValue(input.storyboardStyle, 'manga');
  const panelsInput = arrayValue(input.panels).map(asRecord);
  const now = Date.now();

  const sorted = panelsInput
    .map((panel, index) => ({ panel, index, n: numberValue(panel.panelNumber, index + 1) }))
    .sort((a, b) => a.n - b.n);

  const panels = sorted.map(({ panel }, index): ComicPanel => {
    const action = stringValue(panel.action, '');
    const beat = stringValue(panel.beat, action || `Panel ${index + 1}`);
    const visualPrompt = stringValue(panel.visualPrompt, [
      storyboardStyle,
      beat,
      stringValue(panel.setting, ''),
      action,
      stringValue(panel.emotion, ''),
    ].filter(Boolean).join(', '));
    return {
      id: uuid(),
      comicId: '',
      order: index + 1,
      beat,
      characters: stringArray(panel.characters),
      location: stringValue(panel.setting ?? panel.location, ''),
      shotType: stringValue(panel.shotType, ''),
      cameraAngle: stringValue(panel.cameraAngle, ''),
      visualPrompt,
      negativePrompt: stringValue(panel.negativePrompt, 'extra fingers, extra limbs, inconsistent face, unreadable text'),
      dialogue: dialogueToText(panel.dialogue),
      narration: stringValue(panel.narration, ''),
      durationSec: clamp(numberValue(panel.durationSec, 4), 2, 12),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    chapterTitle,
    storyboardStyle,
    visualContinuityBibleJson: JSON.stringify(input.visualContinuityBible ?? { chapterTitle }, null, 2),
    panels,
    qualityNotes: stringArray(asRecord(input.qualityChecks).notes),
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return arrayValue(value).map((item) => String(item).trim()).filter(Boolean);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dialogueToText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return arrayValue(value)
    .map(asRecord)
    .map((line) => {
      const text = stringValue(line.text, '');
      if (!text) return '';
      const character = stringValue(line.character, '');
      return character ? `${character}：${text}` : text;
    })
    .filter(Boolean)
    .join('\n');
}
