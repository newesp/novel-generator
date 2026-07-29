import { useEffect, useMemo, useState } from 'react';
import { storage } from '../../lib/storage';
import { highlightSnippet } from '../../lib/search/highlight';
import type { SearchHit, SearchScope } from '../../lib/search/types';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useWikiStore } from '../../stores/wikiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
}



export function GlobalSearchModal({ open, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
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
    if (!canSearch) return t('search.statusDisabled', undefined, locale);
    if (!trimmedQuery) return t('search.statusEmpty', undefined, locale);
    if (isLoading) return t('search.statusLoading', undefined, locale);
    if (error) return t('search.statusFailed', { error }, locale);
    return t('search.statusFound', { count: String(visibleResults.length) }, locale);
  }, [canSearch, error, isLoading, visibleResults.length, trimmedQuery, locale]);

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
    <Modal open={open} onClose={onClose} title={t('search.title', undefined, locale)} width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          autoFocus
          placeholder={t('search.placeholder', undefined, locale)}
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
            {(['both', 'chapter', 'wikiPage'] as const).map((tab) => {
              const tabLabel = tab === 'both' ? t('search.scopeBoth', undefined, locale) : tab === 'chapter' ? t('search.scopeChapter', undefined, locale) : t('search.scopeWiki', undefined, locale);
              return (
              <button
                key={tab}
                type="button"
                onClick={() => setScope(tab)}
                style={{
                  height: 28,
                  padding: '0 12px',
                  border: 0,
                  borderLeft: tab === 'both' ? 0 : '1px solid var(--border)',
                  background: scope === tab ? 'var(--accent)' : 'transparent',
                  color: scope === tab ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {tabLabel}
              </button>
            )})}
          </div>
          <span style={{ fontSize: 12, color: error ? 'var(--warn)' : 'var(--text-tertiary)' }}>
            {statusText}
          </span>
        </div>

        <div style={{ minHeight: 320, maxHeight: 460, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          {visibleResults.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {trimmedQuery ? t('search.noResultsText', undefined, locale) : t('search.initialText', undefined, locale)}
            </div>
          ) : (
            visibleResults.map((hit) => (
              <SearchResultRow key={`${hit.scope}:${hit.id}`} hit={hit} onOpen={() => openHit(hit)} locale={locale} />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function SearchResultRow({ hit, onOpen, locale }: { hit: SearchHit; onOpen: () => void; locale: string }) {
  const label = hit.scope === 'chapter'
    ? typeof hit.chapterOrder === 'number' ? t('search.labelChapterOrder', { order: String(hit.chapterOrder + 1) }, locale) : t('search.labelChapter', undefined, locale)
    : t('search.labelWiki', undefined, locale);

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
