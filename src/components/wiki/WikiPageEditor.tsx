import { useState, useEffect, type CSSProperties } from 'react';
import type { WikiPage } from '../../types';
import { useWikiStore } from '../../stores/wikiStore';
import { Button } from '../common/Button';

const ACTION_BUTTON_STYLE: CSSProperties = {
  width: 104,
  height: 36,
  justifyContent: 'center',
  whiteSpace: 'nowrap',
};

export function WikiPageEditor({ page }: { page: WikiPage }) {
  return <WikiPageEditorContent key={`${page.id}:${page.updatedAt}`} page={page} />;
}

function WikiPageEditorContent({ page }: { page: WikiPage }) {
  const { savePage, deletePage, renamePageSlug } = useWikiStore();
  const [draftTitle, setDraftTitle] = useState(page.title);
  const [draftAliases, setDraftAliases] = useState(page.aliases.join('、'));
  const [draftContent, setDraftContent] = useState(page.contentMd);
  const [dirty, setDirty] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [renamingSlug, setRenamingSlug] = useState(false);

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

  const onRenameSlug = async () => {
    if (dirty) {
      alert('請先儲存目前編輯內容，再重命名 slug。');
      return;
    }

    const next = prompt(`重命名 ${page.type}/${page.slug}`, page.slug);
    if (next === null) return;

    const newSlug = next.trim().toLowerCase();
    if (!newSlug || newSlug === page.slug) return;

    if (!confirm(`將 ${page.type}/${page.slug} 改成 ${page.type}/${newSlug}，並同步更新所有 Wiki 內部引用？`)) return;

    setRenamingSlug(true);
    try {
      await renamePageSlug(page.id, newSlug);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRenamingSlug(false);
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11, color: 'var(--text-tertiary, #888)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono, monospace)',
              }}
              title="slug 可透過重命名同步更新所有 Wiki 內部引用。"
            >
              {page.type} / {page.slug}
            </div>
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
        <Button
          variant="secondary"
          onClick={onRenameSlug}
          disabled={renamingSlug}
          title="重新命名 slug，並同步更新所有 Wiki 內部引用"
          style={ACTION_BUTTON_STYLE}
        >
          ✏️ {renamingSlug ? '改名中' : '改 slug'}
        </Button>
        <Button variant="secondary" onClick={onDelete} style={ACTION_BUTTON_STYLE}>🗑 刪除</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty} style={ACTION_BUTTON_STYLE}>💾 儲存</Button>
      </div>
    </div>
  );
}
