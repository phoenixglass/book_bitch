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
}

function IndexCard({ item }: CardProps) {
  const { selectedId, selectItem, updateItem } = useAppStore();
  const isSelected = selectedId === item.id;
  const words = wordCount(item.content);

  return (
    <div
      onClick={() => selectItem(item.id)}
      className={`rounded-lg border p-3 cursor-pointer transition-all flex flex-col gap-2 ${
        isSelected
          ? 'border-[#6b46c1] bg-[#2d1f5e] shadow-lg shadow-purple-900/30'
          : 'border-[#2d3748] bg-[#1e2640] hover:border-[#4a5568]'
      }`}
      style={{ minHeight: '140px', width: '200px' }}
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
        {docs.map((doc) => (
          <IndexCard key={doc.id} item={doc} />
        ))}
      </div>
    </div>
  );
}

export function Corkboard() {
  const { binder, selectedId, selectItem } = useAppStore();

  // Find the selected item; if it's a folder show its children as cards,
  // otherwise show all top-level folders' documents
  const selected = binder.find((b) => b.id === selectedId);
  const foldersToShow =
    selected?.type === 'folder'
      ? [selected]
      : binder.filter((b) => b.type === 'folder');

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

      {/* Suppress unused selectItem warning */}
      <span style={{ display: 'none' }} onClick={() => selectItem(null)} />
    </div>
  );
}
