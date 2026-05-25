import { useState, useEffect } from 'react';
import type { WikiPage } from '../../types';
import { useWikiStore } from '../../stores/wikiStore';
import { Button } from '../common/Button';

export function WikiPageEditor({ page }: { page: WikiPage }) {
  const { savePage, deletePage } = useWikiStore();
  const [draftTitle, setDraftTitle] = useState(page.title);
  const [draftAliases, setDraftAliases] = useState(page.aliases.join('、'));
  const [draftContent, setDraftContent] = useState(page.contentMd);
  const [dirty, setDirty] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setDraftTitle(page.title);
    setDraftAliases(page.aliases.join('、'));
    setDraftContent(page.contentMd);
    setDirty(false);
  }, [page.id, page.title, page.aliases, page.contentMd]);

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
    const aliases = draftAliases
      .split(/[，,、]/)
      .map((a) => a.trim())
      .filter(Boolean);
    await savePage({ ...page, title: draftTitle.trim() || page.title, aliases, contentMd: draftContent });
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
        padding: '10px 16px 8px',
        borderBottom: '1px solid var(--border, #e0e0e0)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* 第 1 列：type/slug + 全屏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              fontSize: 11, color: 'var(--text-tertiary, #888)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono, monospace)',
            }}
            title="slug 不可直接修改（其他頁的 relatedSlugs 引用會失效）。需要的話請刪除後重建。"
          >
            {page.type} / {page.slug}
          </div>
          {fullscreen ? (
            <Button variant="secondary" onClick={() => setFullscreen(false)}>✕ 收起 (Esc)</Button>
          ) : (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              title="展開全螢幕編輯"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, padding: 2, flex: '0 0 auto' }}
            >⛶</button>
          )}
        </div>

        {/* 第 2 列：title 編輯 */}
        <input
          type="text"
          className="form-input"
          value={draftTitle}
          onChange={(e) => { setDraftTitle(e.target.value); setDirty(true); }}
          placeholder="標題（顯示用，可中文）"
          style={{
            width: '100%', padding: '4px 8px', fontSize: 14, fontWeight: 600,
            border: '1px solid var(--border)', borderRadius: 3,
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
          }}
        />

        {/* 第 3 列：aliases 編輯 */}
        <input
          type="text"
          className="form-input"
          value={draftAliases}
          onChange={(e) => { setDraftAliases(e.target.value); setDirty(true); }}
          placeholder="別名（用、逗號或 / 分隔，可留空）"
          style={{
            width: '100%', padding: '3px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 3,
            background: 'var(--bg-primary)', color: 'var(--text-secondary)',
          }}
        />
      </div>

      {/* Textarea — fills available space, only scroll source */}
      <textarea
        className="form-textarea"
        value={draftContent}
        onChange={(e) => { setDraftContent(e.target.value); setDirty(true); }}
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
        display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
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
