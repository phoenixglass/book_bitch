import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import type { BinderItem, SceneMetadata, Status } from '../types';

function findParentOf(
  items: BinderItem[],
  id: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { parentId, index: i };
    const found = findParentOf(items[i].children, id, items[i].id);
    if (found) return found;
  }
  return null;
}

const STATUS_COLORS: Record<Status, string> = {
  'No Status': '#4a5568',
  'To Do': '#63b3ed',
  'In Progress': '#f6ad55',
  'First Draft': '#68d391',
  'Revised Draft': '#b794f4',
  'Final Draft': '#6b46c1',
  'Done': '#48bb78',
};

function countWords(html: string) {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

function collectScenes(items: BinderItem[]): BinderItem[] {
  const scenes: BinderItem[] = [];
  for (const item of items) {
    if (item.id === 'trash') continue;
    if (item.type === 'document') scenes.push(item);
    if (item.children.length) scenes.push(...collectScenes(item.children));
  }
  return scenes;
}

function TinyBar({ value, max = 10, color = '#6b46c1' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  if (!value) return <span className="text-gray-600 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1">
      <div className="w-16 h-1.5 bg-[#2d3748] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-gray-500">{value}/10</span>
    </div>
  );
}

interface SceneCardProps {
  item: BinderItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDrop: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
}

function SceneCard({ item, isExpanded, onToggleExpand, onOpen, onDuplicate, onDelete, onDrop }: SceneCardProps) {
  const { updateItem } = useAppStore();
  const [dropIndicator, setDropIndicator] = useState<'left' | 'right' | null>(null);
  const meta = item.sceneMetadata ?? {} as Partial<SceneMetadata>;
  const wordCount = countWords(item.content);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);

  function commitTitle() {
    updateItem(item.id, { title: titleDraft || 'Untitled' });
    setEditingTitle(false);
  }

  function updateMeta(patch: Partial<SceneMetadata>) {
    updateItem(item.id, { sceneMetadata: { ...meta, ...patch } });
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropIndicator(e.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== item.id) {
      onDrop(draggedId, item.id, dropIndicator === 'left' ? 'before' : 'after');
    }
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
      className={`bg-[#16213e] border border-[#0f3460] rounded-lg overflow-hidden hover:border-[#6b46c1]/50 transition-colors ${borderClass}`}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0f3460]">
        <span className="text-gray-600 cursor-grab active:cursor-grabbing text-xs shrink-0" title="Drag to reorder">⠿</span>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: STATUS_COLORS[item.status] }}
          title={item.status}
        />

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleDraft(item.title); setEditingTitle(false); } }}
            className="flex-1 bg-[#1a1a2e] text-white text-sm px-1 rounded outline-none border border-[#6b46c1]"
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium text-white truncate cursor-pointer hover:text-purple-300"
            onDoubleClick={() => { setTitleDraft(item.title); setEditingTitle(true); }}
            title="Double-click to rename"
          >
            {item.title}
          </span>
        )}

        <span className="text-xs text-gray-600">{wordCount}w</span>

        <div className="flex gap-1">
          <button onClick={onToggleExpand} className="text-xs text-gray-500 hover:text-gray-300 px-1" title={isExpanded ? 'Collapse' : 'Expand'}>
            {isExpanded ? '▲' : '▼'}
          </button>
          <button onClick={onOpen} className="text-xs text-gray-500 hover:text-white px-1" title="Open in editor">
            ✏️
          </button>
          <button onClick={onDuplicate} className="text-xs text-gray-500 hover:text-green-400 px-1" title="Duplicate">
            ⧉
          </button>
          <button onClick={onDelete} className="text-xs text-gray-500 hover:text-red-400 px-1" title="Delete">
            ✕
          </button>
        </div>
      </div>

      {/* Always-visible summary row */}
      <div className="px-3 py-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        {meta.povCharacter && (
          <div className="truncate">
            <span className="text-gray-600">POV: </span>
            <span className="text-gray-300">{meta.povCharacter}</span>
          </div>
        )}
        {(meta.locationOverall || meta.location) && (
          <div className="truncate">
            <span className="text-gray-600">Loc: </span>
            <span className="text-gray-300">{meta.locationOverall || meta.location}</span>
          </div>
        )}
        {meta.plotline && (
          <div className="truncate">
            <span className="text-gray-600">Plot: </span>
            <span className="text-gray-300">{meta.plotline}</span>
          </div>
        )}
        {(meta.timelineSpecificDate || meta.timelineDateStart) && (
          <div className="col-span-2 truncate">
            <span className="text-gray-600">Date: </span>
            <span className="text-gray-300">
              {meta.timelineSpecificDate || meta.timelineDateStart}
              {meta.timelineDateEnd ? ` – ${meta.timelineDateEnd}` : ''}
              {meta.timelineUncertain ? ' ~' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Synopsis */}
      {item.synopsis && (
        <div className="px-3 pb-2 text-xs text-gray-400 italic leading-relaxed line-clamp-3">
          {item.synopsis}
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-[#0f3460] pt-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            {/* Characters */}
            <div>
              <span className="text-gray-500 block mb-0.5">Characters</span>
              <input
                value={(meta.charactersPresent ?? []).join(', ')}
                onChange={(e) => updateMeta({ charactersPresent: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="comma separated"
                className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
              />
            </div>

            {/* Scene function */}
            <div>
              <span className="text-gray-500 block mb-0.5">Function</span>
              <input
                value={meta.sceneFunction ?? ''}
                onChange={(e) => updateMeta({ sceneFunction: e.target.value })}
                placeholder="e.g. revelation"
                className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
              />
            </div>

            {/* Status */}
            <div>
              <span className="text-gray-500 block mb-0.5">Status</span>
              <select
                value={item.status}
                onChange={(e) => updateItem(item.id, { status: e.target.value as Status })}
                className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
              >
                {(['No Status','To Do','In Progress','First Draft','Revised Draft','Final Draft','Done'] as Status[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Themes */}
            <div>
              <span className="text-gray-500 block mb-0.5">Themes</span>
              <input
                value={(meta.themes ?? []).join(', ')}
                onChange={(e) => updateMeta({ themes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="comma separated"
                className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-xs text-gray-500">Emotion </span><TinyBar value={meta.emotionalTemperature ?? 0} color="#f6ad55" /></div>
            <div><span className="text-xs text-gray-500">Tension </span><TinyBar value={meta.tensionLevel ?? 0} color="#fc8181" /></div>
          </div>

          {meta.whatChanged && (
            <div>
              <span className="text-gray-500 text-xs block mb-0.5">What changed</span>
              <p className="text-gray-400 text-xs italic">{meta.whatChanged}</p>
            </div>
          )}

          {/* Synopsis editor inline */}
          <div>
            <span className="text-gray-500 text-xs block mb-0.5">Synopsis</span>
            <textarea
              value={item.synopsis}
              onChange={(e) => updateItem(item.id, { synopsis: e.target.value })}
              rows={3}
              placeholder="Scene synopsis…"
              className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] resize-none placeholder-gray-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

type SortField = 'title' | 'status' | 'wordCount' | 'manuscript' | 'chrono' | 'updated';
type SortDir = 'asc' | 'desc';

export function SceneCards() {
  const { binder, selectItem, addItem, updateItem, removeItem, setViewMode, moveItem } = useAppStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('manuscript');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPov, setFilterPov] = useState('');
  const [filterText, setFilterText] = useState('');

  const allScenes = useMemo(() => collectScenes(binder), [binder]);

  const filtered = useMemo(() => {
    let scenes = allScenes;
    if (filterStatus) scenes = scenes.filter(s => s.status === filterStatus);
    if (filterPov) scenes = scenes.filter(s =>
      s.sceneMetadata?.povCharacter?.toLowerCase().includes(filterPov.toLowerCase()),
    );
    if (filterText) {
      const lc = filterText.toLowerCase();
      scenes = scenes.filter(s =>
        s.title.toLowerCase().includes(lc) ||
        s.synopsis.toLowerCase().includes(lc) ||
        s.sceneMetadata?.location?.toLowerCase().includes(lc) ||
        s.sceneMetadata?.plotline?.toLowerCase().includes(lc),
      );
    }

    scenes = [...scenes].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortField) {
        case 'title': va = a.title.toLowerCase(); vb = b.title.toLowerCase(); break;
        case 'status': va = a.status; vb = b.status; break;
        case 'wordCount': va = countWords(a.content); vb = countWords(b.content); break;
        case 'manuscript': va = a.sceneMetadata?.manuscriptOrder ?? 9999; vb = b.sceneMetadata?.manuscriptOrder ?? 9999; break;
        case 'chrono': va = a.sceneMetadata?.chronologicalOrder ?? 9999; vb = b.sceneMetadata?.chronologicalOrder ?? 9999; break;
        case 'updated': va = a.updatedAt ?? 0; vb = b.updatedAt ?? 0; break;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return scenes;
  }, [allScenes, filterStatus, filterPov, filterText, sortField, sortDir]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function handleCardDrop(draggedId: string, targetId: string, position: 'before' | 'after') {
    const targetPos = findParentOf(binder, targetId);
    if (!targetPos) return;
    const desiredIdx = position === 'before' ? targetPos.index : targetPos.index + 1;
    const draggedPos = findParentOf(binder, draggedId);
    let insertIdx = desiredIdx;
    if (draggedPos && draggedPos.parentId === targetPos.parentId && draggedPos.index < desiredIdx) {
      insertIdx--;
    }
    moveItem(draggedId, targetPos.parentId, Math.max(0, insertIdx));
  }

  function handleDuplicate(item: BinderItem) {
    const parentId = 'manuscript';
    addItem(parentId, 'document');
    const newId = useAppStore.getState().selectedId;
    if (newId) {
      updateItem(newId, {
        title: `${item.title} (copy)`,
        content: item.content,
        synopsis: item.synopsis,
        notes: item.notes,
        label: item.label,
        status: item.status,
        sceneMetadata: item.sceneMetadata ? { ...item.sceneMetadata } : undefined,
      });
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-semibold">{filtered.length} scenes</span>

        <div className="w-px h-4 bg-[#0f3460]" />

        {/* Filters */}
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter scenes…"
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-40"
        />
        <input
          value={filterPov}
          onChange={(e) => setFilterPov(e.target.value)}
          placeholder="POV…"
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-28"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          <option value="">All statuses</option>
          {['No Status','To Do','In Progress','First Draft','Revised Draft','Final Draft','Done'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-[#0f3460]" />

        {/* Sort */}
        <span className="text-xs text-gray-500">Sort:</span>
        {([['manuscript','MS#'],['chrono','Chrono'],['title','Title'],['status','Status'],['wordCount','Words'],['updated','Updated']] as [SortField,string][]).map(([f,l]) => (
          <button
            key={f}
            onClick={() => toggleSort(f)}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${sortField === f ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {l}{sortField === f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setExpandedIds(filtered.length === expandedIds.size ? new Set() : new Set(filtered.map(s => s.id)))}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-[#2d3748]"
        >
          {expandedIds.size > 0 ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 && (
          <div className="text-center text-gray-600 mt-16">
            <div className="text-4xl mb-3">🃏</div>
            <p className="text-sm">No scenes found.</p>
            <p className="text-xs mt-1">Create scenes in the Binder or adjust your filters.</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <SceneCard
              key={item.id}
              item={item}
              isExpanded={expandedIds.has(item.id)}
              onToggleExpand={() => toggleExpand(item.id)}
              onOpen={() => { selectItem(item.id); setViewMode('editor'); }}
              onDuplicate={() => handleDuplicate(item)}
              onDelete={() => {
                if (window.confirm(`Move "${item.title}" to Trash?`)) removeItem(item.id);
              }}
              onDrop={handleCardDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
