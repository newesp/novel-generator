import { useState, useEffect } from 'react';
import type { WikiPage } from '../../types';
import { useWikiStore } from '../../stores/wikiStore';
import { Button } from '../common/Button';
import { Textarea } from '../common/Textarea';

export function WikiPageEditor({ page }: { page: WikiPage }) {
  const { savePage, deletePage } = useWikiStore();
  const [draft, setDraft] = useState(page.contentMd);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(page.contentMd);
    setDirty(false);
  }, [page.id, page.contentMd]);

  const onSave = async () => {
    await savePage({ ...page, contentMd: draft });
    setDirty(false);
  };

  const onDelete = async () => {
    if (!confirm(`刪除 wiki 頁「${page.title}」？此動作不可還原（不會進 undo log）。`)) return;
    await deletePage(page.id);
  };

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        {page.type} / {page.slug}
        {page.aliases.length > 0 && ` · 別名：${page.aliases.join('、')}`}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        style={{ flex: 1, minHeight: 400, fontFamily: 'var(--font-mono, monospace)' }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onDelete}>🗑 刪除</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty}>💾 儲存</Button>
      </div>
    </div>
  );
}
