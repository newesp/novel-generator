import { useEffect, useState } from 'react';
import { storage } from '../../lib/storage';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
import type { WikiLogEntry } from '../../types';
import { Modal } from '../common/Modal';

interface Props {
  bookId: string;
  batchId: string;
  onClose: () => void;
}

export function IngestDiffModal({ bookId, batchId, onClose }: Props) {
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  const [entries, setEntries] = useState<WikiLogEntry[]>([]);

  useEffect(() => {
    void storage.wikiLog.listByBatch(bookId, batchId).then(setEntries);
  }, [bookId, batchId]);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('wiki.ingestDiffModalTitle', { batch: batchId.slice(0, 8) }, locale)}
      width={760}
    >
      <div style={{ maxHeight: '60vh', overflow: 'auto', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
        {entries.length === 0 && (
          <div style={{ color: 'var(--text-tertiary, #888)' }}>{t('wiki.ingestDiffModalEmpty', undefined, locale)}</div>
        )}
        {entries.map((e) => (
          <details key={e.id} style={{ marginBottom: 8 }}>
            <summary>
              {e.kind} {e.pageType}/{e.pageSlug} [{e.opStatus}]
              {e.errorMessage ? ` — ${e.errorMessage}` : ''}
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <pre style={{ background: 'var(--bg-tertiary, #f5f5f5)', padding: 8, overflow: 'auto', margin: 0 }}>
                {e.pageSnapshotBefore?.contentMd ?? t('wiki.ingestDiffModalNoBefore', undefined, locale)}
              </pre>
              <pre style={{ background: 'var(--bg-tertiary, #f5f5f5)', padding: 8, overflow: 'auto', margin: 0 }}>
                {e.pageSnapshotAfter?.contentMd ?? t('wiki.ingestDiffModalNoAfter', undefined, locale)}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </Modal>
  );
}
