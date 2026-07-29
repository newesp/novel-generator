import { useRef, useCallback, useEffect, type ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';

interface ResizablePaneProps {
  left: ReactNode;
  right: ReactNode;
  minWidth?: number;
  maxWidth?: number;
}

export function ResizablePane({
  left,
  right,
  minWidth = 240,
  maxWidth = 600,
}: ResizablePaneProps) {
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const containerRef = useRef<HTMLDivElement>(null);
  const { leftPaneWidth, setLeftPaneWidth } = useUIStore();
  const dragging = useRef(false);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const clampedWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
      setLeftPaneWidth(clampedWidth);
    },
    [setLeftPaneWidth, minWidth, maxWidth]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    []
  );

  useEffect(() => {
    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove]);

  return (
    <div ref={containerRef} className="layout">
      <div
        className="left-pane"
        style={{ width: leftPaneWidth, flex: `0 0 ${leftPaneWidth}px`, minWidth, maxWidth }}
      >
        {left}
      </div>
      <div
        className="resizer"
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('app.resizeLeftPane', undefined, locale)}
      />
      <div className="right-pane">
        {right}
      </div>
    </div>
  );
}
