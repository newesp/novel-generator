import { useEffect, useMemo, useState } from 'react';
import { storage } from '../../lib/storage';
import { highlightSnippet } from '../../lib/search/highlight';
import type { SearchHit, SearchScope } from '../../lib/search/types';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useWikiStore } from '../../stores/wikiStore';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SCOPE_TABS: { value: SearchScope; label: string }[] = [
  { value: 'both', label: '全部' },
  { value: 'chapter', label: '章節' },
  { value: 'wikiPage', label: 'Wiki' },
];

export function GlobalSearchModal({ open, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const setSelectedChapterId = useUIStore((s) => s.setSelectedChapterId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const selectPage = useWikiStore((s) => s.selectPage);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('both');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = !!project && !!storage.search;
  const trimmedQuery = query.trim();
  const visibleResults = trimmedQuery ? results : [];

  useEffect(() => {
    if (!open || !canSearch || trimmedQuery.length === 0) {
      return;
    }

    let alive = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void storage.search!.search(project!.id, trimmedQuery, { scope, limit: 50 })
        .then((hits) => {
          if (!alive) return;
          setResults(hits);
          setError(null);
        })
        .catch((e) => {
          if (!alive) return;
          setResults([]);
          setError((e as Error).message);
        })
        .finally(() => {
          if (alive) setIsLoading(false);
        });
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [canSearch, open, project, scope, trimmedQuery]);

  const statusText = useMemo(() => {
    if (!canSearch) return '目前平台未啟用全文搜尋';
    if (!trimmedQuery) return '輸入關鍵字搜尋章節與 Wiki';
    if (isLoading) return '搜尋中...';
    if (error) return `搜尋失敗：${error}`;
    return `${visibleResults.length} 筆結果`;
  }, [canSearch, error, isLoading, visibleResults.length, trimmedQuery]);

  const openHit = (hit: SearchHit) => {
    if (hit.scope === 'chapter') {
      setSelectedChapterId(hit.id);
      setActiveTab('chapters');
    } else {
      selectPage(hit.id);
      setActiveTab('wiki');
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="全文搜尋" width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          autoFocus
          placeholder="搜尋人物、地點、設定、伏筆..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              setResults([]);
              setError(null);
            }
          }}
          disabled={!canSearch}
          style={{ width: '100%' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {SCOPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setScope(tab.value)}
                style={{
                  height: 28,
                  padding: '0 12px',
                  border: 0,
                  borderLeft: tab.value === 'both' ? 0 : '1px solid var(--border)',
                  background: scope === tab.value ? 'var(--accent)' : 'transparent',
                  color: scope === tab.value ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: error ? 'var(--warn)' : 'var(--text-tertiary)' }}>
            {statusText}
          </span>
        </div>

        <div style={{ minHeight: 320, maxHeight: 460, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          {visibleResults.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {trimmedQuery ? '沒有符合的結果' : '開始輸入後會顯示搜尋結果'}
            </div>
          ) : (
            visibleResults.map((hit) => (
              <SearchResultRow key={`${hit.scope}:${hit.id}`} hit={hit} onOpen={() => openHit(hit)} />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function SearchResultRow({ hit, onOpen }: { hit: SearchHit; onOpen: () => void }) {
  const label = hit.scope === 'chapter'
    ? `章節${typeof hit.chapterOrder === 'number' ? ` #${hit.chapterOrder + 1}` : ''}`
    : 'Wiki';

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        border: 0,
        borderBottom: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '1px 6px',
        }}>
          {label}
        </span>
        <strong style={{ fontSize: 13 }}>{hit.title}</strong>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {highlightSnippet(hit.snippet)}
      </div>
    </button>
  );
}
