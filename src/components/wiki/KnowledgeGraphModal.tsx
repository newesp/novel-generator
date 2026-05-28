import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  buildKnowledgeGraph,
  findGraphNodeIdsByLabel,
  queryGraphNeighborhood,
  type KnowledgeGraph,
} from '../../lib/knowledge-graph';
import type { Character, WikiPage } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  characters: Character[];
  wikiPages: WikiPage[];
}

export function KnowledgeGraphModal({ open, onClose, characters, wikiPages }: Props) {
  const [query, setQuery] = useState('');
  const graph = useMemo(() => buildKnowledgeGraph({ characters, wikiPages }), [characters, wikiPages]);
  const startIds = useMemo(() => findGraphNodeIdsByLabel(graph, query), [graph, query]);
  const neighborhood = useMemo(
    () => startIds[0] ? queryGraphNeighborhood(graph, startIds[0], 2) : null,
    [graph, startIds],
  );

  return (
    <Modal open={open} onClose={onClose} title="Graph 關係查詢" width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          目前由角色關係欄位、Wiki related links、文字提及建立 JSON graph，查詢會顯示 2-hop 關聯。
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            autoFocus
            placeholder="輸入角色名、Wiki 標題或 alias..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button variant="secondary" onClick={() => setQuery('')}>清除</Button>
        </div>

        <GraphStats graph={graph} />

        {!query.trim() ? (
          <EmptyState text="輸入名稱後會顯示關聯節點與路徑。" />
        ) : startIds.length === 0 || !neighborhood ? (
          <EmptyState text="找不到完全符合的角色或 Wiki 名稱。可試試 Wiki alias。" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ResultSection title={`節點 (${neighborhood.nodes.length})`}>
              {neighborhood.nodes.map((node) => (
                <div key={node.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{node.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {node.kind === 'character' ? 'character' : `${node.meta.type}/${node.meta.slug}`}
                  </div>
                </div>
              ))}
            </ResultSection>
            <ResultSection title={`關係 (${neighborhood.edges.length})`}>
              {neighborhood.edges.map((edge) => (
                <GraphEdgeRow key={edge.id} graph={graph} edgeId={edge.id} />
              ))}
            </ResultSection>
          </div>
        )}
      </div>
    </Modal>
  );
}

function GraphStats({ graph }: { graph: KnowledgeGraph }) {
  return (
    <div style={{
      display: 'flex',
      gap: 8,
      color: 'var(--text-secondary)',
      fontSize: 12,
    }}>
      <span>節點 {graph.nodes.length}</span>
      <span>關係 {graph.edges.length}</span>
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{
      minHeight: 220,
      maxHeight: 360,
      overflowY: 'auto',
      padding: 10,
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: 'var(--bg-tertiary)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function GraphEdgeRow({ graph, edgeId }: { graph: KnowledgeGraph; edgeId: string }) {
  const edge = graph.edges.find((item) => item.id === edgeId);
  if (!edge) return null;
  const from = graph.nodes.find((node) => node.id === edge.from);
  const to = graph.nodes.find((node) => node.id === edge.to);
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
        {from?.label ?? edge.from} → {to?.label ?? edge.to}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{edge.type}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
        {edge.label}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      minHeight: 220,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-tertiary)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: 'var(--bg-tertiary)',
      fontSize: 13,
    }}>
      {text}
    </div>
  );
}
