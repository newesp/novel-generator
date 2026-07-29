import { useState, useEffect, type CSSProperties } from 'react';
import { Modal as MantineModal, TextInput } from '@mantine/core';
import type { WikiPage } from '../../types';
import { useWikiStore } from '../../stores/wikiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
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
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  const [draftTitle, setDraftTitle] = useState(page.title);
  const [draftAliases, setDraftAliases] = useState(page.aliases.join('、'));
  const [draftContent, setDraftContent] = useState(page.contentMd);
  const [dirty, setDirty] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [renamingSlug, setRenamingSlug] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(page.slug);
  const [renameError, setRenameError] = useState('');

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
    if (!confirm(t('wiki.pageEditorDeleteConfirm', { title: page.title }, locale))) return;
    await deletePage(page.id);
  };

  const openRenameSlug = () => {
    if (dirty) {
      alert(t('wiki.pageEditorRenameSlugAlert', undefined, locale));
      return;
    }

    setRenameDraft(page.slug);
    setRenameError('');
    setRenameOpen(true);
  };

  const onRenameSlug = async () => {
    const newSlug = renameDraft.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(newSlug)) {
      setRenameError(t('wiki.pageEditorRenameSlugError', undefined, locale));
      return;
    }
    if (newSlug === page.slug) {
      setRenameOpen(false);
      return;
    }

    setRenamingSlug(true);
    try {
      await renamePageSlug(page.id, newSlug);
      setRenameOpen(false);
    } catch (e) {
      setRenameError((e as Error).message);
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
              title={t('wiki.pageEditorSlugHelp', undefined, locale)}
            >
              {page.type} / {page.slug}
            </div>
          </div>
          {fullscreen ? (
            <Button variant="secondary" onClick={() => setFullscreen(false)}>{t('wiki.pageEditorExitFullscreen', undefined, locale)}</Button>
          ) : (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              title={t('wiki.pageEditorFullscreen', undefined, locale)}
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
          placeholder={t('wiki.pageEditorTitlePlaceholder', undefined, locale)}
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
          placeholder={t('wiki.pageEditorAliasesPlaceholder', undefined, locale)}
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
          onClick={openRenameSlug}
          disabled={renamingSlug}
          title={t('wiki.pageEditorRenameSlugTooltip', undefined, locale)}
          style={ACTION_BUTTON_STYLE}
        >
          {renamingSlug ? t('wiki.pageEditorRenameSlugBtnRenaming', undefined, locale) : t('wiki.pageEditorRenameSlugBtnIdle', undefined, locale)}
        </Button>
        <Button variant="secondary" onClick={onDelete} style={ACTION_BUTTON_STYLE}>{t('wiki.pageEditorDelete', undefined, locale)}</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty} style={ACTION_BUTTON_STYLE}>{t('wiki.pageEditorSave', undefined, locale)}</Button>
      </div>

      <MantineModal
        opened={renameOpen}
        onClose={() => !renamingSlug && setRenameOpen(false)}
        title={t('wiki.pageEditorRenameSlugTitle', { type: page.type, slug: page.slug }, locale)}
        centered
        size="sm"
        closeOnClickOutside={!renamingSlug}
        closeOnEscape={!renamingSlug}
      >
        <TextInput
          label="Slug"
          description={t('wiki.pageEditorRenameSlugDesc', { type: page.type, slug: page.slug }, locale)}
          value={renameDraft}
          onChange={(event) => {
            setRenameDraft(event.currentTarget.value.toLowerCase());
            setRenameError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void onRenameSlug();
          }}
          error={renameError || undefined}
          autoFocus
          data-autofocus
          disabled={renamingSlug}
        />
        <div className="wiki-rename-actions">
          <Button variant="secondary" onClick={() => setRenameOpen(false)} disabled={renamingSlug}>
            {t('common.cancel', undefined, locale)}
          </Button>
          <Button variant="primary" onClick={() => void onRenameSlug()} disabled={renamingSlug || !renameDraft.trim()}>
            {renamingSlug ? t('wiki.pageEditorRenameSlugSyncing', undefined, locale) : t('common.confirm', undefined, locale)}
          </Button>
        </div>
      </MantineModal>
    </div>
  );
}
