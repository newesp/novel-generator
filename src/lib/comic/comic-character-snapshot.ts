import type { Character } from '../../types';

interface LoadComicCharacterSnapshotInput {
  projectId: string;
  fallbackCharacters: Character[];
  listByProject: (projectId: string) => Promise<Character[]>;
}

export async function loadComicCharacterSnapshot({
  projectId,
  fallbackCharacters,
  listByProject,
}: LoadComicCharacterSnapshotInput): Promise<Character[]> {
  try {
    const freshCharacters = await listByProject(projectId);
    const freshById = new Map(freshCharacters.map((character) => [character.id, character]));
    return [
      ...freshCharacters,
      ...fallbackCharacters.filter((character) => !freshById.has(character.id)),
    ];
  } catch {
    return fallbackCharacters;
  }
}
