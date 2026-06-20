import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import type { Fragment, FragmentType, FragmentStatus } from '../types';

const TYPE_LABELS: Record<FragmentType, string> = {
  line: 'Line', paragraph: 'Paragraph', scene_fragment: 'Scene Fragment',
  research_note: 'Research Note', image_idea: 'Image Idea',
  dialogue_scrap: 'Dialogue Scrap', thematic_note: 'Thematic Note',
  memory: 'Memory', other: 'Other',
};

const STATUS_COLORS: Record<FragmentStatus, string> = {
  unsorted: '#63b3ed',
  maybe_useful: '#f6ad55',
  attached: '#68d391',
  promoted: '#b794f4',
  discarded: '#4a5568',
};

function FragmentDetail({ frag, onClose }: { frag: Fragment; onClose: () => void }) {
  const {
    updateFragment, deleteFragment, attachFragmentToScene,
    promoteFragmentToScene, sendFragmentToOmitted, binder,
  } = useAppStore();

  const [showAttach, setShowAttach] = useState(false);

  function collectScenes(items: typeof binder): { id: string; title: string }[] {
    const scenes: { id: string; title: string }[] = [];
    for (const item of items) {
      if (item.id === 'trash') continue;
      if (item.type === 'document') scenes.push({ id: item.id, title: item.title });
      if (item.children.length) scenes.push(...collectScenes(item.children));
    }
    return scenes;
  }
  const scenes = collectScenes(binder);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
        <span className="flex-1" />
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: `${STATUS_COLORS[frag.status]}22`, color: STATUS_COLORS[frag.status] }}
        >
          {frag.status.replace('_', ' ')}
        </span>
        <select
          value={frag.status}
          onChange={(e) => updateFragment(frag.id, { status: e.target.value as FragmentStatus })}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          {(Object.keys(STATUS_COLORS) as FragmentStatus[]).map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <input
          value={frag.title}
          onChange={(e) => updateFragment(frag.id, { title: e.target.value })}
          className="text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1] transition-colors"
          placeholder="Fragment title…"
        />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type</label>
            <select
              value={frag.fragmentType}
              onChange={(e) => updateFragment(frag.id, { fragmentType: e.target.value as FragmentType })}
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            >
              {(Object.entries(TYPE_LABELS) as [FragmentType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source</label>
            <input
              value={frag.source}
              onChange={(e) => updateFragment(frag.id, { source: e.target.value })}
              placeholder="Where did this come from?"
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Content</label>
          <textarea
            value={frag.content}
            onChange={(e) => updateFragment(frag.id, { content: e.target.value })}
            rows={12}
            placeholder="The fragment text…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y leading-relaxed placeholder-gray-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Characters</label>
            <TagInput
              tags={frag.relatedCharacters}
              onChange={(v) => updateFragment(frag.id, { relatedCharacters: v })}
              placeholder="Add character…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Places</label>
            <TagInput
              tags={frag.relatedPlaces}
              onChange={(v) => updateFragment(frag.id, { relatedPlaces: v })}
              placeholder="Add place…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Themes</label>
            <TagInput
              tags={frag.relatedThemes}
              onChange={(v) => updateFragment(frag.id, { relatedThemes: v })}
              placeholder="Add theme…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={frag.tags}
              onChange={(v) => updateFragment(frag.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Possible Placement</label>
          <input
            value={frag.possiblePlacement}
            onChange={(e) => updateFragment(frag.id, { possiblePlacement: e.target.value })}
            placeholder="Where might this belong?"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
          />
        </div>

        {/* Actions */}
        <div className="border-t border-[#0f3460] pt-3 flex flex-col gap-2">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Actions</p>

          <button
            onClick={() => setShowAttach(!showAttach)}
            className="w-full py-1.5 rounded bg-[#6b46c1]/20 text-purple-300 hover:bg-[#6b46c1]/40 text-xs transition-colors text-left px-3"
          >
            📎 Attach to Scene (without inserting into manuscript)
          </button>

          {showAttach && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  attachFragmentToScene(frag.id, e.target.value);
                  setShowAttach(false);
                }
              }}
              className="w-full bg-[#16213e] border border-[#6b46c1] rounded px-2 py-1 text-gray-300 outline-none text-xs"
            >
              <option value="" disabled>Select a scene…</option>
              {scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}

          <button
            onClick={() => {
              const newId = promoteFragmentToScene(frag.id, 'manuscript');
              if (newId) onClose();
            }}
            className="w-full py-1.5 rounded bg-green-900/20 text-green-400 hover:bg-green-900/40 text-xs transition-colors text-left px-3"
          >
            ⬆️ Promote to New Scene (preserves this record)
          </button>

          <button
            onClick={() => {
              const reason = window.prompt('Reason for discarding (optional):') ?? '';
              if (reason !== null) sendFragmentToOmitted(frag.id, reason);
            }}
            className="w-full py-1.5 rounded bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 text-xs transition-colors text-left px-3"
          >
            🗂 Send to Omitted Material
          </button>

          <button
            onClick={() => updateFragment(frag.id, { status: 'discarded' })}
            className="w-full py-1.5 rounded bg-[#2d3748] text-gray-400 hover:bg-[#3d4a5e] text-xs transition-colors text-left px-3"
          >
            🚫 Mark as Discarded (keeps record)
          </button>

          <button
            onClick={() => { if (window.confirm('Delete this fragment permanently?')) { deleteFragment(frag.id); onClose(); } }}
            className="w-full py-1.5 rounded bg-red-900/20 text-red-400 hover:bg-red-900/40 text-xs transition-colors text-left px-3"
          >
            🗑 Delete Permanently
          </button>
        </div>

        <div className="text-xs text-gray-600">
          Created {new Date(frag.createdAt).toLocaleString()} · Updated {new Date(frag.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export function FragmentsView() {
  const { fragments, addFragment } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  const filtered = useMemo(() => {
    let list = fragments;
    if (filterStatus) list = list.filter(f => f.status === filterStatus);
    if (filterType) list = list.filter(f => f.fragmentType === filterType);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(f =>
        f.title.toLowerCase().includes(lc) ||
        f.content.toLowerCase().includes(lc) ||
        f.tags.some(t => t.toLowerCase().includes(lc)),
      );
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [fragments, filterStatus, filterType, filterText]);

  const selected = fragments.find(f => f.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* List panel */}
      <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fragments</span>
            <button
              onClick={() => { const id = addFragment(); setSelectedId(id); }}
              className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a] transition-colors"
            >
              + New
            </button>
          </div>

          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search fragments…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
          />

          <div className="flex gap-1">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1 py-0.5 text-xs text-gray-400 outline-none"
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_COLORS) as FragmentStatus[]).map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1 py-0.5 text-xs text-gray-400 outline-none"
            >
              <option value="">All types</option>
              {(Object.entries(TYPE_LABELS) as [FragmentType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600">
              <div className="text-3xl mb-2">🧩</div>
              <p className="text-xs">No fragments yet.</p>
              <p className="text-xs mt-1">Fragments are orphaned writing—lines, ideas, cuts—not yet placed in the manuscript.</p>
            </div>
          )}
          {filtered.map(frag => (
            <button
              key={frag.id}
              onClick={() => setSelectedId(frag.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#0f3460] transition-colors ${selectedId === frag.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATUS_COLORS[frag.status] }}
                />
                <span className="text-sm text-white truncate">{frag.title}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{TYPE_LABELS[frag.fragmentType]}</span>
                {frag.tags.length > 0 && <span>· #{frag.tags[0]}{frag.tags.length > 1 ? ` +${frag.tags.length - 1}` : ''}</span>}
              </div>
              {frag.content && (
                <p className="text-xs text-gray-600 mt-1 truncate">{frag.content.slice(0, 80)}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected ? (
        <FragmentDetail key={selected.id} frag={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-5xl mb-3">🧩</div>
            <p className="text-sm">Select a fragment to view and edit it.</p>
            <p className="text-xs mt-1 text-gray-700">Fragments are writing that hasn't found its place yet.</p>
          </div>
        </div>
      )}
    </div>
  );
}
