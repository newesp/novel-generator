import type { SceneVisual } from '../types';

export function createDefaultSceneVisual(input: {
  id: string;
  projectId: string;
  title: string;
  prompt?: string;
  negativePrompt?: string;
  referenceAssetIds?: string[];
  now?: number;
}): SceneVisual {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    projectId: input.projectId,
    slug: slugifySceneTitle(input.title),
    title: input.title.trim() || 'Untitled scene',
    prompt: input.prompt?.trim() ?? '',
    negativePrompt: input.negativePrompt?.trim() ?? '',
    referenceAssetIds: input.referenceAssetIds ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function slugifySceneTitle(title: string): string {
  const ascii = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (ascii) return ascii;
  const fallback = Array.from(title.trim())
    .map((char) => char.codePointAt(0)?.toString(36))
    .filter(Boolean)
    .join('-');
  return fallback || 'scene';
}

export function filterSceneVisuals(scenes: SceneVisual[], query: string): SceneVisual[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return scenes;
  return scenes.filter((scene) => (
    [
      scene.title,
      scene.slug,
      scene.prompt,
      scene.negativePrompt,
    ].join(' ').toLocaleLowerCase().includes(needle)
  ));
}
