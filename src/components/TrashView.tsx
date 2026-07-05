import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { BackupNagDialog } from './BackupNagDialog';
import type { BinderItem } from '../types';

type TrashTab = 'all' | 'manuscript' | 'fragments' | 'omitted' | 'research';

export function TrashView() {
  const {
    binder,
    fragments,
    omittedMaterial,
    researchEntries,
    // Binder trash
    emptyTrash,
    permanentlyDeleteItem,
    // move binder item out of trash
    moveItem,
    // Fragment trash
    restoreFragmentFromTrash,
    permanentlyDeleteFragment,
    // Omitted trash
    restoreOmittedFromTrash,
    permanentlyDeleteOmitted,
    // Research trash
    restoreResearchEntryFromTrash,
    permanentlyDeleteResearchEntry,
    setArea,
  } = useAppStore();

  const [tab, setTab] = useState<TrashTab>('all');
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);

  // Binder trash children
  const trashFolder = binder.find((b) => b.id === 'trash');
  const binderTrash: BinderItem[] = trashFolder?.children ?? [];

  // Fragment trash
  const fragTrash = fragments.filter((f) => f.trashedAt);

  // Omitted trash
  const omittedTrash = omittedMaterial.filter((o) => o.trashedAt);

  // Research trash
  const researchTrash = researchEntries.filter((r) => r.trashedAt);

  const totalCount = binderTrash.length + fragTrash.length + omittedTrash.length + researchTrash.length;

  function handleRestoreBinder(item: BinderItem) {
    // Move from trash folder to manuscript root
    moveItem(item.id, 'manuscript', 9999);
    setArea('manuscript');
  }

  function handlePermanentDeleteBinder(item: BinderItem) {
    if (confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) {
      permanentlyDeleteItem(item.id);
    }
  }

  function confirmEmptyAll() {
    setConfirmEmptyOpen(false);
    emptyTrash();
    for (const f of fragTrash) permanentlyDeleteFragment(f.id);
    for (const o of omittedTrash) permanentlyDeleteOmitted(o.id);
    for (const r of researchTrash) permanentlyDeleteResearchEntry(r.id);
  }

  const TABS: { id: TrashTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'manuscript', label: 'Manuscript', count: binderTrash.length },
    { id: 'fragments', label: 'Fragments', count: fragTrash.length },
    { id: 'omitted', label: 'Omitted', count: omittedTrash.length },
    { id: 'research', label: 'Research', count: researchTrash.length },
  ];

  const showBinder = tab === 'all' || tab === 'manuscript';
  const showFrags = tab === 'all' || tab === 'fragments';
  const showOmitted = tab === 'all' || tab === 'omitted';
  const showResearch = tab === 'all' || tab === 'research';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#0d1117]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#0f3460] shrink-0 flex items-center gap-3">
        <span className="text-lg">🗑</span>
        <div>
          <h2 className="text-sm font-semibold text-white">Trash</h2>
          <p className="text-xs text-gray-500">
            {totalCount} item{totalCount !== 1 ? 's' : ''} — nothing is permanently deleted until you say so
          </p>
        </div>
        <div className="flex-1" />
        {totalCount > 0 && (
          <button
            onClick={() => setConfirmEmptyOpen(true)}
            className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700 px-3 py-1 rounded transition-colors"
          >
            Empty Trash
          </button>
        )}
        {confirmEmptyOpen && (
          <BackupNagDialog
            title="Empty Trash?"
            message={`Permanently delete all ${totalCount} trashed item${totalCount !== 1 ? 's' : ''}? This cannot be undone.`}
            confirmLabel="Empty Trash"
            onCancel={() => setConfirmEmptyOpen(false)}
            onConfirm={confirmEmptyAll}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="px-5 flex gap-2 border-b border-[#0f3460] shrink-0 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors ${
              tab === t.id
                ? 'bg-[#16213e] text-white border border-[#0f3460] border-b-transparent -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1 rounded text-[10px] ${tab === t.id ? 'bg-[#6b46c1] text-white' : 'bg-[#2d3748] text-gray-400'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
            <span className="text-5xl">🗑</span>
            <p className="text-sm">Trash is empty.</p>
          </div>
        )}

        {/* Manuscript items */}
        {showBinder && binderTrash.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>📖</span> Manuscript Items
            </h3>
            <div className="space-y-1">
              {binderTrash.map((item) => (
                <TrashCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.type === 'folder' ? 'Folder' : 'Scene'}
                  badge="manuscript"
                  wordCount={item.content ? item.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length : 0}
                  onRestore={() => handleRestoreBinder(item)}
                  onDelete={() => handlePermanentDeleteBinder(item)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Fragment items */}
        {showFrags && fragTrash.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>🧩</span> Fragments
            </h3>
            <div className="space-y-1">
              {fragTrash.map((frag) => (
                <TrashCard
                  key={frag.id}
                  title={frag.title}
                  subtitle={frag.fragmentType.replace(/_/g, ' ')}
                  badge="fragment"
                  wordCount={frag.content ? frag.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length : 0}
                  trashedAt={frag.trashedAt}
                  onRestore={() => {
                    restoreFragmentFromTrash(frag.id);
                    setArea('fragments');
                  }}
                  onDelete={() => {
                    if (confirm(`Permanently delete "${frag.title}"? Cannot be undone.`)) {
                      permanentlyDeleteFragment(frag.id);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Omitted items */}
        {showOmitted && omittedTrash.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>🗂️</span> Omitted Material
            </h3>
            <div className="space-y-1">
              {omittedTrash.map((item) => (
                <TrashCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.omissionStatus.replace(/_/g, ' ')}
                  badge="omitted"
                  wordCount={item.content ? item.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length : 0}
                  trashedAt={item.trashedAt}
                  onRestore={() => {
                    restoreOmittedFromTrash(item.id);
                    setArea('omitted');
                  }}
                  onDelete={() => {
                    if (confirm(`Permanently delete "${item.title}"? Cannot be undone.`)) {
                      permanentlyDeleteOmitted(item.id);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Research items */}
        {showResearch && researchTrash.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>🔬</span> Research
            </h3>
            <div className="space-y-1">
              {researchTrash.map((entry) => (
                <TrashCard
                  key={entry.id}
                  title={entry.title}
                  subtitle={entry.researchType.replace(/_/g, ' ')}
                  badge="research"
                  wordCount={entry.content ? entry.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length : 0}
                  trashedAt={entry.trashedAt}
                  onRestore={() => {
                    restoreResearchEntryFromTrash(entry.id);
                    setArea('research');
                  }}
                  onDelete={() => {
                    if (confirm(`Permanently delete "${entry.title}"? Cannot be undone.`)) {
                      permanentlyDeleteResearchEntry(entry.id);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const BADGE_COLORS = {
  manuscript: 'bg-blue-900/40 text-blue-300',
  fragment: 'bg-purple-900/40 text-purple-300',
  omitted: 'bg-amber-900/40 text-amber-300',
  research: 'bg-teal-900/40 text-teal-300',
};

function TrashCard({
  title,
  subtitle,
  badge,
  wordCount,
  trashedAt,
  onRestore,
  onDelete,
}: {
  title: string;
  subtitle: string;
  badge: keyof typeof BADGE_COLORS;
  wordCount: number;
  trashedAt?: number;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-[#16213e] border border-[#0f3460] rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white truncate">{title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${BADGE_COLORS[badge]}`}>
            {badge}
          </span>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
          <span>{subtitle}</span>
          {wordCount > 0 && <span>· {wordCount}w</span>}
          {trashedAt && (
            <span>· Trashed {new Date(trashedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onRestore}
          className="text-xs px-2 py-1 bg-green-900/20 text-green-400 hover:bg-green-900/40 rounded transition-colors"
        >
          Restore
        </button>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
