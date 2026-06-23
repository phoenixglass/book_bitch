import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import type { BinderItem } from '../types';

function collectScenes(items: BinderItem[]): BinderItem[] {
  const scenes: BinderItem[] = [];
  for (const item of items) {
    if (item.id === 'trash') continue;
    if (item.type === 'document') scenes.push(item);
    if (item.children.length) scenes.push(...collectScenes(item.children));
  }
  return scenes;
}

type TimelineOrder = 'manuscript' | 'chronological';

const STATUS_COLORS: Record<string, string> = {
  'No Status': '#4a5568', 'To Do': '#63b3ed', 'In Progress': '#f6ad55',
  'First Draft': '#68d391', 'Revised Draft': '#b794f4', 'Final Draft': '#6b46c1', 'Done': '#48bb78',
};

export function TimelineView() {
  const { binder, selectItem, setViewMode, setArea } = useAppStore();
  const [order, setOrder] = useState<TimelineOrder>('manuscript');
  const [filterPov, setFilterPov] = useState('');
  const [filterPlotline, setFilterPlotline] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const allScenes = useMemo(() => collectScenes(binder), [binder]);

  const filtered = useMemo(() => {
    let scenes = allScenes;
    if (filterPov) scenes = scenes.filter(s => s.sceneMetadata?.povCharacter?.toLowerCase().includes(filterPov.toLowerCase()));
    if (filterPlotline) scenes = scenes.filter(s => s.sceneMetadata?.plotline?.toLowerCase().includes(filterPlotline.toLowerCase()));
    if (filterLocation) scenes = scenes.filter(s => s.sceneMetadata?.location?.toLowerCase().includes(filterLocation.toLowerCase()));
    if (filterStatus) scenes = scenes.filter(s => s.status === filterStatus);
    return scenes;
  }, [allScenes, filterPov, filterPlotline, filterLocation, filterStatus]);

  const sorted = useMemo(() => {
    function parseDateSortKey(dateStr: string | undefined): number {
      if (!dateStr) return Number.MAX_SAFE_INTEGER;
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        // M/D/YYYY
        const year = parseInt(parts[2], 10);
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        return year * 10000 + month * 100 + day;
      } else if (parts.length === 2) {
        // M/YYYY
        const year = parseInt(parts[1], 10);
        const month = parseInt(parts[0], 10);
        return year * 10000 + month * 100;
      }
      return Number.MAX_SAFE_INTEGER;
    }

    return [...filtered].sort((a, b) => {
      if (order === 'manuscript') {
        const ma = a.sceneMetadata?.manuscriptOrder ?? 9999;
        const mb = b.sceneMetadata?.manuscriptOrder ?? 9999;
        return ma - mb;
      } else {
        const da = parseDateSortKey(a.sceneMetadata?.timelineDateStart);
        const db = parseDateSortKey(b.sceneMetadata?.timelineDateStart);
        if (da !== db) return da - db;
        const ca = a.sceneMetadata?.chronologicalOrder ?? 9999;
        const cb = b.sceneMetadata?.chronologicalOrder ?? 9999;
        return ca - cb;
      }
    });
  }, [filtered, order]);

  const unplaced = sorted.filter(s =>
    order === 'manuscript'
      ? !s.sceneMetadata?.manuscriptOrder
      : !s.sceneMetadata?.chronologicalOrder && !s.sceneMetadata?.timelineDateStart,
  );
  const placed = sorted.filter(s =>
    order === 'manuscript'
      ? !!s.sceneMetadata?.manuscriptOrder
      : !!(s.sceneMetadata?.chronologicalOrder || s.sceneMetadata?.timelineDateStart),
  );

  function openScene(id: string) {
    selectItem(id);
    setArea('manuscript');
    setViewMode('editor');
  }

  function wordCount(html: string) {
    return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-semibold">{sorted.length} scenes</span>

        <div className="flex gap-1 bg-[#0d1117] rounded p-0.5">
          {(['manuscript','chronological'] as TimelineOrder[]).map(o => (
            <button
              key={o}
              onClick={() => setOrder(o)}
              className={`text-xs px-3 py-1 rounded transition-colors ${order === o ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {o === 'manuscript' ? '📖 Manuscript Order' : '📅 Chronological'}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-[#0f3460]" />

        <input value={filterPov} onChange={e => setFilterPov(e.target.value)} placeholder="POV…" className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-24" />
        <input value={filterPlotline} onChange={e => setFilterPlotline(e.target.value)} placeholder="Plotline…" className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-28" />
        <input value={filterLocation} onChange={e => setFilterLocation(e.target.value)} placeholder="Location…" className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-28" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sorted.length === 0 && (
          <div className="text-center text-gray-600 mt-16">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-sm">No scenes yet.</p>
            <p className="text-xs mt-1">Add manuscript order and chronological dates in the Inspector's Scene tab.</p>
          </div>
        )}

        {/* Placed scenes */}
        <div className="relative">
          {/* Timeline bar */}
          {placed.length > 0 && (
            <div className="absolute left-[140px] top-0 bottom-0 w-px bg-[#0f3460]" />
          )}

          {placed.map((scene) => {
            const meta = scene.sceneMetadata ?? {};
            const num = order === 'manuscript' ? meta.manuscriptOrder : meta.chronologicalOrder;
            const dateLabel = meta.timelineDateStart
              ? `${meta.timelineDateStart}${meta.timelineDateEnd ? ` – ${meta.timelineDateEnd}` : ''}${meta.timelineUncertain ? ' ~' : ''}`
              : null;

            return (
              <div key={scene.id} className="flex items-start gap-0 mb-4">
                {/* Left label */}
                <div className="w-[140px] shrink-0 text-right pr-4 pt-2">
                  {num && <span className="text-xs text-gray-500 font-mono">#{num}</span>}
                  {dateLabel && <p className="text-xs text-gray-600 leading-tight">{dateLabel}</p>}
                </div>

                {/* Node */}
                <div className="relative shrink-0 flex items-center justify-center w-4 mt-2.5">
                  <div
                    className="w-3 h-3 rounded-full border-2 border-[#0d1117] z-10"
                    style={{ background: STATUS_COLORS[scene.status] }}
                  />
                </div>

                {/* Card */}
                <button
                  onClick={() => openScene(scene.id)}
                  className="flex-1 ml-4 text-left bg-[#16213e] border border-[#0f3460] hover:border-[#6b46c1]/50 rounded-lg p-3 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white group-hover:text-purple-300 transition-colors">{scene.title}</span>
                    {meta.timelineUncertain && <span className="text-[10px] text-gray-500">~</span>}
                    <span className="ml-auto text-xs text-gray-600">{wordCount(scene.content)}w</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    {meta.povCharacter && <span>👤 {meta.povCharacter}</span>}
                    {meta.location && <span>📍 {meta.location}</span>}
                    {meta.plotline && <span>🧵 {meta.plotline}</span>}
                    {meta.emotionalTemperature ? <span>🌡️ {meta.emotionalTemperature}/10</span> : null}
                    {meta.tensionLevel ? <span>⚡ {meta.tensionLevel}/10</span> : null}
                  </div>
                  {scene.synopsis && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{scene.synopsis}</p>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Unplaced scenes */}
        {unplaced.length > 0 && (
          <div className="mt-6 border-t border-[#0f3460] pt-4">
            <p className="text-xs text-gray-500 mb-3">
              ⚠ {unplaced.length} scene{unplaced.length !== 1 ? 's' : ''} without {order === 'manuscript' ? 'manuscript order' : 'timeline placement'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {unplaced.map(scene => (
                <button
                  key={scene.id}
                  onClick={() => openScene(scene.id)}
                  className="text-left bg-[#16213e] border border-dashed border-[#2d3748] hover:border-[#6b46c1]/50 rounded p-2 transition-colors group"
                >
                  <span className="text-sm text-gray-400 group-hover:text-gray-200">{scene.title}</span>
                  {scene.sceneMetadata?.povCharacter && (
                    <span className="text-xs text-gray-600 ml-2">{scene.sceneMetadata.povCharacter}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
