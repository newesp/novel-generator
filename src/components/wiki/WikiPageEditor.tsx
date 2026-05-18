import { useState, useEffect } from 'react';
import type { WikiPage } from '../../types';
import { useWikiStore } from '../../stores/wikiStore';
import { Button } from '../common/Button';

export function WikiPageEditor({ page }: { page: WikiPage }) {
  const { savePage, deletePage } = useWikiStore();
  const [draft, setDraft] = useState(page.contentMd);
  const [dirty, setDirty] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setDraft(page.contentMd);
    setDirty(false);
  }, [page.id, page.contentMd]);

  // ESC 退出全屏
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const onSave = async () => {
    await savePage({ ...page, contentMd: draft });
    setDirty(false);
  };

  const onDelete = async () => {
    if (!confirm(`刪除 wiki 頁「${page.title}」？此動作不可還原（不會進 undo log）。`)) return;
    await deletePage(page.id);
  };

  const containerStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'var(--bg-primary, white)',
        display: 'flex', flexDirection: 'column',
      }
    : {
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
      };

  return (
    <div style={containerStyle}>
      {/* Header — fixed */}
      <div style={{
        flex: '0 0 auto',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border, #e0e0e0)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary, #888)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {page.type} / {page.slug}
          {page.aliases.length > 0 && ` · 別名：${page.aliases.join('、')}`}
        </div>
        <Button
          variant="secondary" size="sm"
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? '退出全屏 (Esc)' : '全屏'}
        >
          {fullscreen ? '⤡ 退出全屏' : '⤢ 全屏'}
        </Button>
      </div>

      {/* Textarea — fills available space, only scroll source */}
      <textarea
        className="form-textarea"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        style={{
          flex: 1, minHeight: 0,
          width: '100%', padding: 16, border: 'none', resize: 'none',
          fontFamily: 'var(--font-mono, monospace)', fontSize: 13,
          background: 'var(--bg-primary, white)', color: 'var(--text-primary, #222)',
          outline: 'none',
        }}
      />

      {/* Action bar — sticky bottom */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
        padding: '8px 16px',
        borderTop: '1px solid var(--border, #e0e0e0)',
        background: 'var(--bg-secondary, #fafafa)',
      }}>
        <Button variant="secondary" onClick={onDelete}>🗑 刪除</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty}>💾 儲存</Button>
      </div>
    </div>
  );
}
