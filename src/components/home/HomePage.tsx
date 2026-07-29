import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { storage } from '../../lib/storage';
import { BookCard } from './BookCard';
import { NewBookModal } from './NewBookModal';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';

import { t, type WritingLanguage } from '../../lib/language-policy';

export function HomePage() {
  const { books, loadAllBooks, loadProject, loadChapters, loadCharacters, createProject, deleteProject, updateProject } = useProjectStore();
  const { setView, setActiveTab, setSelectedChapterId } = useUIStore();
  const { generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;

  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    loadAllBooks();
  }, []);

  // Compute word counts for each book
  useEffect(() => {
    if (books.length === 0) return;
    (async () => {
      const counts: Record<string, number> = {};
      for (const book of books) {
        const chapters = await storage.chapters.listByProject(book.id, { sorted: false });
        counts[book.id] = chapters.reduce((sum, c) => sum + (c.content?.length ?? 0), 0);
      }
      setWordCounts(counts);
    })();
  }, [books]);

  const handleOpen = async (bookId: string) => {
    await loadProject(bookId);
    await loadChapters(bookId);
    await loadCharacters(bookId);
    // 已有章節 → 直接進入章節分頁並選中第一章；否則進入大綱分頁
    const chapters = useProjectStore.getState().chapters;
    if (chapters.length > 0) {
      setActiveTab('chapters');
      setSelectedChapterId(chapters[0].id);
    } else {
      setActiveTab('outline');
      setSelectedChapterId(null);
    }
    setView('editor');
  };

  const handleCreate = async (title: string, genre: string, style: string, writingLanguage: WritingLanguage) => {
    const id = await createProject({ title, genre, style, worldSetting: '', mainPlot: '', chapterOutline: '', writingLanguage });
    setShowNewModal(false);
    await loadChapters(id);
    await loadCharacters(id);
    // 新書一定沒章節，直接進大綱
    setActiveTab('outline');
    setSelectedChapterId(null);
    setView('editor');
  };

  const handleRenameConfirm = async () => {
    if (!renaming) return;
    await updateProject(renaming.id, { title: renaming.title });
    setRenaming(null);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    await deleteProject(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="home-page">
      {/* Header */}
      <div className="home-header">
        <h1 className="home-title">{t('home.myBooks', undefined, locale)}</h1>
        <Button variant="primary" onClick={() => setShowNewModal(true)}>
          {t('home.newBook', undefined, locale)}
        </Button>
      </div>

      {/* Book grid */}
      {books.length === 0 ? (
        <div className="home-empty">
          <div className="home-empty-icon">📚</div>
          <div className="home-empty-text">{t('home.noBooksDesc', undefined, locale)}</div>
        </div>
      ) : (
        <div className="book-grid">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              wordCount={wordCounts[book.id] ?? 0}
              onOpen={() => handleOpen(book.id)}
              onRename={() => setRenaming({ id: book.id, title: book.title })}
              onDelete={() => setConfirmDelete({ id: book.id, title: book.title })}
            />
          ))}

          {/* "+ 新增" card */}
          <div className="book-card book-card-add" onClick={() => setShowNewModal(true)}>
            <div className="book-card-add-icon">＋</div>
            <div className="book-card-add-label">{t('home.newBook', undefined, locale).replace('✨ ', '')}</div>
          </div>
        </div>
      )}

      {/* New book modal */}
      <NewBookModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreate}
      />

      {/* Rename modal */}
      {renaming && (
        <Modal
          open
          onClose={() => setRenaming(null)}
          title={t('home.renameTitle', undefined, locale)}
          width={360}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRenaming(null)}>{t('common.cancel', undefined, locale)}</Button>
              <Button
                variant="primary"
                onClick={handleRenameConfirm}
                disabled={!renaming.title.trim()}
              >
                {t('common.save', undefined, locale)}
              </Button>
            </>
          }
        >
          <Input
            label={t('home.bookTitle', undefined, locale)}
            value={renaming.title}
            onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
            autoFocus
          />
        </Modal>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title={t('home.deleteTitle', undefined, locale)}
          width={360}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>{t('common.cancel', undefined, locale)}</Button>
              <Button
                variant="primary"
                style={{ background: '#dc2626' }}
                onClick={handleDeleteConfirm}
              >
                {t('common.confirmDelete', undefined, locale)}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('home.deleteConfirmTitle', { title: confirmDelete.title }, locale)}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('home.deleteConfirmDesc', undefined, locale)}
          </p>
        </Modal>
      )}
    </div>
  );
}
