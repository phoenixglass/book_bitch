import { useState, Fragment } from 'react';
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
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

function IndexCard({ item, isDragging, onDragStart, onDragOver, onDragEnd }: CardProps) {
  const { selectedId, selectItem, updateItem } = useAppStore();
  const isSelected = selectedId === item.id;
  const words = wordCount(item.content);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onClick={() => selectItem(item.id)}
      className={`rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all flex flex-col gap-2 ${
        isSelected
          ? 'border-[#6b46c1] bg-[#2d1f5e] shadow-lg shadow-purple-900/30'
          : 'border-[#2d3748] bg-[#1e2640] hover:border-[#4a5568]'
      }`}
      style={{ minHeight: '140px', width: '200px', opacity: isDragging ? 0.35 : 1 }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-[#2d3748] pb-2">
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

function DropPlaceholder() {
  return (
    <div
      className="rounded-lg border-2 border-dashed border-[#6b46c1] bg-[#6b46c1]/10"
      style={{ minHeight: '140px', width: '200px' }}
    />
  );
}

interface FolderGroupProps {
  folder: BinderItem;
}

function FolderGroup({ folder }: FolderGroupProps) {
  const { moveItem } = useAppStore();
  const docs = folder.children.filter((c) => c.type === 'document');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  // dropBeforeId: the doc ID before which we'll insert; 'END' to append
  const [dropBeforeId, setDropBeforeId] = useState<string | 'END' | null>(null);

  if (docs.length === 0) return null;

  function handleCardDragOver(e: React.DragEvent<HTMLDivElement>, docId: string) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width / 2) {
      setDropBeforeId(docId);
    } else {
      const idx = docs.findIndex((d) => d.id === docId);
      const next = docs[idx + 1];
      setDropBeforeId(next ? next.id : 'END');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
    if (!draggedId || dropBeforeId === null) {
      setDraggingId(null);
      setDropBeforeId(null);
      return;
    }

    let targetIdx: number;
    if (dropBeforeId === 'END') {
      const lastDoc = docs[docs.length - 1];
      const lastDocIdx = folder.children.findIndex((c) => c.id === lastDoc?.id);
      targetIdx = lastDocIdx !== -1 ? lastDocIdx + 1 : folder.children.length;
    } else {
      targetIdx = folder.children.findIndex((c) => c.id === dropBeforeId);
      if (targetIdx === -1) targetIdx = folder.children.length;
    }

    // Adjust index when moving forward within the same parent
    const currentIdx = folder.children.findIndex((c) => c.id === draggedId);
    const adjustedIdx = currentIdx !== -1 && currentIdx < targetIdx ? targetIdx - 1 : targetIdx;

    if (adjustedIdx !== currentIdx) {
      moveItem(draggedId, folder.id, adjustedIdx);
    }

    setDraggingId(null);
    setDropBeforeId(null);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropBeforeId(null);
    }
  }

  return (
    <div className="mb-8">
      <h3 className="text-gray-400 text-sm font-semibold mb-3 flex items-center gap-2">
        <span>📁</span> {folder.title}
      </h3>
      <div
        className="flex flex-wrap gap-4"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
      >
        {docs.map((doc) => (
          <Fragment key={doc.id}>
            {dropBeforeId === doc.id && doc.id !== draggingId && <DropPlaceholder />}
            <IndexCard
              item={doc}
              isDragging={doc.id === draggingId}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', doc.id);
                setDraggingId(doc.id);
              }}
              onDragOver={(e) => handleCardDragOver(e, doc.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDropBeforeId(null);
              }}
            />
          </Fragment>
        ))}
        {dropBeforeId === 'END' && <DropPlaceholder />}
      </div>
    </div>
  );
}

export function Corkboard() {
  const { binder } = useAppStore();

  const foldersToShow = binder.filter((b) => b.type === 'folder');

  const allDocs = binder.flatMap((b) =>
    b.type === 'document' ? [b] : [],
  );

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
              {allDocs.map((doc) => (
                <IndexCard key={doc.id} item={doc} />
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
