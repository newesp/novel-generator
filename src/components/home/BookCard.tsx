import { useState, useRef, useEffect } from 'react';
import type { Project } from '../../types';

import { useSettingsStore } from '../../stores/settingsStore';
import { resolveGenreLabel } from '../../lib/language-policy';

// genre → hue for colour placeholder
const GENRE_COLORS: Record<string, string> = {
  xuanhuan: '#7c3aed',
  xianxia: '#4f86c6',
  urban: '#059669',
  scifi: '#0284c7',
  romance: '#db2777',
  mystery: '#b45309',
  玄幻: '#7c3aed',
  仙俠: '#4f86c6',
  都市: '#059669',
  科幻: '#0284c7',
  言情: '#db2777',
  懸疑: '#b45309',
};

function genreBg(genre: string): string {
  return GENRE_COLORS[genre] ?? '#4b5563';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

interface Props {
  book: Project;
  wordCount: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function BookCard({ book, wordCount, onOpen, onRename, onDelete }: Props) {
  const { generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
  const genreLabel = resolveGenreLabel(book.genre, locale);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="book-card" onClick={onOpen}>
      {/* Cover placeholder */}
      <div
        className="book-cover"
        style={{ background: genreBg(book.genre) }}
      >
        {genreLabel && (
          <span className="book-cover-genre">{genreLabel}</span>
        )}
      </div>

      {/* Info */}
      <div className="book-info">
        <div className="book-title">{book.title || '（無書名）'}</div>
        <div className="book-meta">
          <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)' }}>
            {book.writingLanguage === 'en' ? 'EN' : '繁中'}
          </span>
          <span>·</span>
          {genreLabel && <span>{genreLabel}</span>}
          {genreLabel && <span>·</span>}
          <span>{wordCount.toLocaleString()} 字</span>
        </div>
        <div className="book-date">更新 {formatDate(book.updatedAt)}</div>
      </div>

      {/* ⋯ menu button */}
      <div
        className="book-menu-btn"
        ref={menuRef}
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
      >
        ⋯
        {menuOpen && (
          <div className="book-menu-popup">
            <div
              className="book-menu-item"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(); }}
            >
              ✏️ 重命名
            </div>
            <div
              className="book-menu-item danger"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
            >
              🗑 刪除
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
