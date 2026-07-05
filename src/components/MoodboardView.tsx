import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import type { MoodboardItem } from '../types';

function MoodboardDetail({ item, onClose }: { item: MoodboardItem; onClose: () => void }) {
  const { updateMoodboardItem, deleteMoodboardItem } = useAppStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {item.imageUrl && (
          <div className="rounded-lg overflow-hidden border border-[#0f3460] max-h-80">
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-full object-contain bg-[#0d1117]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        <input
          value={item.title}
          onChange={(e) => updateMoodboardItem(item.id, { title: e.target.value })}
          className="text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1]"
          placeholder="Title…"
        />

        <div>
          <label className="text-xs text-gray-500 block mb-1">Image URL</label>
          <input
            value={item.imageUrl}
            onChange={(e) => updateMoodboardItem(item.id, { imageUrl: e.target.value })}
            placeholder="https://…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs font-mono"
          />
          <p className="text-xs text-gray-600 mt-0.5">Paste a URL to an image. Images are not uploaded — they load from the URL.</p>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Description</label>
          <textarea
            value={item.description}
            onChange={(e) => updateMoodboardItem(item.id, { description: e.target.value })}
            rows={3}
            placeholder="What does this image reference or represent?"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y placeholder-gray-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source / Credit</label>
            <input
              value={item.source}
              onChange={(e) => updateMoodboardItem(item.id, { source: e.target.value })}
              placeholder="Photographer, URL, book…"
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={item.tags}
              onChange={(v) => updateMoodboardItem(item.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Scenes</label>
            <TagInput
              tags={item.relatedSceneIds}
              onChange={(v) => updateMoodboardItem(item.id, { relatedSceneIds: v })}
              placeholder="Add scene…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Codex Entries</label>
            <TagInput
              tags={item.relatedCodexIds}
              onChange={(v) => updateMoodboardItem(item.id, { relatedCodexIds: v })}
              placeholder="Add entry…"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea
            value={item.notes}
            onChange={(e) => updateMoodboardItem(item.id, { notes: e.target.value })}
            rows={2}
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-300 text-xs outline-none focus:border-[#6b46c1] resize-none"
          />
        </div>

        <div className="border-t border-[#0f3460] pt-3">
          <button
            onClick={() => {
              if (window.confirm('Delete this moodboard item?')) {
                deleteMoodboardItem(item.id);
                onClose();
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            🗑 Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function MoodboardView() {
  const { moodboardItems, addMoodboardItem, pendingSelectId, setPendingSelectId, setAIContextObject } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'moodboard_item', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);

  // Adopt a pending selection (e.g. from global search) during render rather
  // than in an effect, so the newly selected item shows on the same render.
  if (pendingSelectId && pendingSelectId !== selectedId) {
    setSelectedId(pendingSelectId);
  }
  useEffect(() => {
    if (pendingSelectId) setPendingSelectId(null);
  }, [pendingSelectId, setPendingSelectId]);
  const [filterText, setFilterText] = useState('');
  const [viewGrid, setViewGrid] = useState(true);

  const filtered = useMemo(() => {
    let list = moodboardItems;
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(m =>
        m.title.toLowerCase().includes(lc) ||
        m.description.toLowerCase().includes(lc) ||
        m.tags.some(t => t.toLowerCase().includes(lc)),
      );
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [moodboardItems, filterText]);

  const selected = moodboardItems.find(m => m.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* List/Grid */}
      <div className={`${selected ? 'w-80 shrink-0' : 'flex-1'} bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden`}>
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Moodboard</span>
            <div className="flex gap-1">
              <button
                onClick={() => setViewGrid(!viewGrid)}
                className="text-xs text-gray-500 hover:text-gray-300 px-1"
                title={viewGrid ? 'List view' : 'Grid view'}
              >
                {viewGrid ? '☰' : '▦'}
              </button>
              <button
                onClick={() => { const id = addMoodboardItem(); setSelectedId(id); }}
                className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
              >
                + Add
              </button>
            </div>
          </div>
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search moodboard…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600 mt-8">
              <div className="text-4xl mb-2">🖼️</div>
              <p className="text-xs">No images yet.</p>
              <p className="text-xs mt-1 text-gray-700">Add image URLs for visual references—mood, atmosphere, character inspiration, settings.</p>
            </div>
          )}

          {viewGrid ? (
            <div className={`grid gap-2 ${selected ? 'grid-cols-2' : 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5'}`}>
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`rounded-lg overflow-hidden border transition-colors text-left ${selectedId === item.id ? 'border-[#6b46c1]' : 'border-[#0f3460] hover:border-[#6b46c1]/50'}`}
                >
                  <div className="aspect-square bg-[#0d1117] flex items-center justify-center overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).parentElement!.textContent = '🖼️'; }}
                      />
                    ) : (
                      <span className="text-2xl text-gray-600">🖼️</span>
                    )}
                  </div>
                  {item.title !== 'Untitled' && (
                    <div className="px-1 py-0.5 bg-[#16213e]">
                      <p className="text-[10px] text-gray-400 truncate">{item.title}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full flex items-center gap-2 p-2 rounded transition-colors mb-1 text-left ${selectedId === item.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
              >
                <div className="w-10 h-10 rounded bg-[#0d1117] shrink-0 overflow-hidden flex items-center justify-center">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" onError={() => {}} />
                  ) : (
                    <span className="text-gray-600">🖼️</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.title}</p>
                  {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {selected && (
        <MoodboardDetail key={selected.id} item={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
