import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import type { NotebookEntry } from '../types';

function NotebookDetail({ entry, onClose }: { entry: NotebookEntry; onClose: () => void }) {
  const { updateNotebookEntry, deleteNotebookEntry } = useAppStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
        <span className="flex-1" />

        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={entry.isPrivate}
            onChange={(e) => updateNotebookEntry(entry.id, { isPrivate: e.target.checked })}
            className="accent-purple-500"
          />
          Private
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={entry.archived}
            onChange={(e) => updateNotebookEntry(entry.id, { archived: e.target.checked })}
            className="accent-purple-500"
          />
          Archived
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <input
          value={entry.title}
          onChange={(e) => updateNotebookEntry(entry.id, { title: e.target.value })}
          className="text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1]"
          placeholder="Entry title…"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date</label>
            <input
              type="date"
              value={entry.date}
              onChange={(e) => updateNotebookEntry(entry.id, { date: e.target.value })}
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={entry.tags}
              onChange={(v) => updateNotebookEntry(entry.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Entry</label>
          <textarea
            value={entry.content}
            onChange={(e) => updateNotebookEntry(entry.id, { content: e.target.value })}
            rows={16}
            placeholder="Write freely here. This is your private space—doubts, ideas, discoveries, process notes, questions you're afraid to ask…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y leading-relaxed placeholder-gray-600"
          />
        </div>

        <div className="border-t border-[#0f3460] pt-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Linked Objects</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Related Scenes (IDs or titles)</label>
              <TagInput
                tags={entry.relatedSceneIds}
                onChange={(v) => updateNotebookEntry(entry.id, { relatedSceneIds: v })}
                placeholder="Add scene…"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Related Codex Entries</label>
              <TagInput
                tags={entry.relatedCodexIds}
                onChange={(v) => updateNotebookEntry(entry.id, { relatedCodexIds: v })}
                placeholder="Add codex entry…"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-[#0f3460] pt-3">
          <button
            onClick={() => {
              if (window.confirm('Delete this notebook entry permanently?')) {
                deleteNotebookEntry(entry.id);
                onClose();
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            🗑 Delete Entry
          </button>
        </div>

        <div className="text-xs text-gray-600">
          Created {new Date(entry.createdAt).toLocaleString()} · Updated {new Date(entry.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export function NotebookView() {
  const { notebookEntries, addNotebookEntry, pendingSelectId, setPendingSelectId, setAIContextObject } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'notebook_entry', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);

  useEffect(() => {
    if (pendingSelectId) {
      setSelectedId(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, setPendingSelectId]);
  const [filterText, setFilterText] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    let list = notebookEntries;
    if (!showArchived) list = list.filter(e => !e.archived);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(e =>
        e.title.toLowerCase().includes(lc) ||
        e.content.toLowerCase().includes(lc) ||
        e.tags.some(t => t.toLowerCase().includes(lc)),
      );
    }
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt - a.createdAt;
    });
  }, [notebookEntries, filterText, showArchived]);

  const selected = notebookEntries.find(e => e.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notebook</span>
            <button
              onClick={() => { const id = addNotebookEntry(); setSelectedId(id); }}
              className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
            >
              + Entry
            </button>
          </div>
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search notebook…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
          />
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-purple-500"
            />
            Show archived
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600">
              <div className="text-3xl mb-2">📓</div>
              <p className="text-xs">No entries yet.</p>
              <p className="text-xs mt-1 text-gray-700">This notebook is for messy thinking—doubts, process notes, discoveries. It stays separate from the manuscript.</p>
            </div>
          )}
          {filtered.map(entry => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#0f3460] transition-colors ${selectedId === entry.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                {entry.isPrivate && <span className="text-gray-600 text-xs" title="Private">🔒</span>}
                <span className="text-sm text-white truncate">{entry.title}</span>
              </div>
              <div className="text-xs text-gray-500">{entry.date}</div>
              {entry.content && (
                <p className="text-xs text-gray-600 mt-0.5 truncate">{entry.content.slice(0, 80)}</p>
              )}
              {entry.tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {entry.tags.slice(0, 3).map(t => (
                    <span key={t} className="text-[10px] bg-[#6b46c1]/20 text-purple-400 rounded px-1">#{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <NotebookDetail key={selected.id} entry={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-5xl mb-3">📓</div>
            <p className="text-sm">Select an entry to read and edit it.</p>
            <p className="text-xs mt-1 text-gray-700">Your notebook entries are never exported unless you choose to include them.</p>
          </div>
        </div>
      )}
    </div>
  );
}
