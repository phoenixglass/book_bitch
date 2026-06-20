import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { BinderItem } from '../types';

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(html: string) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}

interface CardProps {
  item: BinderItem;
  parentId: string | null;
  index: number;
}

function IndexCard({ item, parentId, index }: CardProps) {
  const { binder, selectedId, selectItem, updateItem, moveItem } = useAppStore();
  const isSelected = selectedId === item.id;
  const words = wordCount(item.content);
  const [dropIndicator, setDropIndicator] = useState<'left' | 'right' | null>(null);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    setDropIndicator(relX < rect.width / 2 ? 'left' : 'right');
  }

  function findParentIndex(items: BinderItem[], id: string, pId: string | null = null): { parentId: string | null; index: number } | null {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) return { parentId: pId, index: i };
      const found = findParentIndex(items[i].children, id, items[i].id);
      if (found) return found;
    }
    return null;
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === item.id) {
      setDropIndicator(null);
      return;
    }

    const desiredIdx = dropIndicator === 'left' ? index : index + 1;
    const pos = findParentIndex(binder, draggedId);
    let insertIdx = desiredIdx;
    if (pos && pos.parentId === parentId && pos.index < desiredIdx) {
      insertIdx--;
    }
    moveItem(draggedId, parentId, Math.max(0, insertIdx));
    setDropIndicator(null);
  }

  const borderClass =
    dropIndicator === 'left'
      ? 'border-l-4 border-l-purple-500'
      : dropIndicator === 'right'
      ? 'border-r-4 border-r-purple-500'
      : '';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropIndicator(null)}
      onDrop={handleDrop}
      onClick={() => selectItem(item.id)}
      className={`rounded-lg border p-3 cursor-pointer transition-all flex flex-col gap-2 ${
        isSelected
          ? 'border-[#6b46c1] bg-[#2d1f5e] shadow-lg shadow-purple-900/30'
          : 'border-[#2d3748] bg-[#1e2640] hover:border-[#4a5568]'
      } ${borderClass}`}
      style={{ minHeight: '140px', width: '200px' }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-[#2d3748] pb-2">
        <span className="text-gray-600 cursor-grab text-xs" title="Drag to reorder">⠿</span>
        <span className="text-xs">📄</span>
        <span className="font-medium text-sm text-white truncate flex-1">
          {item.title}
        </span>
      </div>

      {/* Synopsis */}
      <textarea
        value={item.synopsis}
        onChange={(e) => updateItem(item.id, { synopsis: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="Synopsis..."
        className="flex-1 bg-transparent text-gray-300 text-xs resize-none outline-none placeholder-gray-600"
        rows={4}
      />

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{item.status}</span>
        <span>{words} w</span>
      </div>
    </div>
  );
}

interface FolderGroupProps {
  folder: BinderItem;
}

function FolderGroup({ folder }: FolderGroupProps) {
  const docs = folder.children.filter((c) => c.type === 'document');
  if (docs.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="text-gray-400 text-sm font-semibold mb-3 flex items-center gap-2">
        <span>📁</span> {folder.title}
      </h3>
      <div className="flex flex-wrap gap-4">
        {docs.map((doc, i) => (
          <IndexCard key={doc.id} item={doc} parentId={folder.id} index={i} />
        ))}
      </div>
    </div>
  );
}

export function Corkboard() {
  const { binder } = useAppStore();

  const foldersToShow = binder.filter((b) => b.type === 'folder');
  const allDocs = binder.flatMap((b) => b.type === 'document' ? [b] : []);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#12192c]">
      <div
        className="min-h-full rounded-xl p-6"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(107,70,193,0.05) 27px, rgba(107,70,193,0.05) 28px)',
        }}
      >
        {/* Root-level documents */}
        {allDocs.length > 0 && (
          <div className="mb-8">
            <h3 className="text-gray-400 text-sm font-semibold mb-3">
              Root Documents
            </h3>
            <div className="flex flex-wrap gap-4">
              {allDocs.map((doc, i) => (
                <IndexCard key={doc.id} item={doc} parentId={null} index={i} />
              ))}
            </div>
          </div>
        )}

        {foldersToShow.map((folder) => (
          <FolderGroup key={folder.id} folder={folder} />
        ))}

        {foldersToShow.length === 0 && allDocs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600">
            <div className="text-4xl mb-3">📌</div>
            <p>No documents to display.</p>
            <p className="text-xs mt-1">
              Select a folder in the binder or create documents.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
