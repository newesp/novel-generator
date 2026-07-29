import { useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import type { ChapterVersion } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';

interface Props {
  onApplyVersion: (content: string) => void;
}

export function VersionPanel({ onApplyVersion }: Props) {
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const { currentChapterVersions, pinVersion, deleteVersion } = useProjectStore();
  const [previewing, setPreviewing] = useState<ChapterVersion | null>(null);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="version-panel">
      <div className="version-header">{t('versions.header', { count: currentChapterVersions.length }, locale)}</div>
      <div className="version-list">
        {currentChapterVersions.map((v, i) => (
          <div key={v.id} className={`version-item${i === 0 ? ' current' : ''}`}>
            <div className="version-item-header">
              <span className="version-label">
                {i === 0 && '★ '}
                {v.isPinned && '📌 '}
                v{currentChapterVersions.length - i}
                {v.kind === 'inline' && (
                  <span className="badge badge-gray" style={{ marginLeft: 6 }}>{t('versions.inline', undefined, locale)}</span>
                )}
              </span>
              <span className="version-time">{formatTime(v.createdAt)}</span>
            </div>
            <div className="version-actions">
              <Button
                variant="secondary"
                style={{ height: 26, fontSize: 11, padding: '0 8px' }}
                onClick={() => setPreviewing(v)}
              >
                {t('versions.preview', undefined, locale)}
              </Button>
              <Button
                variant="text"
                style={{ height: 26, fontSize: 11, padding: '0 6px' }}
                onClick={() => pinVersion(v.id, !v.isPinned)}
              >
                {v.isPinned ? t('versions.unpin', undefined, locale) : t('versions.pin', undefined, locale)}
              </Button>
              {i !== 0 && (
                <Button
                  variant="text"
                  style={{ height: 26, fontSize: 11, padding: '0 6px', color: 'var(--text-tertiary)' }}
                  onClick={() => {
                    if (confirm(t('versions.deleteConfirm', undefined, locale))) deleteVersion(v.id);
                  }}
                >
                  {t('common.delete', undefined, locale)}
                </Button>
              )}
            </div>
          </div>
        ))}
        {currentChapterVersions.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: '8px 0' }}>
            {t('versions.empty', undefined, locale)}
          </div>
        )}
      </div>

      {previewing && (
        <Modal
          open
          onClose={() => setPreviewing(null)}
          title={t('versions.previewTitle', { time: formatTime(previewing.createdAt) }, locale)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPreviewing(null)}>{t('common.close', undefined, locale)}</Button>
              <Button
                variant="primary"
                onClick={() => {
                  onApplyVersion(previewing.content);
                  setPreviewing(null);
                }}
              >
                {t('versions.setCurrent', undefined, locale)}
              </Button>
            </>
          }
        >
          <div style={{
            background: 'var(--bg-tertiary)',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            maxHeight: '50vh',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            {previewing.content || t('versions.emptyContent', undefined, locale)}
          </div>
        </Modal>
      )}
    </div>
  );
}
