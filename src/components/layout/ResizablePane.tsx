import { useRef, useCallback, type ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore';

interface ResizablePaneProps {
  left: ReactNode;
  right: ReactNode;
}

export function ResizablePane({ left, right }: ResizablePaneProps) {
  const { leftPaneWidth, setLeftPaneWidth } = useUIStore();
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current) return;
      setLeftPaneWidth(e.clientX);
    },
    [setLeftPaneWidth]
  );

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return (
    <div className="layout" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      <div className="left-pane" style={{ width: leftPaneWidth }}>
        {left}
      </div>
      <div className="resizer" onMouseDown={onMouseDown} />
      <div className="right-pane">
        {right}
      </div>
    </div>
  );
}
