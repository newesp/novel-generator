import { useMemo, useState } from 'react';
import type { Chapter, Project } from '../../types';
import { buildBookExportArtifact, type BookExportFormat } from '../../lib/book-export';
import { saveBlobFile } from '../../lib/file-export';
import { errorMessage } from '../../lib/error-message';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface BookExportModalProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  chapters: Chapter[];
}

const FORMAT_OPTIONS: Array<{
  format: BookExportFormat;
  label: string;
  description: string;
  accept: Record<string, string[]>;
  defaultExtension: string;
}> = [
  {
    format: 'txt',
    label: 'TXT',
    description: '純文字，適合備份正文或貼到其他工具。',
    accept: { 'text/plain': ['.txt'] },
    defaultExtension: 'txt',
  },
  {
    format: 'html',
    label: 'HTML',
    description: '含目錄與閱讀樣式，可直接用瀏覽器開啟。',
    accept: { 'text/html': ['.html'] },
    defaultExtension: 'html',
  },
  {
    format: 'epub',
    label: 'EPUB',
    description: '電子書格式，適合匯入閱讀器或書庫管理工具。',
    accept: { 'application/epub+zip': ['.epub'] },
    defaultExtension: 'epub',
  },
];

export function BookExportModal({ open, onClose, project, chapters }: BookExportModalProps) {
  const [busyFormat, setBusyFormat] = useState<BookExportFormat | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const stats = useMemo(() => {
    const sorted = [...chapters].sort((a, b) => a.order - b.order);
    const writtenChapters = sorted.filter((chapter) => chapter.content.trim()).length;
    const chars = sorted.reduce((sum, chapter) => sum + chapter.content.trim().length, 0);
    return { chapterCount: sorted.length, writtenChapters, chars };
  }, [chapters]);

  const handleExport = async (format: BookExportFormat) => {
    const option = FORMAT_OPTIONS.find((candidate) => candidate.format === format);
    if (!option) return;
    setBusyFormat(format);
    setMessage(null);
    try {
      const artifact = await buildBookExportArtifact(format, { project, chapters });
      const result = await saveBlobFile({
        filename: artifact.filename,
        blob: artifact.blob,
        pickerTitle: `匯出 ${artifact.filename}`,
        description: option.label,
        accept: option.accept,
        defaultExtension: option.defaultExtension,
      });
      if (result.status === 'cancelled') {
        setMessage({ kind: 'info', text: '已取消匯出' });
      } else if (result.path) {
        setMessage({ kind: 'ok', text: `已匯出至 ${result.path}` });
      } else {
        setMessage({ kind: 'ok', text: `已開始下載 ${artifact.filename}` });
      }
    } catch (err) {
      setMessage({ kind: 'err', text: `匯出失敗：${errorMessage(err)}` });
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busyFormat && onClose()}
      title="📤 匯出書本"
      width={560}
      footer={<Button variant="secondary" onClick={onClose} disabled={!!busyFormat}>關閉</Button>}
    >
      <div className="book-export-modal">
        <section className="book-export-summary">
          <strong>{project.title}</strong>
          <span>
            {stats.chapterCount} 章，{stats.writtenChapters} 章已有正文，約 {stats.chars.toLocaleString()} 字
          </span>
        </section>

        <div className="book-export-options">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              className="book-export-option"
              onClick={() => handleExport(option.format)}
              disabled={!!busyFormat}
              title={option.description}
            >
              <span className="book-export-option-label">{busyFormat === option.format ? '處理中' : option.label}</span>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        {message && (
          <div className={`book-export-message ${message.kind}`} role="status">
            {message.text}
          </div>
        )}
      </div>
    </Modal>
  );
}
