import { v4 as uuid } from 'uuid';
import type { ComicPanel, ComicPanelExtraGroup, ComicPanelExtraPriority, ComicPanelExtraRole } from '../../types';

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
      extraGroupsJson: normalizeExtraGroups(panel.extraGroups),
      dialogue: dialogueToText(panel.dialogue),
      narration: stringValue(panel.narration, ''),
      durationSec: normalizeDurationSec(panel.durationSec),
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

function normalizeExtraGroups(value: unknown): string | undefined {
  const groups = arrayValue(value)
    .map(asRecord)
    .map((group): ComicPanelExtraGroup | null => {
      const label = stringValue(group.label, '');
      const prompt = stringValue(group.prompt, '');
      if (!label && !prompt) return null;

      return {
        label: label || prompt,
        count: optionalPositiveNumber(group.count),
        role: extraRole(group.role),
        prompt,
        visualPriority: extraPriority(group.visualPriority),
      };
    })
    .filter((group): group is ComicPanelExtraGroup => Boolean(group));

  return groups.length ? JSON.stringify(groups) : undefined;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function extraRole(value: unknown): ComicPanelExtraRole {
  const role = stringValue(value, 'background');
  return ['crowd', 'guards', 'civilians', 'creatures', 'vehicles', 'background'].includes(role)
    ? role as ComicPanelExtraRole
    : 'background';
}

function extraPriority(value: unknown): ComicPanelExtraPriority {
  return stringValue(value, 'low') === 'medium' ? 'medium' : 'low';
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

function normalizeDurationSec(value: unknown): number {
  void value;
  return 0;
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
