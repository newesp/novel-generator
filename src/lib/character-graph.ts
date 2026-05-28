import type { Character } from '../types';

export interface CharacterGraphNode {
  id: string;
  name: string;
  character: Character;
}

export interface CharacterGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface CharacterGraph {
  nodes: CharacterGraphNode[];
  edges: CharacterGraphEdge[];
}

export interface PositionedCharacterGraphNode extends CharacterGraphNode {
  x: number;
  y: number;
}

export interface PositionedCharacterGraph extends Omit<CharacterGraph, 'nodes'> {
  nodes: PositionedCharacterGraphNode[];
}

export function buildCharacterGraph(characters: Character[]): CharacterGraph {
  const nodes = characters
    .filter((character) => character.id && character.name.trim())
    .map((character) => ({
      id: character.id,
      name: character.name.trim(),
      character,
    }));

  const edgeMap = new Map<string, CharacterGraphEdge>();
  for (const source of nodes) {
    const relationText = source.character.relations.trim();
    if (!relationText) continue;

    for (const target of nodes) {
      if (target.id === source.id) continue;
      if (!relationText.includes(target.name)) continue;

      const [left, right] = [source.id, target.id].sort();
      const edgeId = `${left}->${right}`;
      const existing = edgeMap.get(edgeId);
      if (existing) {
        if (!existing.label.includes(relationText)) {
          existing.label = `${existing.label} / ${relationText}`;
        }
      } else {
        edgeMap.set(edgeId, {
          id: edgeId,
          sourceId: left,
          targetId: right,
          label: relationText,
        });
      }
    }
  }

  return { nodes, edges: [...edgeMap.values()] };
}

export function layoutCharacterGraph(graph: CharacterGraph, width: number, height: number): PositionedCharacterGraph {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(40, Math.min(width, height) / 2 - 40);
  const count = graph.nodes.length;

  const nodes = graph.nodes.map((node, index) => {
    const angle = count <= 1 ? 0 : (Math.PI * 2 * index) / count;
    return {
      ...node,
      x: Math.round(centerX + Math.cos(angle) * radius),
      y: Math.round(centerY + Math.sin(angle) * radius),
    };
  });

  return { nodes, edges: graph.edges };
}
