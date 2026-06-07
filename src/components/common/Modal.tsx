import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  fullScreen?: boolean;
}

export function Modal({ open, onClose, title, children, footer, width = 480, fullScreen = false }: ModalProps) {
  if (!open) return null;
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
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: fullScreen ? 10 : 'var(--radius-xl)',
        padding: fullScreen ? 16 : 24,
        width: fullScreen ? '100%' : width,
        height: fullScreen ? '100%' : undefined,
        maxWidth: fullScreen ? '100%' : '90vw',
        maxHeight: fullScreen ? '100%' : '85vh',
        overflowY: 'auto',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>{title}</div>
        <div>{children}</div>
        {footer && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
