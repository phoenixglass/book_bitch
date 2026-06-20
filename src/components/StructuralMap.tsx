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

function countWords(html: string) {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

type MapMode = 'tension' | 'emotion' | 'status' | 'wordcount' | 'pov' | 'plotline';

const STATUS_COLORS: Record<string, string> = {
  'No Status': '#4a5568', 'To Do': '#63b3ed', 'In Progress': '#f6ad55',
  'First Draft': '#68d391', 'Revised Draft': '#b794f4', 'Final Draft': '#6b46c1', 'Done': '#48bb78',
};

function heatColor(value: number, max: number = 10): string {
  const pct = max > 0 ? value / max : 0;
  const r = Math.round(pct * 252 + (1 - pct) * 45);
  const g = Math.round(pct * 50 + (1 - pct) * 75);
  const b = Math.round(pct * 50 + (1 - pct) * 168);
  return `rgb(${r},${g},${b})`;
}

const POV_PALETTE = ['#6b46c1','#f6ad55','#68d391','#fc8181','#63b3ed','#f6e05e','#b794f4','#ed8936'];

export function StructuralMap() {
  const { binder, selectItem, setArea, setViewMode } = useAppStore();
  const [mode, setMode] = useState<MapMode>('tension');

  const scenes = useMemo(() => collectScenes(binder), [binder]);

  const orderedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      const ma = a.sceneMetadata?.manuscriptOrder ?? 9999;
      const mb = b.sceneMetadata?.manuscriptOrder ?? 9999;
      return ma - mb;
    });
  }, [scenes]);

  const povIndex = useMemo(() => {
    const povs = Array.from(new Set(scenes.map(s => s.sceneMetadata?.povCharacter).filter(Boolean) as string[]));
    const map: Record<string, number> = {};
    povs.forEach((p, i) => { map[p] = i; });
    return map;
  }, [scenes]);

  const plotlineIndex = useMemo(() => {
    const plotlines = Array.from(new Set(scenes.map(s => s.sceneMetadata?.plotline).filter(Boolean) as string[]));
    const map: Record<string, number> = {};
    plotlines.forEach((p, i) => { map[p] = i; });
    return map;
  }, [scenes]);

  const maxWords = useMemo(() => {
    return Math.max(...scenes.map(s => countWords(s.content)), 1);
  }, [scenes]);

  function getColor(scene: BinderItem): string {
    const meta = scene.sceneMetadata ?? {};
    switch (mode) {
      case 'tension': return heatColor(meta.tensionLevel ?? 0);
      case 'emotion': return heatColor(meta.emotionalTemperature ?? 0);
      case 'status': return STATUS_COLORS[scene.status] ?? '#4a5568';
      case 'wordcount': return heatColor(countWords(scene.content), maxWords);
      case 'pov': {
        const pov = meta.povCharacter;
        if (!pov) return '#4a5568';
        return POV_PALETTE[povIndex[pov] % POV_PALETTE.length];
      }
      case 'plotline': {
        const pl = meta.plotline;
        if (!pl) return '#4a5568';
        return POV_PALETTE[plotlineIndex[pl] % POV_PALETTE.length];
      }
      default: return '#6b46c1';
    }
  }

  function getHeight(scene: BinderItem): number {
    const meta = scene.sceneMetadata ?? {};
    switch (mode) {
      case 'tension': return 20 + (meta.tensionLevel ?? 0) * 8;
      case 'emotion': return 20 + (meta.emotionalTemperature ?? 0) * 8;
      case 'wordcount': return 20 + (countWords(scene.content) / maxWords) * 80;
      default: return 48;
    }
  }

  function openScene(id: string) {
    selectItem(id);
    setArea('manuscript');
    setViewMode('editor');
  }

  const legendItems = useMemo(() => {
    if (mode === 'status') return Object.entries(STATUS_COLORS);
    if (mode === 'pov') return Object.entries(povIndex).map(([p, i]) => [p, POV_PALETTE[i % POV_PALETTE.length]]);
    if (mode === 'plotline') return Object.entries(plotlineIndex).map(([p, i]) => [p, POV_PALETTE[i % POV_PALETTE.length]]);
    return [];
  }, [mode, povIndex, plotlineIndex]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-semibold">Structural Map</span>
        <span className="text-xs text-gray-600">— {orderedScenes.length} scenes in manuscript order</span>
        <div className="flex-1" />
        {([
          ['tension', 'Tension'], ['emotion', 'Emotion'], ['status', 'Status'],
          ['wordcount', 'Word Count'], ['pov', 'POV'], ['plotline', 'Plotline'],
        ] as [MapMode, string][]).map(([m, l]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${mode === m ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {orderedScenes.length === 0 && (
          <div className="text-center text-gray-600 mt-16">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm">No scenes to map yet.</p>
          </div>
        )}

        {/* Visualization */}
        <div className="flex items-end gap-1 flex-wrap">
          {orderedScenes.map((scene, idx) => {
            const color = getColor(scene);
            const height = getHeight(scene);
            const meta = scene.sceneMetadata ?? {};

            return (
              <button
                key={scene.id}
                onClick={() => openScene(scene.id)}
                title={`${scene.title}${meta.povCharacter ? ` · ${meta.povCharacter}` : ''}${meta.location ? ` · ${meta.location}` : ''}`}
                className="relative group flex-shrink-0 w-8 rounded-t transition-all hover:opacity-80"
                style={{ height: `${height}px`, background: color }}
              >
                {/* Hover tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#2d3748] border border-[#0f3460] rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="font-medium">{scene.title}</div>
                  {meta.povCharacter && <div className="text-gray-400">👤 {meta.povCharacter}</div>}
                  {meta.location && <div className="text-gray-400">📍 {meta.location}</div>}
                  {mode === 'tension' && <div className="text-gray-400">Tension: {meta.tensionLevel ?? 0}/10</div>}
                  {mode === 'emotion' && <div className="text-gray-400">Emotion: {meta.emotionalTemperature ?? 0}/10</div>}
                  {mode === 'wordcount' && <div className="text-gray-400">{countWords(scene.content)} words</div>}
                </div>
                <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] text-white/50 leading-none">
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        {legendItems.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {legendItems.map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        )}

        {(mode === 'tension' || mode === 'emotion' || mode === 'wordcount') && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-gray-600">Low</span>
            <div className="w-32 h-3 rounded" style={{ background: 'linear-gradient(to right, rgb(45,75,168), rgb(252,50,50))' }} />
            <span className="text-xs text-gray-600">High</span>
          </div>
        )}

        {/* Gap detection */}
        {mode === 'tension' && orderedScenes.length > 1 && (
          <div className="mt-6 p-3 bg-[#16213e] border border-[#0f3460] rounded-lg">
            <p className="text-xs text-gray-400 font-semibold mb-2">Tension gaps (scenes without tension level set)</p>
            <div className="flex flex-wrap gap-2">
              {orderedScenes
                .filter(s => !s.sceneMetadata?.tensionLevel)
                .map(s => (
                  <button
                    key={s.id}
                    onClick={() => openScene(s.id)}
                    className="text-xs text-gray-500 hover:text-gray-300 bg-[#2d3748] px-2 py-0.5 rounded"
                  >
                    {s.title}
                  </button>
                ))}
              {orderedScenes.filter(s => !s.sceneMetadata?.tensionLevel).length === 0 && (
                <span className="text-xs text-gray-600">All scenes have tension data.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
