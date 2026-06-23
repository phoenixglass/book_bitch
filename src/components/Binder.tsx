import { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { GoogleDriveUpload } from './GoogleDriveUpload';
import { ImportPreviewModal } from './ImportPreviewModal';
import { useDriveImport } from '../hooks/useDriveImport';
import { parseFile } from '../utils/documentParser';
import type { ParsedItem, SplitLevel } from '../utils/documentParser';
import type { BinderItem, ImportSourceMeta } from '../types';

const STATUS_COLORS: Record<string, string> = {
  'No Status': 'transparent',
  'To Do': '#fc8181',
  'In Progress': '#f6ad55',
  'First Draft': '#f6e05e',
  'Revised Draft': '#68d391',
  'Final Draft': '#63b3ed',
  'Done': '#b794f4',
};

function collectLeafDocs(item: BinderItem): BinderItem[] {
  if (item.type === 'document') return [item];
  return item.children.flatMap(collectLeafDocs);
}

function isItemInTrash(binder: BinderItem[], itemId: string): boolean {
  const trash = binder.find((item) => item.id === 'trash');
  if (!trash) return false;
  return trash.children.some((child) => child.id === itemId);
}

function findDraggedPosition(
  items: BinderItem[],
  id: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { parentId, index: i };
    const found = findDraggedPosition(items[i].children, id, items[i].id);
    if (found) return found;
  }
  return null;
}

interface BinderNodeProps {
  item: BinderItem;
  depth: number;
  parentId: string | null;
  index: number;
  onResync?: (folderId: string, driveFileId: string) => void;
  onResyncDoc?: (docId: string, driveFileId: string) => void;
}

