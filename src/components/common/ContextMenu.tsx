import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 用 setTimeout 讓觸發本選單的 contextmenu 事件先結束，避免立即被關閉
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // 邊界檢查：避免選單溢出視窗
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 8);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ position: 'fixed', left: adjustedX, top: adjustedY, zIndex: 2000 }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={`context-menu-item${item.disabled ? ' disabled' : ''}`}
          onClick={() => {
            if (item.disabled) return;
            item.onClick();
            onClose();
          }}
        >
          {item.icon && <span style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
