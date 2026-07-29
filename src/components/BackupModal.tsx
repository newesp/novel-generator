import { useEffect, useRef, useState } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import {
  exportSnapshot,
  importSnapshot,
  saveSnapshotAsJson,
  readSnapshotFromFile,
  describeSnapshot,
} from '../lib/backup';
import {
  isFsAccessSupported,
  pickAndLinkFolder,
  reactivateLinkedFolder,
  getLinkedFolderName,
  unlinkFolder,
  pushSnapshotNow,
  pullSnapshotNow,
} from '../lib/fs-sync';
import { exportProjectArchive, importProjectArchive } from '../lib/project-archive';
import { isTauri } from '../lib/platform';
import { errorMessage } from '../lib/error-message';
import { useProjectStore } from '../stores/projectStore';
import { useSettingsStore } from '../stores/settingsStore';
import { t } from '../lib/language-policy';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BackupModal({ open, onClose }: Props) {
  const { loadAllBooks } = useProjectStore();
  const locale = useSettingsStore((s) => s.generalPrefs.interfaceLocale);
  const [linkedFolder, setLinkedFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMsg(null);
      getLinkedFolderName().then(setLinkedFolder);
    }
  }, [open]);

  const fsSupported = isFsAccessSupported();
  const tauriDesktop = isTauri();

  const flash = (kind: 'ok' | 'err' | 'info', text: string) => setMsg({ kind, text });

  // ── A：手動匯出 ──
  const handleExport = async () => {
    setBusy(true);
    try {
      const snap = await exportSnapshot();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const result = await saveSnapshotAsJson(snap, `novel-generator-backup-${ts}.json`, locale);
      if (result.status === 'cancelled') {
        flash('info', t('backup.msgExportCancel', undefined, locale));
      } else if (result.path) {
        flash('ok', t('backup.msgExportOk', { path: result.path, desc: describeSnapshot(snap, locale) }, locale));
      } else {
        flash('ok', t('backup.msgExportOkWeb', { desc: describeSnapshot(snap, locale) }, locale));
      }
    } catch (err) {
      flash('err', t('backup.msgExportFail', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  // ── A：手動匯入 ──
  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm(t('backup.msgImportConfirm', undefined, locale))) return;
    setBusy(true);
    try {
      const snap = await readSnapshotFromFile(file, locale);
      await importSnapshot(snap, 'replace', locale);
      await loadAllBooks();
      flash('ok', t('backup.msgImportOk', { desc: describeSnapshot(snap, locale) }, locale));
    } catch (err) {
      flash('err', t('backup.msgImportFail', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  // ── E：連結資料夾 ──
  const handleExportProjectArchive = async () => {
    setBusy(true);
    try {
      const result = await exportProjectArchive(locale);
      if (!result) {
        flash('info', t('backup.msgZipExportCancel', undefined, locale));
        return;
      }
      const missing = result.missingFiles.length > 0
        ? t('backup.missingMedia', { count: result.missingFiles.length }, locale)
        : '';
      flash('ok', t('backup.msgZipExportOk', { path: result.path || '', desc: describeSnapshot(result.snapshot, locale), media: String(result.mediaFileCount), missing }, locale));
    } catch (err) {
      flash('err', t('backup.msgZipExportFail', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  const handleImportProjectArchive = async () => {
    if (!confirm(t('backup.msgZipImportConfirm', undefined, locale))) return;
    setBusy(true);
    try {
      const result = await importProjectArchive(locale);
      if (!result) {
        flash('info', t('backup.msgZipImportCancel', undefined, locale));
        return;
      }
      await loadAllBooks();
      const missing = result.missingFiles.length > 0
        ? t('backup.missingMediaAtExport', { count: result.missingFiles.length }, locale)
        : '';
      flash('ok', t('backup.msgZipImportOk', { desc: describeSnapshot(result.snapshot, locale), media: String(result.mediaFileCount), missing }, locale));
    } catch (err) {
      flash('err', t('backup.msgZipImportFail', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    setBusy(true);
    try {
      const handle = await pickAndLinkFolder(locale);
      if (!handle) { flash('info', t('backup.msgLinkCancel', undefined, locale)); return; }
      setLinkedFolder(handle.name);
      // 連結後立刻推一份
      await pushSnapshotNow();
      flash('ok', t('backup.msgLinkOk', { folder: handle.name }, locale));
    } catch (err) {
      flash('err', t('backup.msgLinkFail', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      const handle = await reactivateLinkedFolder();
      if (!handle) { flash('err', t('backup.msgReactivateFail', undefined, locale)); return; }
      flash('ok', t('backup.msgReactivateOk', { folder: handle.name }, locale));
    } finally {
      setBusy(false);
    }
  };

  const handlePushNow = async () => {
    setBusy(true);
    try {
      const ok = await pushSnapshotNow();
      flash(ok ? 'ok' : 'err', ok ? t('backup.msgPushOk', undefined, locale) : t('backup.msgPushFail', undefined, locale));
    } catch (err) {
      flash('err', t('backup.msgPushError', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  const handlePullNow = async () => {
    if (!confirm(t('backup.msgPullConfirm', undefined, locale))) return;
    setBusy(true);
    try {
      const ok = await pullSnapshotNow(locale);
      if (ok) {
        await loadAllBooks();
        flash('ok', t('backup.msgPullOk', undefined, locale));
      } else {
        flash('err', t('backup.msgPullNone', undefined, locale));
      }
    } catch (err) {
      flash('err', t('backup.msgPullFail', { error: errorMessage(err) }, locale));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(t('backup.msgUnlinkConfirm', undefined, locale))) return;
    await unlinkFolder();
    setLinkedFolder(null);
    flash('info', t('backup.msgUnlinkOk', undefined, locale));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('backup.title', undefined, locale)}
      width={520}
      footer={<Button variant="secondary" onClick={onClose}>{t('backup.close', undefined, locale)}</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* —— 手動匯出/匯入 —— */}
        <section>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('backup.manualTitle', undefined, locale)}</div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
            {t('backup.manualDesc', undefined, locale)}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={handleExport} disabled={busy}>{t('backup.exportAll', undefined, locale)}</Button>
            <Button variant="secondary" onClick={handleImportClick} disabled={busy}>{t('backup.importJson', undefined, locale)}</Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </section>

        <section>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('backup.zipTitle', undefined, locale)}</div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
            {t('backup.zipDesc', undefined, locale)}
          </p>
          {tauriDesktop ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={handleExportProjectArchive} disabled={busy}>{t('backup.exportZip', undefined, locale)}</Button>
              <Button variant="secondary" onClick={handleImportProjectArchive} disabled={busy}>{t('backup.importZip', undefined, locale)}</Button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('backup.zipWebTodo', undefined, locale)}
            </div>
          )}
        </section>

        {/* —— 同步資料夾 —— */}
        <section>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('backup.syncTitle', undefined, locale)}</div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
            {t('backup.syncDesc', undefined, locale)}
          </p>
          {!fsSupported ? (
            <div style={{ fontSize: 12, color: '#f87171' }}>
              {t('backup.syncNoFs', undefined, locale)}
            </div>
          ) : linkedFolder ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12 }}>
                {t('backup.syncLinked', { folder: linkedFolder }, locale)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={handlePushNow} disabled={busy}>{t('backup.syncPush', undefined, locale)}</Button>
                <Button variant="secondary" onClick={handlePullNow} disabled={busy}>{t('backup.syncPull', undefined, locale)}</Button>
                <Button variant="secondary" onClick={handleReactivate} disabled={busy}>{t('backup.syncReactivate', undefined, locale)}</Button>
                <Button variant="text" onClick={handleUnlink} disabled={busy}>{t('backup.syncUnlink', undefined, locale)}</Button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                {t('backup.syncHint', undefined, locale)}
              </p>
            </div>
          ) : (
            <Button variant="primary" onClick={handleLink} disabled={busy}>{t('backup.syncLinkBtn', undefined, locale)}</Button>
          )}
        </section>

        {/* —— 訊息 —— */}
        {msg && (
          <div
            style={{
              fontSize: 12,
              padding: '8px 10px',
              borderRadius: 4,
              background:
                msg.kind === 'ok' ? 'rgba(34,197,94,.12)' :
                msg.kind === 'err' ? 'rgba(248,113,113,.12)' :
                'rgba(148,163,184,.12)',
              color:
                msg.kind === 'ok' ? '#22c55e' :
                msg.kind === 'err' ? '#f87171' :
                'var(--text-secondary)',
            }}
          >
            {msg.text}
          </div>
        )}

        {/* —— 無痕模式提醒 —— */}
        <section style={{
          fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6,
          padding: '8px 10px', borderRadius: 4, background: 'var(--bg-secondary)',
        }} dangerouslySetInnerHTML={{ __html: t('backup.incognitoWarn', undefined, locale) }} />
      </div>
    </Modal>
  );
}
