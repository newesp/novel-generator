import type { Character, WikiPage } from '../types';

export type KnowledgeGraphNodeKind = 'character' | 'wikiPage';
export type KnowledgeGraphEdgeType = 'character_relation' | 'wiki_related' | 'wiki_mention';

export interface KnowledgeGraphNode {
  id: string;
  kind: KnowledgeGraphNodeKind;
  label: string;
  refId: string;
  meta: Record<string, string>;
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  type: KnowledgeGraphEdgeType;
  label: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface BuildKnowledgeGraphInput {
  characters: Character[];
  wikiPages: WikiPage[];
}

export function buildKnowledgeGraph(input: BuildKnowledgeGraphInput): KnowledgeGraph {
  const nodes: KnowledgeGraphNode[] = [];
  const edges = new Map<string, KnowledgeGraphEdge>();

  const characterNodes = input.characters
    .filter((character) => character.id && character.name.trim())
    .map((character) => ({
      character,
      node: {
        id: characterNodeId(character.id),
        kind: 'character' as const,
        label: character.name.trim(),
        refId: character.id,
        meta: { projectId: character.projectId },
      },
    }));

  const wikiNodes = input.wikiPages.map((page) => {
    const meta: Record<string, string> = { type: page.type, slug: page.slug };
    if (page.aliases.length > 0) meta.aliases = page.aliases.join('\n');
    return {
      page,
      node: {
      id: wikiNodeId(page.id),
      kind: 'wikiPage' as const,
      label: page.title,
      refId: page.id,
        meta,
      },
    };
  });

  nodes.push(...characterNodes.map(({ node }) => node));
  nodes.push(...wikiNodes.map(({ node }) => node));

  for (const source of characterNodes) {
    const relationText = source.character.relations.trim();
    if (!relationText) continue;

    for (const target of characterNodes) {
      if (target.node.id === source.node.id) continue;
      if (relationText.includes(target.node.label)) {
        addEdge(edges, source.node.id, target.node.id, 'character_relation', relationText);
      }
    }

    for (const target of wikiNodes) {
      if (mentionsWikiPage(relationText, target.page)) {
        addEdge(edges, source.node.id, target.node.id, 'wiki_mention', relationText);
      }
    }
  }

  const wikiByTypeSlug = new Map<string, KnowledgeGraphNode>();
  for (const { page, node } of wikiNodes) {
    wikiByTypeSlug.set(`${page.type}/${page.slug}`, node);
  }

  for (const source of wikiNodes) {
    for (const related of source.page.relatedSlugs) {
      const target = wikiByTypeSlug.get(`${related.type}/${related.slug}`);
      if (target) addEdge(edges, source.node.id, target.id, 'wiki_related', 'Related');
    }
  }

  return { nodes, edges: [...edges.values()] };
}

export function findGraphNodeIdsByLabel(graph: KnowledgeGraph, label: string): string[] {
  const q = label.trim();
  if (!q) return [];
  return graph.nodes
    .filter((node) => {
      if (node.label === q) return true;
      return node.kind === 'wikiPage' && node.meta.aliases?.split('\n').includes(q);
    })
    .map((node) => node.id);
}

export function queryGraphNeighborhood(graph: KnowledgeGraph, startNodeId: string, maxDepth = 1): KnowledgeGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, KnowledgeGraphEdge[]>();
  for (const edge of graph.edges) {
    const out = adjacency.get(edge.from) ?? [];
    out.push(edge);
    adjacency.set(edge.from, out);
    const back = adjacency.get(edge.to) ?? [];
    back.push(edge);
    adjacency.set(edge.to, back);
  }

  const visited = new Set<string>([startNodeId]);
  const edgeIds = new Set<string>();
  let frontier = [startNodeId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const edge of adjacency.get(nodeId) ?? []) {
        edgeIds.add(edge.id);
        const otherId = edge.from === nodeId ? edge.to : edge.from;
        if (!visited.has(otherId)) {
          visited.add(otherId);
          next.push(otherId);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: [...visited].map((id) => nodeById.get(id)).filter((node): node is KnowledgeGraphNode => !!node),
    edges: graph.edges.filter((edge) => edgeIds.has(edge.id) && visited.has(edge.from) && visited.has(edge.to)),
  };
}

function characterNodeId(id: string): string {
  return `character:${id}`;
}

function wikiNodeId(id: string): string {
  return `wiki:${id}`;
}

function addEdge(
  edges: Map<string, KnowledgeGraphEdge>,
  from: string,
  to: string,
  type: KnowledgeGraphEdgeType,
  label: string,
): void {
  const id = `${from}->${to}:${type}`;
  if (edges.has(id)) return;
  edges.set(id, { id, from, to, type, label });
}

function mentionsWikiPage(text: string, page: WikiPage): boolean {
  if (text.includes(page.title)) return true;
  return page.aliases.some((alias) => alias && text.includes(alias));
}
