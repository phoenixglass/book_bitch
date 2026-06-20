import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import type { OmittedMaterial, OmissionStatus } from '../types';

const STATUS_LABELS: Record<OmissionStatus, string> = {
  cut: 'Cut',
  saved_for_later: 'Saved for Later',
  alternate_version: 'Alternate Version',
  duplicate: 'Duplicate',
  research_only: 'Research Only',
  structurally_homeless: 'Structurally Homeless',
  restored: 'Restored',
};

const STATUS_COLORS: Record<OmissionStatus, string> = {
  cut: '#fc8181',
  saved_for_later: '#f6ad55',
  alternate_version: '#b794f4',
  duplicate: '#63b3ed',
  research_only: '#68d391',
  structurally_homeless: '#f6e05e',
  restored: '#68d391',
};

function OmittedDetail({ item, onClose }: { item: OmittedMaterial; onClose: () => void }) {
  const { updateOmittedMaterial, deleteOmittedMaterial, restoreOmittedToScene } = useAppStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
        <span className="flex-1" />
        <select
          value={item.omissionStatus}
          onChange={(e) => updateOmittedMaterial(item.id, { omissionStatus: e.target.value as OmissionStatus })}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          {(Object.entries(STATUS_LABELS) as [OmissionStatus, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <input
          value={item.title}
          onChange={(e) => updateOmittedMaterial(item.id, { title: e.target.value })}
          className="text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1]"
          placeholder="Title…"
        />

        {item.sourceSceneTitle && (
          <div className="bg-[#16213e] border border-[#0f3460] rounded p-2 text-xs text-gray-400">
            <span className="text-gray-500">Originally from: </span>
            <span className="text-gray-300">{item.sourceSceneTitle}</span>
            {item.reason && (
              <span className="ml-2 text-gray-500"> · Reason: {item.reason}</span>
            )}
          </div>
        )}

        <div>
          <label className="text-xs text-gray-500 block mb-1">Reason for Omission</label>
          <input
            value={item.reason}
            onChange={(e) => updateOmittedMaterial(item.id, { reason: e.target.value })}
            placeholder="Why was this cut?"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Content</label>
          <textarea
            value={item.content}
            onChange={(e) => updateOmittedMaterial(item.id, { content: e.target.value })}
            rows={12}
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Characters</label>
            <TagInput
              tags={item.relatedCharacters}
              onChange={(v) => updateOmittedMaterial(item.id, { relatedCharacters: v })}
              placeholder="Add character…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Themes</label>
            <TagInput
              tags={item.relatedThemes}
              onChange={(v) => updateOmittedMaterial(item.id, { relatedThemes: v })}
              placeholder="Add theme…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Locations</label>
            <TagInput
              tags={item.relatedLocations}
              onChange={(v) => updateOmittedMaterial(item.id, { relatedLocations: v })}
              placeholder="Add location…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={item.tags}
              onChange={(v) => updateOmittedMaterial(item.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea
            value={item.notes}
            onChange={(e) => updateOmittedMaterial(item.id, { notes: e.target.value })}
            rows={3}
            placeholder="Private notes about this material…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-300 text-xs outline-none focus:border-[#6b46c1] resize-none placeholder-gray-600"
          />
        </div>

        {/* Actions */}
        <div className="border-t border-[#0f3460] pt-3 flex flex-col gap-2">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Restore Options</p>

          <button
            onClick={() => {
              const newId = restoreOmittedToScene(item.id, 'manuscript');
              if (newId) onClose();
            }}
            className="w-full py-1.5 rounded bg-green-900/20 text-green-400 hover:bg-green-900/40 text-xs transition-colors text-left px-3"
          >
            ↩ Restore as New Scene in Manuscript
          </button>

          <button
            onClick={() => {
              if (window.confirm('Permanently delete this omitted material? This cannot be undone.')) {
                deleteOmittedMaterial(item.id);
                onClose();
              }
            }}
            className="w-full py-1.5 rounded bg-red-900/20 text-red-400 hover:bg-red-900/40 text-xs transition-colors text-left px-3"
          >
            🗑 Delete Permanently
          </button>
        </div>

        <div className="text-xs text-gray-600">
          Omitted {new Date(item.omissionDate).toLocaleString()} · Updated {new Date(item.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export function OmittedView() {
  const { omittedMaterial, addOmittedMaterial, pendingSelectId, setPendingSelectId } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (pendingSelectId) {
      setSelectedId(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, setPendingSelectId]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  const filtered = useMemo(() => {
    let list = omittedMaterial;
    if (filterStatus) list = list.filter(o => o.omissionStatus === filterStatus);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(o =>
        o.title.toLowerCase().includes(lc) ||
        o.content.toLowerCase().includes(lc) ||
        o.reason.toLowerCase().includes(lc) ||
        o.tags.some(t => t.toLowerCase().includes(lc)),
      );
    }
    return [...list].sort((a, b) => b.omissionDate - a.omissionDate);
  }, [omittedMaterial, filterStatus, filterText]);

  const selected = omittedMaterial.find(o => o.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Omitted Material</span>
            <button
              onClick={() => { const id = addOmittedMaterial(); setSelectedId(id); }}
              className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
            >
              + New
            </button>
          </div>
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-400 outline-none"
          >
            <option value="">All statuses</option>
            {(Object.entries(STATUS_LABELS) as [OmissionStatus, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600">
              <div className="text-3xl mb-2">🗂️</div>
              <p className="text-xs">No omitted material yet.</p>
              <p className="text-xs mt-1 text-gray-700">This is a dignified archive for cut material—not a trash can.</p>
            </div>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#0f3460] transition-colors ${selectedId === item.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATUS_COLORS[item.omissionStatus] }}
                />
                <span className="text-sm text-white truncate">{item.title}</span>
              </div>
              <div className="text-xs text-gray-500">
                {STATUS_LABELS[item.omissionStatus]}
                {item.sourceSceneTitle && ` · from "${item.sourceSceneTitle}"`}
              </div>
              {item.reason && (
                <p className="text-xs text-gray-600 mt-0.5 truncate">{item.reason}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <OmittedDetail key={selected.id} item={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-5xl mb-3">🗂️</div>
            <p className="text-sm">Select an item to view or restore it.</p>
            <p className="text-xs mt-1 text-gray-700">Omitted material is never truly gone.</p>
          </div>
        </div>
      )}
    </div>
  );
}
