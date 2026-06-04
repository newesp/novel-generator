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
  referenceBindings: ComicReferenceBinding[];
  warnings: string[];
}

export interface ComicReferenceBinding {
  assetId: string;
  label: string;
}

export function composeComicImagePrompt(input: ComposeComicImagePromptInput): ComposedComicPrompt {
  const warnings: string[] = [];
  const extras = parseExtraGroups(input.panel, warnings);
  const activeCharacters = selectActiveCharacters(input.panel, input.characters ?? [], warnings);
  const activeScene = selectActiveScene(input.panel, input.scenes ?? [], warnings);
  const characterPrompts = activeCharacters.map(characterVisualPrompt).filter(Boolean);
  const characterNegativePrompts = activeCharacters.map((character) => character.visualNegativePrompt?.trim()).filter(Boolean);
  const scenePrompt = activeScene?.prompt.trim() ?? '';
  const sceneNegativePrompt = activeScene?.negativePrompt.trim() ?? '';
  const referenceBindings = uniqueReferenceBindings([
    ...activeCharacters.flatMap((character) => referenceBindingsForCharacter(character)),
    ...referenceBindingsForScene(activeScene),
  ]);
  const referenceAssetIds = referenceBindings.map((binding) => binding.assetId);
  const promptParts = [
    input.stylePreset,
    activeCharacters.length ? `Selected panel characters: ${activeCharacters.map((character) => character.name).join(', ')}` : '',
    characterPrompts.length ? `Character visual references:\n${characterPrompts.join('\n')}` : '',
    scenePrompt ? `Scene visual reference (${activeScene?.title ?? input.panel.location}): ${scenePrompt}` : '',
    input.panel.visualPrompt,
    extras.length ? `Extras / crowd: ${extras.map(extraGroupPrompt).join('; ')}. Keep extras secondary; do not make extras look like main characters.` : '',
  ].filter(Boolean);

  return {
    prompt: promptParts.join('\n'),
    negativePrompt: [input.panel.negativePrompt, ...characterNegativePrompts, sceneNegativePrompt].filter(Boolean).join('\n'),
    referenceAssetIds,
    referenceBindings,
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

function selectActiveCharacters(panel: ComicPanel, characters: Character[], warnings: string[]): Character[] {
  if (!panel.characters.length || !characters.length) return [];
  const matchedCharacters = Array.from(new Set(
    panel.characters
      .map((token) => resolveCharacterToken(token, characters))
      .filter((character): character is Character => Boolean(character)),
  ));
  for (const selectedToken of panel.characters) {
    if (normalizeName(selectedToken) && !resolveCharacterToken(selectedToken, characters)) {
      warnings.push(`Panel ${panel.order} selected character ${selectedToken}, but no matching project character was found.`);
    }
  }
  for (const character of matchedCharacters) {
    if (!character.appearance?.trim()) {
      warnings.push(`Panel ${panel.order} selected character ${character.name}, but that character has no appearance prompt.`);
    }
  }
  return matchedCharacters;
}

export function resolveCharacterToken(token: string, characters: Character[]): Character | undefined {
  const normalizedToken = normalizeName(token);
  if (!normalizedToken) return undefined;
  const exact = characters.find((character) => (
    normalizeName(character.id) === normalizedToken || normalizeName(character.name) === normalizedToken
  ));
  if (exact) return exact;
  if (normalizedToken.length < 2) return undefined;
  const partialMatches = characters.filter((character) => {
    const normalizedName = normalizeName(character.name);
    return normalizedName.includes(normalizedToken) || normalizedToken.includes(normalizedName);
  });
  return partialMatches.length === 1 ? partialMatches[0] : undefined;
}

export function canonicalizePanelCharacterTokens(tokens: string[], characters: Character[]): string[] {
  return Array.from(new Set(
    tokens
      .map((token) => resolveCharacterToken(token, characters)?.id)
      .filter((id): id is string => Boolean(id)),
  ));
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLocaleLowerCase();
}

function characterVisualPrompt(character: Character): string {
  const appearance = character.appearance?.trim();
  if (appearance) return `${character.name}: ${appearance}`;
  return '';
}

function referenceBindingsForCharacter(character: Character): ComicReferenceBinding[] {
  return (character.referenceAssetIds ?? []).map((assetId, index) => ({
    assetId,
    label: `character ${character.name} reference image ${index + 1}`,
  }));
}

function referenceBindingsForScene(scene: SceneVisual | undefined): ComicReferenceBinding[] {
  if (!scene) return [];
  return scene.referenceAssetIds.map((assetId, index) => ({
    assetId,
    label: `scene ${scene.title} reference image ${index + 1}`,
  }));
}

function uniqueReferenceBindings(bindings: ComicReferenceBinding[]): ComicReferenceBinding[] {
  const seen = new Set<string>();
  const unique: ComicReferenceBinding[] = [];
  for (const binding of bindings) {
    if (!binding.assetId || seen.has(binding.assetId)) continue;
    seen.add(binding.assetId);
    unique.push(binding);
  }
  return unique;
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