function BinderNode({ item, depth, parentId, index, onResync, onResyncDoc }: BinderNodeProps) {
  const {
    selectedId,
    selectItem,
    toggleExpanded,
    addItem,
    updateItem,
    removeItem,
    emptyTrash,
    permanentlyDeleteItem,
    sendSceneToOmitted,
    sendSceneToFragments,
  } = useAppStore();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [dropIndicator, setDropIndicator] = useState<'above' | 'below' | 'inside' | null>(null);
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
    // Cross-section DnD data (readable by Fragments/Omitted drop zones)
    e.dataTransfer.setData(
      'application/x-bb-item',
      JSON.stringify({ type: 'scene', id: item.id, title: item.title }),
    );
    e.dataTransfer.setData('text/x-bb-type-scene', '1');
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId === item.id) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const pct = relY / rect.height;

    if (isFolder) {
      if (pct < 0.25) setDropIndicator('above');
      else if (pct > 0.75) setDropIndicator('below');
      else setDropIndicator('inside');
    } else {
      setDropIndicator(pct < 0.5 ? 'above' : 'below');
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropIndicator(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Check for cross-section DnD first
    try {
      const raw = e.dataTransfer.getData('application/x-bb-item');
      if (raw) {
        const { type, id } = JSON.parse(raw) as { type: string; id: string };
        const store = useAppStore.getState();
        const targetParentId = isFolder ? item.id : parentId;
        if (type === 'fragment') {
          store.moveFragmentToManuscript(id, targetParentId ?? 'manuscript');
          setDropIndicator(null);
          return;
        }
        if (type === 'omitted') {
          store.moveOmittedToManuscript(id, targetParentId ?? 'manuscript');
          setDropIndicator(null);
          return;
        }
      }
    } catch {
      // fall through to normal binder DnD
    }

    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === item.id) {
      setDropIndicator(null);
      return;
    }

    const store = useAppStore.getState();

    if (dropIndicator === 'inside' && isFolder) {
      store.moveItem(draggedId, item.id, item.children.length);
    } else {
      const desiredIdx = dropIndicator === 'above' ? index : index + 1;
      const pos = findDraggedPosition(store.binder, draggedId);
      let insertIdx = desiredIdx;
      if (pos && pos.parentId === parentId && pos.index < desiredIdx) {
        insertIdx--;
      }
      store.moveItem(draggedId, parentId, Math.max(0, insertIdx));
    }

    setDropIndicator(null);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    selectItem(item.id);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
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

  function handleSendToOmitted() {
    const reasonInput = window.prompt('Reason for omitting (optional):');
    if (reasonInput === null) return;
    if (item.type === 'document') {
      sendSceneToOmitted(item.id, reasonInput);
    } else {
      const leafDocs = collectLeafDocs(item);
      for (const doc of leafDocs) {
        useAppStore.getState().sendSceneToOmitted(doc.id, reasonInput);
      }
      permanentlyDeleteItem(item.id);
    }
    setShowContextMenu(false);
  }

  function handleSendToFragments() {
    if (item.type === 'document') {
      sendSceneToFragments(item.id);
    } else {
      const leafDocs = collectLeafDocs(item);
      for (const doc of leafDocs) {
        useAppStore.getState().sendSceneToFragments(doc.id);
      }
      permanentlyDeleteItem(item.id);
    }
    setShowContextMenu(false);
  }

  const indicatorClass =
    dropIndicator === 'above'
      ? 'border-t-2 border-purple-500'
      : dropIndicator === 'below'
      ? 'border-b-2 border-purple-500'
      : dropIndicator === 'inside'
      ? 'ring-2 ring-purple-500 ring-inset'
      : '';

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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
        } ${indicatorClass}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Drag handle */}
        <span className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing text-xs shrink-0" title="Drag to reorder">
          ⠿
        </span>

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

        {/* Status dot */}
        {item.status !== 'No Status' && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: STATUS_COLORS[item.status] }}
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
          {item.children.map((child, i) => (
            <BinderNode key={child.id} item={child} depth={depth + 1} parentId={item.id} index={i} onResync={onResync} onResyncDoc={onResyncDoc} />
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
            <>
              <button
                onClick={handleSendToOmitted}
                className="w-full text-left px-3 py-2 hover:bg-amber-800 hover:text-white transition-colors"
              >
                🗂 Send to Omitted Material
              </button>
              <button
                onClick={handleSendToFragments}
                className="w-full text-left px-3 py-2 hover:bg-purple-800 hover:text-white transition-colors"
              >
                🧩 Send to Fragments
              </button>
              <div className="border-t border-[#0f3460] my-1" />
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-2 hover:bg-[#6b46c1] hover:text-white transition-colors"
              >
                🗑️ Delete
              </button>
            </>
          )}
          {item.driveFileId && isFolder && onResync && (
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
          {item.driveFileId && !isFolder && onResyncDoc && (
            <button
              onClick={() => {
                onResyncDoc(item.id, item.driveFileId!);
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

interface BinderPendingImport {
  file: File;
  splitLevel: SplitLevel;
  parsedItems: ParsedItem[];
}

export function Binder() {
  const { binder, importToManuscript } = useAppStore();
  const { resyncDriveFolder, resyncDriveDoc } = useDriveImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<BinderPendingImport | null>(null);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    event.currentTarget.value = '';

    const splitLevel: SplitLevel = 1;
    const items = await parseFile(file, { splitLevel });

    if (items.length === 1 && !items[0].sourceHeading) {
      // Single item — import directly
      importToManuscript([{ title: items[0].title, content: items[0].content }]);
      return;
    }

    setPendingImport({ file, splitLevel, parsedItems: items });
  }

  async function handleChangeSplitLevel(level: SplitLevel) {
    if (!pendingImport) return;
    const items = await parseFile(pendingImport.file, { splitLevel: level });
    setPendingImport((prev) => prev ? { ...prev, splitLevel: level, parsedItems: items } : null);
  }

  function handleImportConfirm(
    items: ParsedItem[],
    section: 'manuscript' | 'fragments' | 'omitted',
  ) {
    const { file } = pendingImport!;
    const importSource: ImportSourceMeta = {
      fileName: file.name.replace(/\.[^/.]+$/, ''),
      fileType: file.name.split('.').pop() ?? 'txt',
      importedAt: Date.now(),
    };
    const store = useAppStore.getState();
    if (section === 'manuscript') {
      importToManuscript(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
    } else if (section === 'fragments') {
      store.importToFragments(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
      store.setArea('fragments');
    } else if (section === 'omitted') {
      store.importToOmitted(
        items.map((i) => ({
          ...i,
          reason: 'Imported as omitted material',
          importSource: { ...importSource, sourceHeading: i.sourceHeading },
        })),
      );
      store.setArea('omitted');
    }
    setPendingImport(null);
  }

  return (
    <>
      <div className="w-56 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#0f3460]">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Binder
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => useAppStore.getState().addItem(null, 'folder')}
              title="New Folder"
              className="text-xs text-gray-400 hover:text-white px-1"
            >
              📁+
            </button>
            <button
              onClick={() => useAppStore.getState().addItem(null, 'document')}
              title="New Document"
              className="text-xs text-gray-400 hover:text-white px-1"
            >
              📄+
            </button>
            <label
              title="Import document (.txt, .md, .html, .docx) — supports heading-based splitting"
              className="text-xs text-gray-400 hover:text-white px-1 cursor-pointer"
            >
              📥
              <input
                ref={fileInputRef}
                type="file"
                multiple={false}
                accept=".txt,.md,.html,.htm,.docx,.doc"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <GoogleDriveUpload />
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {binder.map((item, i) => (
            <BinderNode
              key={item.id}
              item={item}
              depth={0}
              parentId={null}
              index={i}
              onResync={resyncDriveFolder}
              onResyncDoc={resyncDriveDoc}
            />
          ))}
        </div>
      </div>

      {pendingImport && (
        <ImportPreviewModal
          key={pendingImport.splitLevel}
          fileName={pendingImport.file.name}
          fileType={pendingImport.file.name.split('.').pop() ?? 'file'}
          parsedItems={pendingImport.parsedItems}
          splitLevel={pendingImport.splitLevel}
          defaultSection="manuscript"
          canChangeSplitLevel={
            pendingImport.file.name.endsWith('.docx') ||
            pendingImport.file.name.endsWith('.doc') ||
            pendingImport.file.name.endsWith('.md') ||
            pendingImport.file.name.endsWith('.html') ||
            pendingImport.file.name.endsWith('.htm')
          }
          onChangeSplitLevel={handleChangeSplitLevel}
          onConfirm={handleImportConfirm}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </>
  );
}

