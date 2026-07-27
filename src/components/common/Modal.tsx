import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  fullScreen?: boolean;
  embedded?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  width = 480,
  fullScreen = false,
  embedded = false,
}: ModalProps) {
  if (!open) return null;

  const content = (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: embedded ? 0 : fullScreen ? 10 : 'var(--radius-xl)',
      padding: embedded ? 0 : fullScreen ? 16 : 24,
      width: embedded || fullScreen ? '100%' : width,
      height: embedded || fullScreen ? '100%' : undefined,
      maxWidth: embedded || fullScreen ? '100%' : '90vw',
      maxHeight: embedded || fullScreen ? '100%' : '85vh',
      overflowY: 'auto',
      boxShadow: embedded ? 'none' : '0 20px 50px rgba(0,0,0,0.5)',
      display: embedded ? 'flex' : undefined,
      flexDirection: embedded ? 'column' : undefined,
    }}>
      {!embedded && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 17,
          fontWeight: 600,
          marginBottom: 16,
        }}>
          <div>{title}</div>
          {headerExtra && <div style={{ marginLeft: 'auto' }}>{headerExtra}</div>}
        </div>
      )}
      <div className={embedded ? 'embedded-modal-content' : undefined}>{children}</div>
      {footer && (
        <div className={embedded ? 'embedded-modal-footer' : undefined} style={{
          marginTop: embedded ? 0 : 16,
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          {footer}
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: fullScreen ? 12 : 0,
        zIndex: 1000,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {content}
    </div>
  );
}
