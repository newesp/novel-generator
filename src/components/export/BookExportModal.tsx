import { useMemo, useState } from 'react';
import type { Chapter, Project } from '../../types';
import { buildBookExportArtifact, type BookExportFormat } from '../../lib/book-export';
import { saveBlobFile } from '../../lib/file-export';
import { errorMessage } from '../../lib/error-message';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
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
  descKey: 'formatTxtDesc' | 'formatHtmlDesc' | 'formatEpubDesc';
  accept: Record<string, string[]>;
  defaultExtension: string;
}> = [
  {
    format: 'txt',
    label: 'TXT',
    descKey: 'formatTxtDesc',
    accept: { 'text/plain': ['.txt'] },
    defaultExtension: 'txt',
  },
  {
    format: 'html',
    label: 'HTML',
    descKey: 'formatHtmlDesc',
    accept: { 'text/html': ['.html'] },
    defaultExtension: 'html',
  },
  {
    format: 'epub',
    label: 'EPUB',
    descKey: 'formatEpubDesc',
    accept: { 'application/epub+zip': ['.epub'] },
    defaultExtension: 'epub',
  },
];

export function BookExportModal({ open, onClose, project, chapters }: BookExportModalProps) {
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
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
      const artifact = await buildBookExportArtifact(format, { project, chapters, locale });
      const result = await saveBlobFile({
        filename: artifact.filename,
        blob: artifact.blob,
        pickerTitle: t('export.pickerTitle', { filename: artifact.filename }, locale),
        description: t(`export.${option.descKey}`, undefined, locale),
        accept: option.accept,
        defaultExtension: option.defaultExtension,
      });
      if (result.status === 'cancelled') {
        setMessage({ kind: 'info', text: t('export.cancelled', undefined, locale) });
      } else if (result.path) {
        setMessage({ kind: 'ok', text: t('export.successPath', { path: result.path }, locale) });
      } else {
        setMessage({ kind: 'ok', text: t('export.successDownload', { filename: artifact.filename }, locale) });
      }
    } catch (err) {
      setMessage({ kind: 'err', text: t('export.failed', { error: errorMessage(err) }, locale) });
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busyFormat && onClose()}
      title={t('export.title', undefined, locale)}
      width={560}
      footer={<Button variant="secondary" onClick={onClose} disabled={!!busyFormat}>{t('export.close', undefined, locale)}</Button>}
    >
      <div className="book-export-modal">
        <section className="book-export-summary">
          <strong>{project.title}</strong>
          <span>
            {t('export.stats', {
              chapterCount: String(stats.chapterCount),
              writtenChapters: String(stats.writtenChapters),
              chars: stats.chars.toLocaleString()
            }, locale)}
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
              title={t(`export.${option.descKey}`, undefined, locale)}
            >
              <span className="book-export-option-label">{busyFormat === option.format ? t('export.busy', undefined, locale) : option.label}</span>
              <span>{t(`export.${option.descKey}`, undefined, locale)}</span>
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
