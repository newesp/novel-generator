import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
import { Button } from '../common/Button';

export interface IngestToastProps {
  message: string;
  variant: 'success' | 'warn' | 'danger';
  onViewDiff: () => void;
  onUndo: () => void;
  onClose: () => void;
  durationMs?: number;
}

export function IngestToast({ message, variant, onViewDiff, onUndo, onClose, durationMs = 8000 }: IngestToastProps) {
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  useEffect(() => {
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [onClose, durationMs]);

  const bg = variant === 'danger' ? 'var(--accent-danger, crimson)'
           : variant === 'warn'    ? 'var(--accent-warning, #d18b00)'
                                   : 'var(--accent-success, #2e7d32)';

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 2000,
      background: 'var(--bg-secondary, white)', borderLeft: `4px solid ${bg}`,
      padding: 12, borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      minWidth: 320, fontSize: 13, color: 'var(--text-primary, #222)',
    }}>
      <div style={{ marginBottom: 8 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="text" size="sm" onClick={onViewDiff}>{t('wiki.ingestViewDiff', undefined, locale)}</Button>
        <Button variant="text" size="sm" onClick={onUndo}>{t('wiki.ingestUndo', undefined, locale)}</Button>
        <Button variant="secondary" size="sm" onClick={onClose}>{t('common.close', undefined, locale)}</Button>
      </div>
    </div>
  );
}
