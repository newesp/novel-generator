import { useEffect, useRef, useState } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import {
  exportSnapshot,
  importSnapshot,
  downloadSnapshotAsJson,
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
import { useProjectStore } from '../stores/projectStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BackupModal({ open, onClose }: Props) {
  const { loadAllBooks } = useProjectStore();
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

  const flash = (kind: 'ok' | 'err' | 'info', text: string) => setMsg({ kind, text });

  // ── A：手動匯出 ──
  const handleExport = async () => {
    setBusy(true);
    try {
      const snap = await exportSnapshot();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadSnapshotAsJson(snap, `novel-generator-backup-${ts}.json`);
      flash('ok', `已下載：${describeSnapshot(snap)}`);
    } catch (err) {
      flash('err', `匯出失敗：${(err as Error).message}`);
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
    if (!confirm('匯入會「取代」目前本機所有書本資料，確定繼續？')) return;
    setBusy(true);
    try {
      const snap = await readSnapshotFromFile(file);
      await importSnapshot(snap, 'replace');
      await loadAllBooks();
      flash('ok', `匯入完成：${describeSnapshot(snap)}`);
    } catch (err) {
      flash('err', `匯入失敗：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── E：連結資料夾 ──
  const handleLink = async () => {
    setBusy(true);
    try {
      const handle = await pickAndLinkFolder();
      if (!handle) { flash('info', '已取消'); return; }
      setLinkedFolder(handle.name);
      // 連結後立刻推一份
      await pushSnapshotNow();
      flash('ok', `已連結資料夾「${handle.name}」並寫入備份檔`);
    } catch (err) {
      flash('err', `連結失敗：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      const handle = await reactivateLinkedFolder();
      if (!handle) { flash('err', '權限請求失敗或已失效，請重新連結'); return; }
      flash('ok', `已恢復連結「${handle.name}」`);
    } finally {
      setBusy(false);
    }
  };

  const handlePushNow = async () => {
    setBusy(true);
    try {
      const ok = await pushSnapshotNow();
      flash(ok ? 'ok' : 'err', ok ? '已寫入同步資料夾' : '寫入失敗 — 請確認資料夾連結');
    } catch (err) {
      flash('err', `寫入失敗：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePullNow = async () => {
    if (!confirm('從同步資料夾還原會「取代」目前本機所有書本資料，確定繼續？')) return;
    setBusy(true);
    try {
      const ok = await pullSnapshotNow();
      if (ok) {
        await loadAllBooks();
        flash('ok', '已從同步資料夾還原');
      } else {
        flash('err', '同步資料夾沒有備份檔，無法還原');
      }
    } catch (err) {
      flash('err', `還原失敗：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('解除連結後將不再自動同步（資料夾中的檔案保留），確定？')) return;
    await unlinkFolder();
    setLinkedFolder(null);
    flash('info', '已解除連結');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="💾 備份與同步"
      width={520}
      footer={<Button variant="secondary" onClick={onClose}>關閉</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* —— 手動匯出/匯入 —— */}
        <section>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>📦 手動備份</div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
            匯出單一 JSON 檔，可保存或在其他電腦/瀏覽器匯入。所有瀏覽器都支援。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={handleExport} disabled={busy}>📤 匯出全部</Button>
            <Button variant="secondary" onClick={handleImportClick} disabled={busy}>📥 匯入 JSON</Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </section>

        {/* —— 同步資料夾 —— */}
        <section>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>🔗 同步資料夾（自動寫入）</div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px', lineHeight: 1.6 }}>
            連結一個本機資料夾，App 會在每次資料變動 2 秒後自動寫入 <code>novel-generator-backup.json</code>。
            若把資料夾選在 OneDrive / Google Drive / iCloud 同步資料夾，即可跨機使用。
          </p>
          {!fsSupported ? (
            <div style={{ fontSize: 12, color: '#f87171' }}>
              ⚠ 此瀏覽器不支援 File System Access API（請改用 Chrome / Edge / Opera）
            </div>
          ) : linkedFolder ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12 }}>
                ✓ 已連結：<code>{linkedFolder}</code>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={handlePushNow} disabled={busy}>⬆ 立刻推送</Button>
                <Button variant="secondary" onClick={handlePullNow} disabled={busy}>⬇ 從資料夾還原</Button>
                <Button variant="secondary" onClick={handleReactivate} disabled={busy}>🔑 恢復權限</Button>
                <Button variant="text" onClick={handleUnlink} disabled={busy}>✕ 解除連結</Button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                提示：開新分頁/重啟瀏覽器後，第一次寫入時瀏覽器可能會請求權限；若被拒絕，按「🔑 恢復權限」重新授權。
              </p>
            </div>
          ) : (
            <Button variant="primary" onClick={handleLink} disabled={busy}>選擇資料夾連結…</Button>
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
        }}>
          ℹ️ <b>無痕模式</b>：瀏覽器關閉時會清除所有本機儲存（含資料夾連結），這是瀏覽器規範行為，無法繞過。
          建議於無痕模式關閉前先「📤 匯出全部」，下次開啟再「📥 匯入 JSON」。
        </section>
      </div>
    </Modal>
  );
}
