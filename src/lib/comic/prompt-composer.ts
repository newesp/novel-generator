import type { Character, ComicPanel, ComicPanelExtraGroup, SceneVisual } from '../../types';

export interface ComposeComicImagePromptInput {
  panel: ComicPanel;
  stylePreset: string;
  characters?: Character[];
  scenes?: SceneVisual[];
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
  const activeCharacters = selectActiveCharacters(input.panel, input.characters ?? []);
  const activeScene = selectActiveScene(input.panel, input.scenes ?? [], warnings);
  const characterPrompts = activeCharacters.map(characterVisualPrompt).filter(Boolean);
  const characterNegativePrompts = activeCharacters.map((character) => character.visualNegativePrompt?.trim()).filter(Boolean);
  const scenePrompt = activeScene?.prompt.trim() ?? '';
  const sceneNegativePrompt = activeScene?.negativePrompt.trim() ?? '';
  const referenceAssetIds = Array.from(new Set([
    ...activeCharacters.flatMap((character) => character.referenceAssetIds ?? []),
    ...(activeScene?.referenceAssetIds ?? []),
  ]));
  const promptParts = [
    input.stylePreset,
    characterPrompts.length ? `Character visual references:\n${characterPrompts.join('\n')}` : '',
    scenePrompt ? `Scene visual reference (${activeScene?.title ?? input.panel.location}): ${scenePrompt}` : '',
    input.panel.visualPrompt,
    extras.length ? `Extras / crowd: ${extras.map(extraGroupPrompt).join('; ')}. Keep extras secondary; do not make extras look like main characters.` : '',
  ].filter(Boolean);

  return {
    prompt: promptParts.join('\n'),
    negativePrompt: [input.panel.negativePrompt, ...characterNegativePrompts, sceneNegativePrompt].filter(Boolean).join('\n'),
    referenceAssetIds,
    warnings,
  };
}

function selectActiveScene(panel: ComicPanel, scenes: SceneVisual[], warnings: string[]): SceneVisual | undefined {
  const slug = panel.sceneSlug?.trim();
  if (!slug) return undefined;
  const scene = scenes.find((item) => item.slug === slug);
  if (!scene) warnings.push(`Panel ${panel.order} references missing scene ${slug}`);
  return scene;
}

function selectActiveCharacters(panel: ComicPanel, characters: Character[]): Character[] {
  if (!panel.characters.length || !characters.length) return [];
  const activeNames = new Set(panel.characters.map(normalizeName).filter(Boolean));
  return characters.filter((character) => activeNames.has(normalizeName(character.name)));
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function characterVisualPrompt(character: Character): string {
  const appearance = character.appearance?.trim();
  if (appearance) return `${character.name}: ${appearance}`;
  return '';
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
