import { useState, useRef, Fragment } from 'react';
import { useAppStore } from '../store/appStore';
import { findItem } from '../store/appStore';
import { GoogleDriveUpload } from './GoogleDriveUpload';
import { useDriveImport } from '../hooks/useDriveImport';
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

interface DropZoneProps {
  parentId: string | null;
  index: number;
}

function DropZone({ parentId, index }: DropZoneProps) {
  const [active, setActive] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActive(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;

    const store = useAppStore.getState();
    const siblings =
      parentId === null
        ? store.binder
        : (findItem(store.binder, parentId)?.children ?? []);

    const currentIdx = siblings.findIndex((c) => c.id === draggedId);
    const insertIdx =
      currentIdx !== -1 && currentIdx < index ? index - 1 : index;

    if (insertIdx !== currentIdx) {
      store.moveItem(draggedId, parentId, insertIdx);
    }
  }

  return (
    <div
      className="px-2 py-1"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={handleDrop}
    >
      <div
        className={`h-0.5 rounded-full transition-colors duration-100 ${
          active ? 'bg-[#6b46c1]' : 'bg-transparent'
        }`}
      />
    </div>
  );
}

function isItemInTrash(binder: BinderItem[], itemId: string): boolean {
  const trash = binder.find((item) => item.id === 'trash');
  if (!trash) return false;
  return trash.children.some((child) => child.id === itemId);
}

interface BinderNodeProps {
  item: BinderItem;
  depth: number;
  onResync?: (folderId: string, driveFileId: string) => void;
}

function BinderNode({ item, depth, onResync }: BinderNodeProps) {
  const {
    selectedId,
    selectItem,
    toggleExpanded,
    addItem,
    updateItem,
    removeItem,
    emptyTrash,
    permanentlyDeleteItem,
  } = useAppStore();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [dragOver, setDragOver] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

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

  function handleContextMenu(e: React.MouseEvent) {
    console.log('Context menu triggered on:', item.title);
    e.preventDefault();
    e.stopPropagation();
    selectItem(item.id);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    console.log('Menu should be visible now');
  }

  function handleDelete() {
    if (item.id === 'trash') {
      emptyTrash();
    } else {
      removeItem(item.id);
    }
    setShowContextMenu(false);
  }

  function handlePermanentDelete() {
    permanentlyDeleteItem(item.id);
    setShowContextMenu(false);
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
        onContextMenu={handleContextMenu}
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
        <span className="text-xs">
          {isFolder ? '📁' : '📄'}
          {item.driveFileId && <span title="Linked to Google Drive">☁️</span>}
        </span>

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
          <DropZone parentId={item.id} index={0} />
          {item.children.map((child, i) => (
            <Fragment key={child.id}>
              <BinderNode item={child} depth={depth + 1} onResync={onResync} />
              <DropZone parentId={item.id} index={i + 1} />
            </Fragment>
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

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="fixed bg-[#2d3748] border border-[#0f3460] rounded text-xs text-gray-200 shadow-lg z-50"
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px`, minWidth: '150px' }}
          onClick={(e) => e.stopPropagation()}
        >
          {item.id === 'trash' && item.children.length > 0 && (
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-2 hover:bg-red-600 hover:text-white transition-colors"
            >
              🗑️ Empty Trash
            </button>
          )}
          {isItemInTrash(useAppStore.getState().binder, item.id) && (
            <button
              onClick={handlePermanentDelete}
              className="w-full text-left px-3 py-2 hover:bg-red-600 hover:text-white transition-colors"
            >
              ⚠️ Delete Permanently
            </button>
          )}
          {item.id !== 'trash' && !isItemInTrash(useAppStore.getState().binder, item.id) && (
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-2 hover:bg-[#6b46c1] hover:text-white transition-colors"
            >
              🗑️ Delete
            </button>
          )}
          {item.driveFileId && onResync && (
            <button
              onClick={() => {
                onResync(item.id, item.driveFileId!);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#2b6cb0] hover:text-white transition-colors"
            >
              🔄 Re-sync from Drive
            </button>
          )}
        </div>
      )}

      {/* Close menu on outside click */}
      {showContextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowContextMenu(false)}
        />
      )}
    </div>
  );
}

export function Binder() {
  const { binder, addItem, updateItem, selectItem } = useAppStore();
  const { resyncDriveFolder } = useDriveImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.currentTarget.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();

      addItem(null, 'document');
      const lastBinder = useAppStore.getState().binder;
      const lastDoc = lastBinder[lastBinder.length - 1];
      if (lastDoc && lastDoc.id !== 'trash') {
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        updateItem(lastDoc.id, { content: text, title: fileName });
        selectItem(lastDoc.id);
      }
    }
    event.currentTarget.value = '';
  }

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
          <label
            title="Upload file from computer"
            className="text-xs text-gray-400 hover:text-white px-1 cursor-pointer"
          >
            ⬆️
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.html"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <GoogleDriveUpload />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        <DropZone parentId={null} index={0} />
        {binder.map((item, i) => (
          <Fragment key={item.id}>
            <BinderNode item={item} depth={0} onResync={resyncDriveFolder} />
            <DropZone parentId={null} index={i + 1} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
