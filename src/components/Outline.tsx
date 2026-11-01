import { useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { BinderItem, Status } from '../types';
import { useStoredWidths } from '../hooks/useStoredWidths';
import { ResizeHandle } from './ResizeHandle';

type ColumnKey = 'title' | 'synopsis' | 'status' | 'words' | 'target';

const COLUMNS: { key: ColumnKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'title', label: 'Title', align: 'left' },
  { key: 'synopsis', label: 'Synopsis', align: 'left' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: 'words', label: 'Words', align: 'right' },
  { key: 'target', label: 'Target', align: 'right' },
];

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  title: 280,
  synopsis: 420,
  status: 140,
  words: 80,
  target: 90,
};

const WIDTH_LIMITS: Partial<Record<ColumnKey, { min?: number; max?: number }>> = {
  title: { min: 120, max: 1200 },
  synopsis: { min: 60, max: 2000 },
  status: { min: 60, max: 400 },
  words: { min: 50, max: 300 },
  target: { min: 50, max: 300 },
};

let measureCanvas: HTMLCanvasElement | null = null;
function textWidth(text: string, el: Element) {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return 0;
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText(text).width;
}

/** Natural width of a cell's content, ignoring the column's current width. */
function contentWidth(cell: HTMLElement): number {
  const cs = getComputedStyle(cell);
  const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const select = cell.querySelector('select');
  if (select) {
    const text = select.options[select.selectedIndex]?.text ?? '';
    return padding + textWidth(text, select) + 36; // arrow + inner padding
  }
  const input = cell.querySelector('input');
  if (input) {
    const text = input.value || input.placeholder || '';
    return padding + textWidth(text, input) + 8;
  }
  // Measure only the text itself: a Range over whole elements would also
  // report full-width block boxes (and the resize handle). Text-overflow
  // ellipsis is paint-only, so a truncated title still reports its full width.
  const range = document.createRange();
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  let right = -Infinity;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) right = Math.max(right, r.right);
  }
  if (right === -Infinity) return padding;
  const cellLeft = cell.getBoundingClientRect().left;
  return right - cellLeft + parseFloat(cs.paddingRight);
}

const STATUSES: Status[] = [
  'No Status',
  'To Do',
  'In Progress',
  'First Draft',
  'Revised Draft',
  'Final Draft',
  'Done',
];

const STATUS_COLORS: Record<string, string> = {
  'No Status': '#4a5568',
  'To Do': '#fc8181',
  'In Progress': '#f6ad55',
  'First Draft': '#f6e05e',
  'Revised Draft': '#68d391',
  'Final Draft': '#63b3ed',
  Done: '#b794f4',
};

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(html: string) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}

function findParentOf(
  items: BinderItem[],
  targetId: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === targetId) return { parentId, index: i };
    const found = findParentOf(items[i].children, targetId, items[i].id);
    if (found) return found;
  }
  return null;
}

interface RowProps {
  item: BinderItem;
  depth: number;
  parentId: string | null;
  index: number;
}

