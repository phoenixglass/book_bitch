import { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { GoogleDriveUpload } from './GoogleDriveUpload';
import { useDriveImport } from '../hooks/useDriveImport';
import type { BinderItem } from '../types';
import mammoth from 'mammoth';

const LABEL_COLORS: Record<string, string> = {
  none: 'transparent',
  red: '#fc8181',
  orange: '#f6ad55',
  yellow: '#f6e05e',
  green: '#68d391',
  blue: '#63b3ed',
  purple: '#b794f4',
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
}

function BinderNode({ item, depth, parentId, index, onResync }: BinderNodeProps) {
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
          {item.children.map((child, i) => (
            <BinderNode key={child.id} item={child} depth={depth + 1} parentId={item.id} index={i} onResync={onResync} />
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
  const { binder, addItem, updateItem } = useAppStore();
  const { resyncDriveFolder } = useDriveImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.currentTarget.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      let content = '';

      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        content = result.value;
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const raw = await file.text();
        // Extract body content if it's a full HTML document
        const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        content = bodyMatch ? bodyMatch[1] : raw;
      } else if (file.name.endsWith('.md')) {
        const raw = await file.text();
        content = markdownToHtml(raw);
      } else {
        // .txt and other plain text
        const raw = await file.text();
        content = raw
          .split(/\n\n+/)
          .map((para) => `<p>${para.replace(/\n/g, '<br>').trim()}</p>`)
          .filter((p) => p !== '<p></p>')
          .join('');
      }

      addItem(null, 'document');
      const newId = useAppStore.getState().selectedId;
      if (newId) {
        updateItem(newId, { content, title: fileName });
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
            title="Upload file from computer (.txt, .md, .html, .docx)"
            className="text-xs text-gray-400 hover:text-white px-1 cursor-pointer"
          >
            ⬆️
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.html,.htm,.docx"
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
          <BinderNode key={item.id} item={item} depth={0} parentId={null} index={i} onResync={resyncDriveFolder} />
        ))}
      </div>
    </div>
  );
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let listType = '';

  function flushList() {
    if (inList) {
      out.push(`</${listType}>`);
      inList = false;
      listType = '';
    }
  }

  for (const line of lines) {
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    const ul = line.match(/^[-*+] (.+)/);
    const ol = line.match(/^\d+\. (.+)/);
    const hr = line.match(/^---+$/);
    const blockquote = line.match(/^> (.+)/);

    if (h1) { flushList(); out.push(`<h1>${inlineMarkdown(h1[1])}</h1>`); }
    else if (h2) { flushList(); out.push(`<h2>${inlineMarkdown(h2[1])}</h2>`); }
    else if (h3) { flushList(); out.push(`<h3>${inlineMarkdown(h3[1])}</h3>`); }
    else if (ul) {
      if (!inList || listType !== 'ul') { flushList(); out.push('<ul>'); inList = true; listType = 'ul'; }
      out.push(`<li>${inlineMarkdown(ul[1])}</li>`);
    }
    else if (ol) {
      if (!inList || listType !== 'ol') { flushList(); out.push('<ol>'); inList = true; listType = 'ol'; }
      out.push(`<li>${inlineMarkdown(ol[1])}</li>`);
    }
    else if (hr) { flushList(); out.push('<hr>'); }
    else if (blockquote) { flushList(); out.push(`<blockquote>${inlineMarkdown(blockquote[1])}</blockquote>`); }
    else if (line.trim() === '') { flushList(); }
    else { flushList(); out.push(`<p>${inlineMarkdown(line)}</p>`); }
  }

  flushList();
  return out.join('');
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
