import { useRef, useCallback, useEffect, type ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore';

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

  const handleMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

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
        aria-label="調整左側面板寬度"
      />
      <div className="right-pane">
        {right}
      </div>
    </div>
  );
}