function OutlineRow({ item, depth, parentId, index }: RowProps) {
  const { binder, selectedId, selectItem, updateItem, toggleExpanded, moveItem } = useAppStore();
  const isSelected = selectedId === item.id;
  const words = wordCount(item.content);
  const [dropIndicator, setDropIndicator] = useState<'above' | 'below' | null>(null);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    setDropIndicator(relY < rect.height / 2 ? 'above' : 'below');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === item.id) {
      setDropIndicator(null);
      return;
    }

    const desiredIdx = dropIndicator === 'above' ? index : index + 1;
    const pos = findParentOf(binder, draggedId);
    let insertIdx = desiredIdx;
    if (pos && pos.parentId === parentId && pos.index < desiredIdx) {
      insertIdx--;
    }
    moveItem(draggedId, parentId, Math.max(0, insertIdx));
    setDropIndicator(null);
  }

  const rowBorderClass =
    dropIndicator === 'above'
      ? 'border-t-2 border-purple-500'
      : dropIndicator === 'below'
      ? 'border-b-2 border-purple-500'
      : '';

  return (
    <>
      <tr
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropIndicator(null)}
        onDrop={handleDrop}
        className={`border-b border-[#1e2a3a] cursor-pointer transition-colors ${
          isSelected ? 'bg-[#2d1f5e]' : 'hover:bg-[#1e2a3a]'
        } ${rowBorderClass}`}
        onClick={() => selectItem(item.id)}
      >
        {/* Title */}
        <td className="py-2 pr-3 text-sm text-white overflow-hidden" style={{ paddingLeft: `${depth * 20 + 12}px` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-gray-600 cursor-grab active:cursor-grabbing text-xs" title="Drag to reorder">⠿</span>
            {item.type === 'folder' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(item.id);
                }}
                className="shrink-0 text-xs opacity-60"
              >
                {item.expanded ? '▼' : '▶'}
              </button>
            )}
            <span className="shrink-0">{item.type === 'folder' ? '📁' : '📄'}</span>
            <span className="truncate min-w-0" title={item.title}>{item.title}</span>
          </div>
        </td>

        {/* Synopsis */}
        <td className="py-2 px-3 text-xs text-gray-400 overflow-hidden">
          <input
            value={item.synopsis}
            onChange={(e) => updateItem(item.id, { synopsis: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="—"
            className="bg-transparent outline-none w-full text-gray-400 placeholder-gray-600"
          />
        </td>

        {/* Status */}
        <td className="py-2 px-3 text-xs overflow-hidden">
          <select
            value={item.status}
            onChange={(e) =>
              updateItem(item.id, { status: e.target.value as Status })
            }
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a2e] text-xs rounded px-1 py-0.5 outline-none border border-[#2d3748] max-w-full"
            style={{ color: STATUS_COLORS[item.status] }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>

        {/* Word count */}
        <td className="py-2 px-3 text-xs text-gray-500 text-right overflow-hidden">
          {item.type === 'document' ? words : '—'}
        </td>

        {/* Word target */}
        <td className="py-2 px-3 text-xs text-gray-500 text-right overflow-hidden">
          {item.type === 'document' && (
            <input
              type="number"
              value={item.wordCountTarget || ''}
              onChange={(e) =>
                updateItem(item.id, {
                  wordCountTarget: parseInt(e.target.value) || 0,
                })
              }
              onClick={(e) => e.stopPropagation()}
              placeholder="—"
              className="bg-transparent outline-none w-full text-right text-gray-500 placeholder-gray-700"
            />
          )}
          {item.type === 'folder' && '—'}
        </td>
      </tr>

      {/* Children */}
      {item.type === 'folder' &&
        item.expanded &&
        item.children.map((child, i) => (
          <OutlineRow key={child.id} item={child} depth={depth + 1} parentId={item.id} index={i} />
        ))}
    </>
  );
}

export function Outline() {
  const { binder } = useAppStore();
  const tableRef = useRef<HTMLTableElement>(null);
  const { widths, setWidth, save, latest } = useStoredWidths<ColumnKey>(
    'book_bitch.outline.columnWidths',
    DEFAULT_WIDTHS,
    WIDTH_LIMITS,
  );
  const dragStart = useRef(0);
  const totalWidth = COLUMNS.reduce((sum, c) => sum + widths[c.key], 0);

  /** Double-click a divider: shrink/grow the column to fit its widest cell, like Explorer. */
  function autoFit(colIndex: number) {
    const table = tableRef.current;
    if (!table) return;
    let widest = 0;
    for (const row of Array.from(table.rows)) {
      const cell = row.cells[colIndex];
      if (cell) widest = Math.max(widest, contentWidth(cell));
    }
    setWidth(COLUMNS[colIndex].key, Math.ceil(widest) + 4);
    // setWidth is async; persist on the next frame once state has settled.
    requestAnimationFrame(save);
  }

  return (
    <div className="flex-1 overflow-auto bg-[#12192c]">
      <table
        ref={tableRef}
        className="border-collapse table-fixed"
        style={{ width: totalWidth, minWidth: totalWidth }}
      >
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: widths[c.key] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[#16213e] border-b border-[#0f3460]">
          <tr>
            {COLUMNS.map((c, i) => (
              <th
                key={c.key}
                className={`relative py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider select-none whitespace-nowrap ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                <span className="block truncate">{c.label}</span>
                <ResizeHandle
                  onDragStart={() => {
                    dragStart.current = latest.current[c.key];
                  }}
                  onDrag={(dx) => setWidth(c.key, dragStart.current + dx)}
                  onDragEnd={save}
                  onDoubleClick={() => autoFit(i)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {binder.map((item, i) => (
            <OutlineRow key={item.id} item={item} depth={0} parentId={null} index={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
