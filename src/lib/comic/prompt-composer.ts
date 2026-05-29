import type { ComicPanel, ComicPanelExtraGroup } from '../../types';

export interface ComposeComicImagePromptInput {
  panel: ComicPanel;
  stylePreset: string;
}

export interface ComposedComicPrompt {
  prompt: string;
  negativePrompt: string;
  referenceAssetIds: string[];
  warnings: string[];
}

export function composeComicImagePrompt(input: ComposeComicImagePromptInput): ComposedComicPrompt {
  const warnings: string[] = [];
  const extras = parseExtraGroups(input.panel, warnings);
  const promptParts = [
    input.stylePreset,
    input.panel.visualPrompt,
    extras.length ? `Extras / crowd: ${extras.map(extraGroupPrompt).join('; ')}. Keep extras secondary; do not make extras look like main characters.` : '',
  ].filter(Boolean);

  return {
    prompt: promptParts.join('\n'),
    negativePrompt: input.panel.negativePrompt,
    referenceAssetIds: [],
    warnings,
  };
}

function parseExtraGroups(panel: ComicPanel, warnings: string[]): ComicPanelExtraGroup[] {
  if (!panel.extraGroupsJson?.trim()) return [];
  try {
    const parsed = JSON.parse(panel.extraGroupsJson) as unknown;
    return Array.isArray(parsed) ? parsed.map(normalizeExtraGroup).filter(Boolean) as ComicPanelExtraGroup[] : [];
  } catch {
    warnings.push(`Panel ${panel.order} has invalid extraGroupsJson`);
    return [];
  }
}

function normalizeExtraGroup(value: unknown): ComicPanelExtraGroup | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = stringValue(record.label);
  const prompt = stringValue(record.prompt);
  if (!label && !prompt) return null;
  return {
    label: label || prompt,
    count: positiveNumber(record.count),
    role: stringValue(record.role) as ComicPanelExtraGroup['role'] || 'background',
    prompt,
    visualPriority: stringValue(record.visualPriority) === 'medium' ? 'medium' : 'low',
  };
}

function extraGroupPrompt(group: ComicPanelExtraGroup): string {
  const count = group.count ? `about ${group.count} ` : '';
  const prompt = group.prompt ? `, ${group.prompt}` : '';
  return `${count}${group.label} (${group.role}, ${group.visualPriority} visual priority${prompt})`;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}
