import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { BinderItem } from '../types';

const LABEL_COLORS: Record<string, string> = {
  none: 'transparent',
  red: '#fc8181',
  orange: '#f6ad55',
  yellow: '#f6e05e',
  green: '#68d391',
  blue: '#63b3ed',
  purple: '#b794f4',
};

interface BinderNodeProps {
  item: BinderItem;
  depth: number;
}

function BinderNode({ item, depth }: BinderNodeProps) {
  const {
    selectedId,
    selectItem,
    toggleExpanded,
    addItem,
    updateItem,
  } = useAppStore();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [dragOver, setDragOver] = useState(false);

  const isSelected = selectedId === item.id;
  const isFolder = item.type === 'folder';

  function handleRename() {
    updateItem(item.id, { title: editTitle || 'Untitled' });
    setEditing(false);
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', item.id);
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== item.id && isFolder) {
      useAppStore
        .getState()
        .moveItem(draggedId, item.id, item.children.length);
    }
  }

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={(e) => {
          e.preventDefault();
          if (isFolder) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => selectItem(item.id)}
        onDoubleClick={() => {
          setEditTitle(item.title);
          setEditing(true);
        }}
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer rounded text-sm select-none transition-colors ${
          isSelected
            ? 'bg-[#6b46c1] text-white'
            : 'text-gray-300 hover:bg-[#2d3748]'
        } ${dragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand toggle */}
        {isFolder ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(item.id);
            }}
            className="w-4 text-center text-xs opacity-70"
          >
            {item.expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        <span className="text-xs">{isFolder ? '📁' : '📄'}</span>

        {/* Label dot */}
        {item.label !== 'none' && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: LABEL_COLORS[item.label] }}
          />
        )}

        {/* Title */}
        {editing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setEditTitle(item.title);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#2d3748] text-white text-sm px-1 rounded outline-none w-full"
          />
        ) : (
          <span className="truncate flex-1">{item.title}</span>
        )}

        {/* Add child button (folders only) */}
        {isFolder && isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              addItem(item.id, 'document');
            }}
            title="Add document"
            className="ml-auto text-xs opacity-70 hover:opacity-100 hover:text-green-400"
          >
            +
          </button>
        )}
      </div>

      {/* Children */}
      {isFolder && item.expanded && (
        <div>
          {item.children.map((child) => (
            <BinderNode key={child.id} item={child} depth={depth + 1} />
          ))}
          {item.children.length === 0 && (
            <div
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              className="text-xs text-gray-600 py-1 italic"
            >
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Binder() {
  const { binder, addItem } = useAppStore();

  return (
    <div className="w-56 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#0f3460]">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Binder
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => addItem(null, 'folder')}
            title="New Folder"
            className="text-xs text-gray-400 hover:text-white px-1"
          >
            📁+
          </button>
          <button
            onClick={() => addItem(null, 'document')}
            title="New Document"
            className="text-xs text-gray-400 hover:text-white px-1"
          >
            📄+
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {binder.map((item) => (
          <BinderNode key={item.id} item={item} depth={0} />
        ))}
      </div>
    </div>
  );
}
