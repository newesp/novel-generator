import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ClipboardCheck, History, MessageCircleQuestion, Network, Plus, ScanSearch } from 'lucide-react';
import { useWikiStore } from '../../stores/wikiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useLintStore } from '../../stores/lintStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import { WikiPageEditor } from './WikiPageEditor';
import { LintReportModal } from '../lint/LintReportModal';
import { KnowledgeGraphModal } from './KnowledgeGraphModal';
import { SummaryQualityModal } from './SummaryQualityModal';
import { WikiQueryModal } from './WikiQueryModal';
import {
  buildSummaryRanges,
  compareWikiPagesForList,
  formatSummaryPageLabel,
  getSummaryChapterNumber,
} from '../../lib/wiki-list';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
import type { WikiPage, WikiPageType } from '../../types';

const getTypeLabels = (locale: string): Record<WikiPageType, string> => ({
  concept: t('wiki.typeConcept', undefined, locale),
  entity: t('wiki.typeEntity', undefined, locale),
  summary: t('wiki.typeSummary', undefined, locale),
  compare: t('wiki.typeCompare', undefined, locale),
  synthesis: t('wiki.typeSynthesis', undefined, locale),
});

const WIKI_TOOL_BUTTON_STYLE: CSSProperties = {
  height: 44,
  width: '100%',
  minWidth: 0,
  padding: '0 6px',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
};

const WIKI_TOOLBAR_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  gap: 6,
  width: '100%',
};

