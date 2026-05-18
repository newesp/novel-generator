import { useEffect, useMemo, useState } from 'react';
import { useWikiStore } from '../../stores/wikiStore';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { WikiPageEditor } from './WikiPageEditor';
import type { WikiPage, WikiPageType } from '../../types';

const TYPE_LABELS: Record<WikiPageType, string> = {
  concept: '概念',
  entity: '實體',
  summary: '摘要',
  compare: '對比',
  synthesis: '綜述',
};

export function WikiPanel() {
  const { project } = useProjectStore();
  const { pages, log, selectedPageId, totalLength, loadForBook, selectPage, createPageBlank } = useWikiStore();
  const [filter, setFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (project) loadForBook(project.id);
  }, [project, loadForBook]);

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
    return out;
  }, [filtered]);

  const selected = pages.find((p) => p.id === selectedPageId) ?? null;

  if (!project) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border, #ccc)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>📚 Wiki</strong>
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>+ 新增頁面</Button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary, #888)' }}>
          {pages.length} 頁 · 約 {Math.round(totalLength / 1000)}k 字
        </div>
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder="搜尋 slug/標題/別名…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 左欄：分組列表 */}
        <div style={{ width: 220, borderRight: '1px solid var(--border, #ccc)', overflowY: 'auto' }}>
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
                  {TYPE_LABELS[type]} ({arr.length})
                </div>
                {arr.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => selectPage(p.id)}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                      background: selectedPageId === p.id ? 'var(--accent-soft, #e0e8ff)' : 'transparent',
                    }}
                  >
                    {p.title}
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)' }}>{p.slug}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* 右欄：選中頁的編輯區 */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {selected ? (
            <WikiPageEditor page={selected} />
          ) : (
            <div style={{ padding: 24, color: 'var(--text-tertiary, #888)' }}>選擇左側頁面以檢視 / 編輯</div>
          )}
        </div>
      </div>

      {/* 底部：操作記錄 */}
      <div style={{
        borderTop: '1px solid var(--border, #ccc)',
        maxHeight: 180,
        overflowY: 'auto',
        padding: 8,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        <div style={{ color: 'var(--text-tertiary, #888)', marginBottom: 4 }}>操作記錄（最近 50 條）</div>
        {log.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary, #888)' }}>—</div>
        ) : (
          log.map((e) => (
            <div
              key={e.id}
              style={{
                opacity: e.opStatus === 'undone' ? 0.4 : 1,
                color: e.opStatus === 'failed' ? 'var(--accent-danger, crimson)' : 'inherit',
              }}
            >
              {new Date(e.appliedAt).toLocaleString()} {e.kind} {e.pageType}/{e.pageSlug}
              {e.opStatus !== 'ok' ? ` [${e.opStatus}]` : ''}
              {e.errorMessage ? ` — ${e.errorMessage.slice(0, 60)}` : ''}
            </div>
          ))
        )}
      </div>

      {showNew && (
        <NewPageInline
          onClose={() => setShowNew(false)}
          onCreate={async (type, slug, title) => {
            const id = await createPageBlank(project.id, type, slug, title);
            selectPage(id);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function NewPageInline(props: {
  onClose: () => void;
  onCreate: (type: WikiPageType, slug: string, title: string) => void;
}) {
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
        <h3 style={{ marginTop: 0 }}>新增 Wiki 頁</h3>
        <label style={{ display: 'block', marginBottom: 8 }}>
          類型
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WikiPageType)}
            className="form-select"
            style={{ width: '100%', marginTop: 4 }}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder="slug (ascii-kebab-case)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Input
            placeholder="標題（可中文）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="secondary" onClick={props.onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => props.onCreate(type, slug.trim(), title.trim())}
            disabled={!valid}
          >
            建立
          </Button>
        </div>
      </div>
    </div>
  );
}
