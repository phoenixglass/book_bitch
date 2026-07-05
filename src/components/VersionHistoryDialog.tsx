import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useSyncContext } from './SyncProvider';
import { listProjectRevisions, type RevisionMeta } from '../lib/revisions';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function VersionHistoryDialog({ onClose }: { onClose: () => void }) {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const { restoreRevision } = useSyncContext();
  const [revisions, setRevisions] = useState<RevisionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    listProjectRevisions(activeProjectId)
      .then(setRevisions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [activeProjectId]);

  async function handleRestore(rev: RevisionMeta) {
    if (restoringId) return;
    const ok = window.confirm(
      `Restore the version from ${formatWhen(rev.createdAt)} (${rev.wordCount.toLocaleString()} words)?\n\n` +
      `Your current state will be saved as a new version first, so this can be undone.`,
    );
    if (!ok) return;
    setRestoringId(rev.id);
    try {
      await restoreRevision(rev.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col bg-[#1a1a2e] border border-white/10 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Version History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error && <p className="text-xs text-red-400 px-2 py-2">{error}</p>}
          {!error && revisions === null && (
            <p className="text-xs text-gray-400 px-2 py-2">Loading versions…</p>
          )}
          {!error && revisions?.length === 0 && (
            <p className="text-xs text-gray-400 px-2 py-2">
              No saved versions yet. A version is captured automatically every ~15 minutes while you work, and right before you delete a project.
            </p>
          )}
          {revisions?.map((rev) => (
            <div
              key={rev.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-[#2d3748] text-sm"
            >
              <div className="min-w-0">
                <div className="text-gray-200 truncate">{formatWhen(rev.createdAt)}</div>
                <div className="text-xs text-gray-500">{rev.wordCount.toLocaleString()} words</div>
              </div>
              <button
                onClick={() => handleRestore(rev)}
                disabled={restoringId !== null}
                className="shrink-0 px-2 py-1 rounded text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white"
              >
                {restoringId === rev.id ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
