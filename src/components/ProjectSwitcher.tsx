import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useSyncContext } from './SyncProvider';
import { BackupNagDialog } from './BackupNagDialog';

export function ProjectSwitcher() {
  const { user, projects, switchProject, createNewProject, removeProject } = useSyncContext();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;

  async function handleSwitch(id: string) {
    if (id === activeProjectId || busy) return;
    setBusy(true);
    try {
      await switchProject(id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createNewProject(name);
      setNewName('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(id: string, name: string) {
    if (busy) return;
    setDeleteTarget({ id, name });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    setBusy(true);
    try {
      await removeProject(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch or manage projects"
        className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
      >
        📁 {projects.length > 1 ? `${projects.length} books` : ''}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-2xl z-50 py-1 text-sm">
          <div className="max-h-64 overflow-y-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-1 px-3 py-1.5 hover:bg-[#2d3748] cursor-pointer ${
                  p.id === activeProjectId ? 'text-purple-400' : 'text-gray-200'
                }`}
                onClick={() => handleSwitch(p.id)}
              >
                <span className="flex-1 truncate">{p.id === activeProjectId ? '✓ ' : ''}{p.name}</span>
                {projects.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                    title="Delete project"
                    className="text-gray-500 hover:text-red-400 px-1"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 mt-1 pt-1 px-2 flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="New book title…"
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 text-white placeholder:text-white/30 outline-none focus:border-purple-500"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || busy}
              className="px-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white shrink-0"
            >
              + New
            </button>
          </div>
          {deleteTarget && (
            <BackupNagDialog
              title={`Delete "${deleteTarget.name}"?`}
              message={
                deleteTarget.id === activeProjectId
                  ? 'This removes it from the cloud permanently. A cloud version snapshot is taken automatically first, but a local copy is safest.'
                  : `This removes "${deleteTarget.name}" from the cloud permanently. A cloud version snapshot is taken automatically first. (This isn't the project currently open, so a local download here would export the wrong project — check Version History after deleting if you need it back.)`
              }
              confirmLabel="Delete"
              canDownload={deleteTarget.id === activeProjectId}
              onCancel={() => setDeleteTarget(null)}
              onConfirm={confirmDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