export function WikiPanel({ workspace = false }: { workspace?: boolean }) {
  const { project, chapters, characters, loadChapters, loadCharacters } = useProjectStore();
  const { pages, log, selectedPageId, totalLength, loadForBook, selectPage, createPageBlank } = useWikiStore();
  const { runLint, isRunning: lintRunning } = useLintStore();
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  const [filter, setFilter] = useState('');
  const [chapterJump, setChapterJump] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [lintOpen, setLintOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [summaryQualityOpen, setSummaryQualityOpen] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (!project) return;
    void loadForBook(project.id);
    void loadChapters(project.id);
    void loadCharacters(project.id);
  }, [project, loadForBook, loadChapters, loadCharacters]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return pages;
    const q = filter.toLowerCase();
    return pages.filter((p) =>
      p.slug.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  }, [pages, filter]);

  const grouped = useMemo(() => {
    const out: Record<WikiPageType, WikiPage[]> = {
      entity: [],
      concept: [],
      summary: [],
      compare: [],
      synthesis: [],
    };
    for (const p of filtered) out[p.type].push(p);
    for (const type of Object.keys(out) as WikiPageType[]) {
      out[type].sort(compareWikiPagesForList);
    }
    return out;
  }, [filtered]);

  const selected = pages.find((p) => p.id === selectedPageId) ?? null;
  const summaryRanges = useMemo(
    () => buildSummaryRanges(grouped.summary, locale),
    [grouped.summary, locale],
  );

  const jumpToChapter = () => {
    const chapterNumber = parseInt(chapterJump, 10);
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
    const target = pages.find((p) => p.type === 'summary' && getSummaryChapterNumber(p) === chapterNumber);
    if (!target) return;
    setFilter('');
    setChapterJump('');
    selectPage(target.id);
  };

  if (!project) return null;

  return (
    <div className={`wiki-panel${workspace ? ' wiki-panel-workspace' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="wiki-panel-toolbar" style={{ padding: 12, borderBottom: '1px solid var(--border, #ccc)' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={WIKI_TOOLBAR_STYLE}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQueryOpen(true)}
              disabled={!project || pages.length === 0}
              title={t('wiki.askWikiHelp', undefined, locale)}
              style={WIKI_TOOL_BUTTON_STYLE}
            ><MessageCircleQuestion size={15} />{t('wiki.askWiki', undefined, locale)}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSummaryQualityOpen(true)}
              disabled={!project}
              title={t('wiki.summaryQualityHelp', undefined, locale)}
              style={WIKI_TOOL_BUTTON_STYLE}
            ><ClipboardCheck size={15} />{t('wiki.summaryQuality', undefined, locale)}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setGraphOpen(true)}
              disabled={!project}
              title={t('wiki.graphQueryHelp', undefined, locale)}
              style={WIKI_TOOL_BUTTON_STYLE}
            ><Network size={15} />{t('wiki.graphQuery', undefined, locale)}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setLintOpen(true); if (project) runLint(project.id); }}
              disabled={lintRunning || !project}
              title={t('wiki.runLintHelp', undefined, locale)}
              style={WIKI_TOOL_BUTTON_STYLE}
            ><ScanSearch size={15} />{t('wiki.runLint', undefined, locale)}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLogOpen(true)}
              title={t('wiki.actionLogHelp', undefined, locale)}
              style={WIKI_TOOL_BUTTON_STYLE}
            ><History size={15} />{t('wiki.actionLog', undefined, locale)}</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowNew(true)}
              title={t('wiki.newPageHelp', undefined, locale)}
              style={WIKI_TOOL_BUTTON_STYLE}
            ><Plus size={15} />{t('wiki.newPage', undefined, locale)}</Button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary, #888)' }}>
          {t('wiki.stats', { pages: pages.length, thousands: Math.round(totalLength / 1000) }, locale)}
        </div>
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder={t('wiki.filterPlaceholder', undefined, locale)}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        {pages.some((p) => p.type === 'summary') && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Input
              placeholder={t('wiki.jumpToChapterPlaceholder', undefined, locale)}
              value={chapterJump}
              onChange={(e) => setChapterJump(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') jumpToChapter(); }}
              style={{ width: '100%' }}
            />
            <Button variant="secondary" size="sm" onClick={jumpToChapter} disabled={!chapterJump.trim()}>
              {t('wiki.jump', undefined, locale)}
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 左欄：分組列表 */}
        <div className="wiki-page-browser" style={{ flex: workspace ? '0 0 340px' : '0 0 50%', minWidth: 0, borderRight: '1px solid var(--border, #ccc)', overflowY: 'auto' }}>
          {(Object.keys(grouped) as WikiPageType[]).map((type) => {
            const arr = grouped[type];
            if (arr.length === 0) return null;
            return (
              <div key={type}>
                <div style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  color: 'var(--text-tertiary, #888)',
                  background: 'var(--bg-tertiary, #f0f0f0)',
                }}>
                  {getTypeLabels(locale)[type]} ({arr.length})
                </div>
                {type === 'summary' && arr.length > 50 ? (
                  summaryRanges.map((range) => {
                    const hasSelected = range.pages.some((p) => p.id === selectedPageId);
                    return (
                      <details key={range.key} open={hasSelected || range.start === 1}>
                        <summary style={{
                          padding: '7px 12px',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-secondary)',
                          borderTop: '1px solid var(--border, #333)',
                        }}>
                          {range.label} ({range.pages.length})
                        </summary>
                        {range.pages.map((p) => (
                          <WikiListItem
                            key={p.id}
                            page={p}
                            selected={selectedPageId === p.id}
                            onSelect={() => selectPage(p.id)}
                          />
                        ))}
                      </details>
                    );
                  })
                ) : (
                  arr.map((p) => (
                    <WikiListItem
                      key={p.id}
                      page={p}
                      selected={selectedPageId === p.id}
                      onSelect={() => selectPage(p.id)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>

        {/* 右欄：選中頁的編輯區 */}
        <div className="wiki-page-editor-pane" style={{ flex: workspace ? '1 1 auto' : '0 0 50%', position: 'relative', minWidth: 0 }}>
          {selected ? (
            <WikiPageEditor page={selected} />
          ) : (
            <div style={{ padding: 24, color: 'var(--text-tertiary, #888)' }}>{t('wiki.selectToView', undefined, locale)}</div>
          )}
        </div>
      </div>

      {showNew && (
        <NewPageInline
          onClose={() => setShowNew(false)}
          onCreate={async (type, slug, title) => {
            const id = await createPageBlank(project.id, type, slug, title, project.writingLanguage);
            selectPage(id);
            setShowNew(false);
          }}
        />
      )}

      <LintReportModal open={lintOpen} onClose={() => setLintOpen(false)} />
      <KnowledgeGraphModal
        open={graphOpen}
        onClose={() => setGraphOpen(false)}
        characters={characters}
        wikiPages={pages}
      />
      <SummaryQualityModal
        open={summaryQualityOpen}
        onClose={() => setSummaryQualityOpen(false)}
        chapters={chapters}
        characters={characters}
        pages={pages}
        onChanged={async () => {
          if (project) await loadForBook(project.id);
        }}
      />
      <WikiQueryModal
        open={queryOpen}
        onClose={() => setQueryOpen(false)}
        pages={pages}
      />
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title={t('wiki.actionLog', undefined, locale)} width={680}>
        <WikiOperationLog log={log} locale={locale} />
      </Modal>
    </div>
  );
}

function WikiOperationLog({ log, locale }: { log: ReturnType<typeof useWikiStore.getState>['log'], locale: string }) {
  return (
    <div style={{
      maxHeight: 420,
      overflowY: 'auto',
      fontSize: 12,
      fontFamily: 'var(--font-mono, monospace)',
      lineHeight: 1.6,
    }}>
      {log.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary, #888)', textAlign: 'center', padding: 24 }}>{t('wiki.noData', undefined, locale)}</div>
      ) : (
        log.map((e) => (
          <div
            key={e.id}
            style={{
              padding: '6px 0',
              borderBottom: '1px solid var(--border, #333)',
              opacity: e.opStatus === 'undone' ? 0.4 : 1,
              color: e.opStatus === 'failed' ? 'var(--accent-danger, crimson)' : 'inherit',
            }}
          >
            {new Date(e.appliedAt).toLocaleString()} {e.kind} {e.pageType}/{e.pageSlug}
            {e.opStatus !== 'ok' ? ` [${e.opStatus}]` : ''}
            {e.errorMessage ? ` — ${e.errorMessage.slice(0, 120)}` : ''}
          </div>
        ))
      )}
    </div>
  );
}

function WikiListItem({ page, selected, onSelect }: {
  page: WikiPage;
  selected: boolean;
  onSelect: () => void;
}) {
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  const title = page.type === 'summary' ? formatSummaryPageLabel(page, locale) : page.title;
  return (
    <div
      onClick={onSelect}
      title={`${title}\n${page.slug}`}
      style={{
        padding: '6px 12px 6px 9px',
        cursor: 'pointer',
        fontSize: 13,
        background: selected ? 'var(--accent-bg)' : 'transparent',
        borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent',
        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: selected ? 600 : 400,
      }}
    >
      <div style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 11,
        color: 'var(--text-tertiary, #888)',
        fontWeight: 400,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>{page.slug}</div>
    </div>
  );
}

function NewPageInline(props: {
  onClose: () => void;
  onCreate: (type: WikiPageType, slug: string, title: string) => void;
}) {
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  const [type, setType] = useState<WikiPageType>('entity');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const valid = /^[a-z0-9][a-z0-9-]*$/.test(slug) && !!title.trim();
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-secondary, white)',
        padding: 24,
        borderRadius: 8,
        minWidth: 360,
      }}>
        <h3 style={{ marginTop: 0 }}>{t('wiki.newPage', undefined, locale)}</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          {t('wiki.typeLabel', undefined, locale)}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WikiPageType)}
            className="form-select"
            style={{ width: '100%', marginTop: 4 }}
          >
            {Object.entries(getTypeLabels(locale)).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder={t('wiki.pageEditorSlugPlaceholder', undefined, locale)}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder={t('wiki.pageEditorTitlePlaceholder', undefined, locale)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="secondary" onClick={props.onClose}>✕ {t('common.cancel', undefined, locale)}</Button>
          <Button
            variant="primary"
            onClick={() => props.onCreate(type, slug.trim(), title.trim())}
            disabled={!valid}
          >
            ＋ {t('common.create', undefined, locale)}
          </Button>
        </div>
      </div>
    </div>
  );
}
