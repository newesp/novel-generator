import { useMemo } from 'react';
import { buildCharacterGraph, layoutCharacterGraph } from '../../lib/character-graph';
import type { Character } from '../../types';

interface Props {
  characters: Character[];
  onSelectCharacter: (character: Character) => void;
}

const WIDTH = 320;
const HEIGHT = 300;
const NODE_R = 26;

export function CharacterGraphView({ characters, onSelectCharacter }: Props) {
  const graph = useMemo(() => buildCharacterGraph(characters), [characters]);
  const positioned = useMemo(() => layoutCharacterGraph(graph, WIDTH, HEIGHT), [graph]);
  const nodeById = new Map(positioned.nodes.map((node) => [node.id, node]));

  if (characters.length === 0) {
    return (
      <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
        尚未建立角色，新增角色後可在此查看關係圖。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        依角色「關係」欄位中提到的其他角色名字建立連線。
      </div>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-tertiary)',
        overflow: 'hidden',
      }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="角色關係圖" style={{ width: '100%', display: 'block' }}>
          <defs>
            <marker id="character-graph-dot" markerWidth="4" markerHeight="4" refX="2" refY="2">
              <circle cx="2" cy="2" r="2" fill="var(--border-light)" />
            </marker>
          </defs>

          {positioned.edges.map((edge) => {
            const source = nodeById.get(edge.sourceId);
            const target = nodeById.get(edge.targetId);
            if (!source || !target) return null;
            return (
              <g key={edge.id}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="var(--border-light)"
                  strokeWidth={1.5}
                  markerStart="url(#character-graph-dot)"
                  markerEnd="url(#character-graph-dot)"
                />
                <title>{edge.label}</title>
              </g>
            );
          })}

          {positioned.nodes.map((node) => (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectCharacter(node.character)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectCharacter(node.character);
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_R}
                fill="var(--accent-bg)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="var(--text-primary)"
              >
                {node.name.slice(0, 4)}
              </text>
              <title>{node.name}</title>
            </g>
          ))}
        </svg>
      </div>

      {positioned.edges.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.6 }}>
          尚未偵測到關係。可在角色卡的「關係」欄位寫入其他角色名字，例如「信任蘇沐陽」。
        </div>
      )}
    </div>
  );
}
