import { useRef } from 'react';

interface Props {
  /** Called continuously while dragging with the pointer's horizontal travel since the drag began. */
  onDrag: (deltaX: number) => void;
  /** Called once when the drag starts, so the caller can remember the starting width. */
  onDragStart?: () => void;
  /** Called once when the drag ends (good moment to persist). */
  onDragEnd?: () => void;
  /** Double-click behaviour, e.g. auto-fit a column like Windows Explorer. */
  onDoubleClick?: () => void;
  /** Which edge of the positioned parent the handle sits on. */
  side?: 'left' | 'right';
  title?: string;
}

/**
 * A thin vertical grab strip on the edge of a column header or panel. The
 * parent must be `position: relative`. Uses pointer capture so the drag keeps
 * tracking even when the cursor leaves the strip (or the window).
 */
export function ResizeHandle({ onDrag, onDragStart, onDragEnd, onDoubleClick, side = 'right', title }: Props) {
  const startX = useRef<number | null>(null);

  function finish(e: React.PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return;
    startX.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.classList.remove('is-col-resizing');
    onDragEnd?.();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title ?? 'Drag to resize · double-click to auto-fit'}
      // Sits just inside the edge: panels use overflow:hidden, which would
      // clip any part of the grab strip hanging outside them.
      className={`col-resize-handle absolute top-0 bottom-0 z-10 w-[6px] ${
        side === 'right' ? 'right-0' : 'left-0 col-resize-handle--left'
      }`}
      // Don't let the drag start a row/item drag-and-drop or text selection.
      draggable={false}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        startX.current = e.clientX;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        document.body.classList.add('is-col-resizing');
        onDragStart?.();
      }}
      onPointerMove={(e) => {
        if (startX.current === null) return;
        onDrag(e.clientX - startX.current);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
    />
  );
}
