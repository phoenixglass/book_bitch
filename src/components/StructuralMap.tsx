import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { SceneOrder } from '../types';
import { collectScenes, sortScenes } from '../utils/timelineOrder';
import {
  ALL_LAYERS, CATEGORY_LAYERS, LAYER_BY_ID, METRIC_LAYERS, STATUS_COLORS, VALUE_PALETTE,
  buildRows, heatColor, indexValues, isMetric, matchesFocus, metricMax, valueKey,
  type CategoryLayer, type CategoryLayerId, type FocusValue, type Layer, type LayerId,
  type LayerValue, type MetricLayerId, type SceneRow,
} from '../utils/storyMapData';

type MapView = 'lanes' | 'bars' | 'matrix';
type ColorBy = 'none' | MetricLayerId | CategoryLayerId;
type CellStat = 'count' | MetricLayerId;

interface MapPrefs {
  view: MapView;
  order: SceneOrder;
  layers: LayerId[];
  zoom: number;
  barHeight: MetricLayerId | 'none';
  barColor: ColorBy;
  matrixRows: CategoryLayerId;
  matrixCols: CategoryLayerId;
  matrixStat: CellStat;
}

const DEFAULT_PREFS: MapPrefs = {
  view: 'lanes',
  order: 'manuscript',
  layers: ['tension', 'characters'],
  zoom: 18,
  barHeight: 'tension',
  barColor: 'plotline',
  matrixRows: 'characters',
  matrixCols: 'motifs',
  matrixStat: 'count',
};

// Per-viewer convenience only: remembering which layers you had on.
const PREFS_KEY = 'book_bitch.structuralMap.v2';

function loadPrefs(): MapPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<MapPrefs>;
    const merged = { ...DEFAULT_PREFS, ...parsed };
    merged.layers = (merged.layers ?? []).filter((id) => id in LAYER_BY_ID);
    return merged;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** How many values a lane group shows before "show all". */
const LANE_CAP = 12;
const LABEL_W = 168;

export function StructuralMap() {
  const { binder, selectItem, setArea, setViewMode } = useAppStore();
  const [prefs, setPrefs] = useState<MapPrefs>(loadPrefs);
  const [focus, setFocus] = useState<FocusValue[]>([]);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<CategoryLayerId>>(new Set());

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs]);

  const patch = (p: Partial<MapPrefs>) => setPrefs((prev) => ({ ...prev, ...p }));

  const rows = useMemo(
    () => buildRows(sortScenes(collectScenes(binder), prefs.order)),
    [binder, prefs.order],
  );

  const valueIndex = useMemo(() => {
    const out = {} as Record<CategoryLayerId, LayerValue[]>;
    for (const l of CATEGORY_LAYERS) out[l.id] = indexValues(l, rows);
    return out;
  }, [rows]);

  const maxima = useMemo(() => {
    const out = {} as Record<MetricLayerId, number>;
    for (const l of METRIC_LAYERS) out[l.id] = metricMax(l.id, rows);
    return out;
  }, [rows]);

  // Drop focus values that no longer exist (e.g. a tag was removed).
  const liveFocus = useMemo(
    () => focus.filter((f) => valueIndex[f.layer].some((v) => v.key === f.key)),
    [focus, valueIndex],
  );
  const matching = useMemo(
    () => new Set(rows.filter((r) => matchesFocus(r, liveFocus)).map((r) => r.position)),
    [rows, liveFocus],
  );
  const focusActive = liveFocus.length > 0;

  function toggleLayer(id: LayerId) {
    const has = prefs.layers.includes(id);
    patch({ layers: has ? prefs.layers.filter((l) => l !== id) : [...prefs.layers, id] });
  }

  function toggleFocus(layer: CategoryLayerId, v: LayerValue) {
    setFocus((prev) => {
      const exists = prev.some((f) => f.layer === layer && f.key === v.key);
      return exists
        ? prev.filter((f) => !(f.layer === layer && f.key === v.key))
        : [...prev, { layer, key: v.key, label: v.label }];
    });
  }

  const isFocused = (layer: CategoryLayerId, key: string) =>
    liveFocus.some((f) => f.layer === layer && f.key === key);

  function openScene(id: string) {
    selectItem(id);
    setArea('manuscript');
    setViewMode('editor');
  }

  const hovered = hoverPos != null ? rows[hoverPos - 1] : null;
  const selectedLayers = prefs.layers.map((id) => LAYER_BY_ID[id]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header: view + order ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-semibold">Structural Map</span>
        <span className="text-xs text-gray-600">
          — {rows.length} scenes in {prefs.order === 'manuscript' ? 'manuscript' : 'chronological'} order
          {focusActive && ` · ${matching.size} match focus`}
        </span>
        <div className="flex-1" />
        <Segmented
          value={prefs.order}
          onChange={(order) => patch({ order })}
          options={[['manuscript', 'Manuscript'], ['chronological', 'Chronological']]}
        />
        <Segmented
          value={prefs.view}
          onChange={(view) => patch({ view })}
          options={[['lanes', 'Lanes'], ['bars', 'Bars'], ['matrix', 'Matrix']]}
        />
      </div>

      {/* ── Layer picker (multi-select) ──────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#0f3460] bg-[#16213e] shrink-0 flex-wrap">
        <span className="text-[11px] text-gray-500 mr-1">Layers</span>
        {ALL_LAYERS.map((l) => {
          const on = prefs.layers.includes(l.id);
          const empty = l.kind === 'category'
            ? valueIndex[l.id].length === 0
            : rows.every((r) => r.metrics[l.id] == null);
          return (
            <button
              key={l.id}
              onClick={() => toggleLayer(l.id)}
              aria-pressed={on}
              title={empty ? `No scenes have ${l.label.toLowerCase()} set yet` : undefined}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                on ? 'text-white border-transparent' : 'text-gray-500 border-[#2d3748] hover:text-gray-300'
              } ${empty && !on ? 'opacity-50' : ''}`}
              style={on ? { background: `${l.color}40`, borderColor: l.color } : undefined}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </button>
          );
        })}
        {prefs.layers.length > 0 && (
          <button onClick={() => patch({ layers: [] })} className="text-[11px] text-gray-600 hover:text-gray-300 ml-1">
            clear
          </button>
        )}
      </div>

      {/* ── Focus bar ─────────────────────────────────────────────────────── */}
      {focusActive && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0 flex-wrap">
          <span className="text-[11px] text-gray-500">Highlighting scenes with</span>
          {liveFocus.map((f, i) => (
            <Fragment key={`${f.layer}:${f.key}`}>
              {i > 0 && <span className="text-[11px] text-gray-600">+</span>}
              <button
                onClick={() => setFocus((prev) => prev.filter((p) => !(p.layer === f.layer && p.key === f.key)))}
                className="text-xs px-1.5 py-0.5 rounded text-white"
                style={{ background: `${LAYER_BY_ID[f.layer].color}55` }}
                title="Remove"
              >
                {f.label} ×
              </button>
            </Fragment>
          ))}
          <button onClick={() => setFocus([])} className="text-[11px] text-gray-600 hover:text-gray-300 ml-1">clear</button>
        </div>
      )}

      {/* ── Hover readout ─────────────────────────────────────────────────── */}
      {prefs.view !== 'matrix' && (
        <div className="px-4 py-1 text-[11px] text-gray-400 border-b border-[#0f3460] bg-[#141428] shrink-0 truncate min-h-[24px]">
          {hovered ? <SceneReadout row={hovered} layers={selectedLayers} /> : (
            <span className="text-gray-600">Hover a scene to read it · click to open · click a value label to highlight its scenes</span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="text-center text-gray-600 mt-16">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm">No scenes to map yet.</p>
          </div>
        ) : prefs.view === 'lanes' ? (
          <LanesView
            rows={rows}
            prefs={prefs}
            patch={patch}
            valueIndex={valueIndex}
            maxima={maxima}
            matching={matching}
            focusActive={focusActive}
            hoverPos={hoverPos}
            setHoverPos={setHoverPos}
            expanded={expanded}
            toggleExpanded={(id) => setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            isFocused={isFocused}
            toggleFocus={toggleFocus}
            openScene={openScene}
          />
        ) : prefs.view === 'bars' ? (
          <BarsView
            rows={rows}
            prefs={prefs}
            patch={patch}
            valueIndex={valueIndex}
            maxima={maxima}
            matching={matching}
            focusActive={focusActive}
            setHoverPos={setHoverPos}
            isFocused={isFocused}
            toggleFocus={toggleFocus}
            openScene={openScene}
          />
        ) : (
          <MatrixView
            rows={focusActive ? rows.filter((r) => matching.has(r.position)) : rows}
            focusActive={focusActive}
            prefs={prefs}
            patch={patch}
            isFocused={isFocused}
            setFocus={setFocus}
            openScene={openScene}
          />
        )}
      </div>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex rounded border border-[#2d3748] overflow-hidden">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`text-xs px-2 py-0.5 transition-colors ${value === v ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-0.5 text-gray-300 text-xs"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function SceneReadout({ row, layers }: { row: SceneRow; layers: Layer[] }) {
  const parts: string[] = [];
  for (const l of layers) {
    if (l.kind === 'metric') {
      const v = row.metrics[l.id];
      if (v != null) parts.push(l.id === 'wordcount' ? `${v} words` : `${l.label} ${v}/10`);
    } else {
      const vals = Array.from(new Map(l.read(row.scene).map((v) => [valueKey(v), v])).values());
      if (vals.length) parts.push(`${l.label}: ${vals.join(', ')}`);
    }
  }
  return (
    <span>
      <span className="text-gray-200 font-medium">#{row.position} {row.scene.title}</span>
      {parts.length > 0 && <span className="text-gray-500"> · {parts.join(' · ')}</span>}
    </span>
  );
}

/** Stable per-value colors for a category layer, used by Bars and legends. */
function valueColors(layer: CategoryLayerId, values: LayerValue[]): Map<string, string> {
  const m = new Map<string, string>();
  values.forEach((v, i) => {
    m.set(v.key, layer === 'status' ? (STATUS_COLORS[v.label] ?? '#4a5568') : VALUE_PALETTE[i % VALUE_PALETTE.length]);
  });
  return m;
}

// ─── Lanes ───────────────────────────────────────────────────────────────────
// Every selected layer as horizontal lanes over one shared scene axis, so you
// can read down a column ("scene 41: tension 9, Mara + Ilya, the knife motif").

interface LanesProps {
  rows: SceneRow[];
  prefs: MapPrefs;
  patch: (p: Partial<MapPrefs>) => void;
  valueIndex: Record<CategoryLayerId, LayerValue[]>;
  maxima: Record<MetricLayerId, number>;
  matching: Set<number>;
  focusActive: boolean;
  hoverPos: number | null;
  setHoverPos: (p: number | null) => void;
  expanded: Set<CategoryLayerId>;
  toggleExpanded: (id: CategoryLayerId) => void;
  isFocused: (layer: CategoryLayerId, key: string) => boolean;
  toggleFocus: (layer: CategoryLayerId, v: LayerValue) => void;
  openScene: (id: string) => void;
}

function LanesView(p: LanesProps) {
  const { rows, prefs, matching, focusActive, hoverPos } = p;
  const col = prefs.zoom;
  const gridTemplateColumns = `${LABEL_W}px repeat(${rows.length}, ${col}px)`;
  const labelEvery = col >= 22 ? 1 : col >= 14 ? 5 : 10;

  const cellBg = (pos: number) =>
    pos === hoverPos ? 'rgba(255,255,255,0.07)' : undefined;
  const dim = (pos: number) => (focusActive && !matching.has(pos) ? 0.18 : 1);

  const cellHandlers = (row: SceneRow) => ({
    onMouseEnter: () => p.setHoverPos(row.position),
    onMouseLeave: () => p.setHoverPos(null),
    onClick: () => p.openScene(row.scene.id),
  });

  const missing = prefs.layers
    .map((id) => {
      const l = LAYER_BY_ID[id];
      const lacking = rows.filter((r) => (l.kind === 'metric' ? r.metrics[l.id] == null : r.keys[l.id].size === 0));
      return { l, lacking };
    })
    .filter((m) => m.lacking.length > 0 && m.l.id !== 'wordcount');

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Column width
          <input
            type="range" min={8} max={36} step={2} value={col}
            onChange={(e) => p.patch({ zoom: Number(e.target.value) })}
            className="w-28 accent-[#6b46c1]"
          />
        </label>
        {prefs.layers.length === 0 && <span className="text-xs text-gray-600">Pick one or more layers above.</span>}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid" style={{ gridTemplateColumns, width: LABEL_W + rows.length * col }}>
          {/* Scene number header */}
          <div className="sticky left-0 z-20 bg-[#0f0f1e] text-[10px] text-gray-600 flex items-end pb-0.5 pr-2">Scene</div>
          {rows.map((r) => (
            <button
              key={r.scene.id}
              {...cellHandlers(r)}
              className="text-[9px] leading-none text-gray-500 hover:text-white h-5 flex items-end justify-center pb-0.5"
              style={{ background: cellBg(r.position), opacity: dim(r.position) }}
              title={r.scene.title}
            >
              {r.position === 1 || r.position % labelEvery === 0 ? r.position : ''}
            </button>
          ))}

          {prefs.layers.map((id) => {
            const layer = LAYER_BY_ID[id];
            if (layer.kind === 'metric') {
              const max = p.maxima[layer.id];
              return (
                <Fragment key={id}>
                  <LaneLabel color={layer.color} title={layer.label} sub={layer.id === 'wordcount' ? `max ${max}` : '1–10'} tall />
                  {rows.map((r) => {
                    const v = r.metrics[layer.id];
                    return (
                      <button
                        key={r.scene.id}
                        {...cellHandlers(r)}
                        className="h-14 flex items-end justify-center border-t border-[#1f2a44]"
                        style={{ background: cellBg(r.position), opacity: dim(r.position) }}
                        aria-label={`${r.scene.title}: ${layer.label} ${v ?? 'not set'}`}
                      >
                        {v == null ? (
                          <span className="w-[60%] h-[3px] mb-0.5 rounded-sm border border-dashed border-gray-600" />
                        ) : (
                          <span
                            className="w-[75%] rounded-t-sm"
                            style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: heatColor(v, max) }}
                          />
                        )}
                      </button>
                    );
                  })}
                </Fragment>
              );
            }

            const values = p.valueIndex[layer.id];
            const isOpen = p.expanded.has(layer.id);
            const shown = isOpen ? values : values.slice(0, LANE_CAP);
            return (
              <Fragment key={id}>
                <div className="sticky left-0 z-10 bg-[#0f0f1e] border-t border-[#1f2a44] pt-2 pb-1 pr-2 text-[11px] font-semibold flex items-center gap-1.5" style={{ color: layer.color }}>
                  {layer.label}
                  <span className="text-gray-600 font-normal">{values.length}</span>
                </div>
                <div className="border-t border-[#1f2a44]" style={{ gridColumn: `span ${rows.length}` }} />
                {values.length === 0 && (
                  <>
                    <div className="sticky left-0 z-10 bg-[#0f0f1e] text-[11px] text-gray-600 pr-2 pb-2">Nothing set yet</div>
                    <div style={{ gridColumn: `span ${rows.length}` }} />
                  </>
                )}
                {shown.map((v) => {
                  const focused = p.isFocused(layer.id, v.key);
                  return (
                    <Fragment key={v.key}>
                      <button
                        onClick={() => p.toggleFocus(layer.id, v)}
                        className={`sticky left-0 z-10 bg-[#0f0f1e] text-left text-[11px] pr-2 h-[18px] truncate flex items-center gap-1 ${focused ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
                        title={`${v.label} — ${v.count} scene${v.count === 1 ? '' : 's'}. Click to highlight.`}
                      >
                        {focused && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: layer.color }} />}
                        <span className="truncate">{v.label}</span>
                        <span className="text-gray-600 ml-auto shrink-0">{v.count}</span>
                      </button>
                      {rows.map((r) => {
                        const has = r.keys[layer.id].has(v.key);
                        return (
                          <button
                            key={r.scene.id}
                            {...cellHandlers(r)}
                            className="h-[18px] flex items-center justify-center"
                            style={{ background: cellBg(r.position), opacity: dim(r.position) }}
                            aria-label={`${r.scene.title}: ${has ? '' : 'no '}${v.label}`}
                          >
                            {has
                              ? <span className="w-[80%] h-[12px] rounded-sm" style={{ background: layer.color, boxShadow: focused ? '0 0 0 1px #fff' : undefined }} />
                              : <span className="w-[2px] h-[2px] rounded-full bg-[#2d3748]" />}
                          </button>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {values.length > LANE_CAP && (
                  <>
                    <button
                      onClick={() => p.toggleExpanded(layer.id)}
                      className="sticky left-0 z-10 bg-[#0f0f1e] text-left text-[11px] text-[#9f7aea] hover:text-white pr-2 py-1"
                    >
                      {isOpen ? 'Show fewer' : `Show all ${values.length}`}
                    </button>
                    <div style={{ gridColumn: `span ${rows.length}` }} />
                  </>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-6 p-3 bg-[#16213e] border border-[#0f3460] rounded-lg">
          <p className="text-xs text-gray-400 font-semibold mb-2">Gaps — scenes with nothing set for a selected layer</p>
          <div className="flex flex-col gap-2">
            {missing.map(({ l, lacking }) => (
              <details key={l.id}>
                <summary className="text-xs cursor-pointer" style={{ color: l.color }}>
                  {l.label} <span className="text-gray-500">— {lacking.length} of {rows.length} scenes</span>
                </summary>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {lacking.map((r) => (
                    <button
                      key={r.scene.id}
                      onClick={() => p.openScene(r.scene.id)}
                      className="text-xs text-gray-500 hover:text-gray-300 bg-[#2d3748] px-2 py-0.5 rounded"
                    >
                      {r.position}. {r.scene.title}
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LaneLabel({ color, title, sub, tall }: { color: string; title: string; sub?: string; tall?: boolean }) {
  return (
    <div className={`sticky left-0 z-10 bg-[#0f0f1e] border-t border-[#1f2a44] pr-2 text-[11px] font-semibold flex flex-col justify-center ${tall ? 'h-14' : ''}`} style={{ color }}>
      {title}
      {sub && <span className="text-[10px] text-gray-600 font-normal">{sub}</span>}
    </div>
  );
}

// ─── Bars ────────────────────────────────────────────────────────────────────
// The original tile strip: height from a metric, color from any layer.
// Selected category layers show up below as clickable legends for focusing.

interface BarsProps {
  rows: SceneRow[];
  prefs: MapPrefs;
  patch: (p: Partial<MapPrefs>) => void;
  valueIndex: Record<CategoryLayerId, LayerValue[]>;
  maxima: Record<MetricLayerId, number>;
  matching: Set<number>;
  focusActive: boolean;
  setHoverPos: (p: number | null) => void;
  isFocused: (layer: CategoryLayerId, key: string) => boolean;
  toggleFocus: (layer: CategoryLayerId, v: LayerValue) => void;
  openScene: (id: string) => void;
}

function BarsView(p: BarsProps) {
  const { rows, prefs } = p;
  const colorLayer = prefs.barColor !== 'none' ? LAYER_BY_ID[prefs.barColor] : null;
  const colorMap = colorLayer?.kind === 'category'
    ? valueColors(colorLayer.id, p.valueIndex[colorLayer.id])
    : null;

  function tileColor(r: SceneRow): string {
    if (!colorLayer) return '#6b46c1';
    if (colorLayer.kind === 'metric') {
      const v = r.metrics[colorLayer.id];
      return v == null ? '#2d3748' : heatColor(v, p.maxima[colorLayer.id]);
    }
    // Multi-valued layers color by the scene's first value; the readout lists the rest.
    const first = colorLayer.read(r.scene)[0];
    if (!first) return '#2d3748';
    return colorMap?.get(valueKey(first)) ?? '#2d3748';
  }

  function tileHeight(r: SceneRow): number {
    if (prefs.barHeight === 'none') return 48;
    const v = r.metrics[prefs.barHeight];
    return 20 + ((v ?? 0) / p.maxima[prefs.barHeight]) * 80;
  }

  const legendLayers = prefs.layers
    .filter((id): id is CategoryLayerId => !isMetric(id) && id !== prefs.barColor);

  const metricOptions: [MetricLayerId | 'none', string][] =
    [['none', 'Flat'], ...METRIC_LAYERS.map((l) => [l.id, l.label] as [MetricLayerId, string])];
  const colorOptions: [ColorBy, string][] =
    [['none', 'Nothing'], ...ALL_LAYERS.map((l) => [l.id, l.label] as [ColorBy, string])];

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <Select label="Height" value={prefs.barHeight} onChange={(barHeight) => p.patch({ barHeight })} options={metricOptions} />
        <Select label="Color" value={prefs.barColor} onChange={(barColor) => p.patch({ barColor })} options={colorOptions} />
      </div>

      <div className="flex items-end gap-1 flex-wrap">
        {rows.map((r) => (
          <button
            key={r.scene.id}
            onClick={() => p.openScene(r.scene.id)}
            onMouseEnter={() => p.setHoverPos(r.position)}
            onMouseLeave={() => p.setHoverPos(null)}
            title={r.scene.title}
            className="relative flex-shrink-0 w-8 rounded-t transition-all hover:brightness-125"
            style={{
              height: `${tileHeight(r)}px`,
              background: tileColor(r),
              opacity: p.focusActive && !p.matching.has(r.position) ? 0.15 : 1,
            }}
          >
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] text-white/60 leading-none">
              {r.position}
            </span>
          </button>
        ))}
      </div>

      {colorLayer?.kind === 'metric' && <HeatLegend />}
      {colorLayer?.kind === 'category' && colorMap && (
        <ValueLegend
          layer={colorLayer}
          values={p.valueIndex[colorLayer.id]}
          colorFor={(v) => colorMap.get(v.key) ?? '#4a5568'}
          isFocused={p.isFocused}
          toggleFocus={p.toggleFocus}
          note={colorLayer.multi ? 'Tiles show each scene’s first value; hover for all.' : undefined}
        />
      )}
      {legendLayers.map((id) => (
        <ValueLegend
          key={id}
          layer={LAYER_BY_ID[id] as CategoryLayer}
          values={p.valueIndex[id]}
          colorFor={() => LAYER_BY_ID[id].color}
          isFocused={p.isFocused}
          toggleFocus={p.toggleFocus}
          note="Click to highlight scenes"
        />
      ))}
    </div>
  );
}

function HeatLegend() {
  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="text-xs text-gray-600">Low</span>
      <div className="w-32 h-3 rounded" style={{ background: 'linear-gradient(to right, rgb(45,75,168), rgb(252,50,50))' }} />
      <span className="text-xs text-gray-600">High</span>
      <span className="text-xs text-gray-600 ml-2">Grey = not set</span>
    </div>
  );
}

function ValueLegend({ layer, values, colorFor, isFocused, toggleFocus, note }: {
  layer: CategoryLayer;
  values: LayerValue[];
  colorFor: (v: LayerValue) => string;
  isFocused: (layer: CategoryLayerId, key: string) => boolean;
  toggleFocus: (layer: CategoryLayerId, v: LayerValue) => void;
  note?: string;
}) {
  return (
    <div className="mt-5">
      <div className="text-[11px] font-semibold mb-1.5" style={{ color: layer.color }}>
        {layer.label}
        {note && <span className="text-gray-600 font-normal ml-2">{note}</span>}
      </div>
      {values.length === 0 ? (
        <span className="text-xs text-gray-600">Nothing set yet</span>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {values.map((v) => {
            const focused = isFocused(layer.id, v.key);
            return (
              <button
                key={v.key}
                onClick={() => toggleFocus(layer.id, v)}
                className={`flex items-center gap-1.5 text-xs rounded px-1 ${focused ? 'text-white bg-white/10' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(v) }} />
                {v.label}
                <span className="text-gray-600">{v.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Matrix ──────────────────────────────────────────────────────────────────
// Cross two category layers: each cell is the set of scenes carrying both
// values (characters × motifs, tags × locations, characters × characters…),
// shown as a scene count or the average tension/emotion of those scenes.

interface MatrixProps {
  rows: SceneRow[];
  focusActive: boolean;
  prefs: MapPrefs;
  patch: (p: Partial<MapPrefs>) => void;
  isFocused: (layer: CategoryLayerId, key: string) => boolean;
  setFocus: (f: FocusValue[]) => void;
  openScene: (id: string) => void;
}

function MatrixView(p: MatrixProps) {
  const { rows, prefs } = p;
  const rowLayer = LAYER_BY_ID[prefs.matrixRows] as CategoryLayer;
  const colLayer = LAYER_BY_ID[prefs.matrixCols] as CategoryLayer;
  // Under focus, axes and cells only reflect the focused scenes.
  const rowVals = useMemo(() => indexValues(rowLayer, rows), [rowLayer, rows]);
  const colVals = useMemo(() => indexValues(colLayer, rows), [colLayer, rows]);
  const same = rowLayer.id === colLayer.id;
  const [picked, setPicked] = useState<{ r: string; c: string } | null>(null);

  const cells = useMemo(() => {
    const m = new Map<string, SceneRow[]>();
    for (const scene of rows) {
      for (const rk of scene.keys[rowLayer.id]) {
        for (const ck of scene.keys[colLayer.id]) {
          const k = `${rk}\u0000${ck}`;
          const list = m.get(k);
          if (list) list.push(scene); else m.set(k, [scene]);
        }
      }
    }
    return m;
  }, [rows, rowLayer.id, colLayer.id]);

  function stat(list: SceneRow[] | undefined): number | null {
    if (!list?.length) return null;
    if (prefs.matrixStat === 'count') return list.length;
    const vals = list.map((s) => s.metrics[prefs.matrixStat as MetricLayerId]).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // Scale against the 90th percentile so one ubiquitous value (a POV character
  // in every scene) doesn't wash every other cell out to the same shade.
  const allStats = [...cells.values()].map(stat).filter((v): v is number => v != null).sort((a, b) => a - b);
  const statMax = Math.max(1, allStats[Math.floor((allStats.length - 1) * 0.9)] ?? 1);

  const catOptions = CATEGORY_LAYERS.map((l) => [l.id, l.label] as [CategoryLayerId, string]);
  const statOptions: [CellStat, string][] = [
    ['count', 'Scenes together'], ['tension', 'Avg tension'], ['emotion', 'Avg emotion'], ['wordcount', 'Avg words'],
  ];

  const pickedList = picked ? cells.get(`${picked.r}\u0000${picked.c}`) ?? [] : [];
  const label = (vals: LayerValue[], key: string) => vals.find((v) => v.key === key)?.label ?? key;

  function fmt(v: number): string {
    if (prefs.matrixStat === 'count') return String(v);
    if (prefs.matrixStat === 'wordcount') return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
    return v.toFixed(1);
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <Select label="Rows" value={prefs.matrixRows} onChange={(matrixRows) => { p.patch({ matrixRows }); setPicked(null); }} options={catOptions} />
        <button
          onClick={() => { p.patch({ matrixRows: prefs.matrixCols, matrixCols: prefs.matrixRows }); setPicked(null); }}
          className="text-xs text-gray-500 hover:text-gray-300"
          title="Swap rows and columns"
        >⇄</button>
        <Select label="Columns" value={prefs.matrixCols} onChange={(matrixCols) => { p.patch({ matrixCols }); setPicked(null); }} options={catOptions} />
        <Select label="Cells" value={prefs.matrixStat} onChange={(matrixStat) => p.patch({ matrixStat })} options={statOptions} />
      </div>
      <p className="text-[11px] text-gray-600 mb-3">
        Each cell is the set of scenes that have both values{same ? ' (the diagonal is each value on its own)' : ''}. Click a cell to list its scenes.
        {p.focusActive && <span className="text-[#9f7aea]"> Counting only the {rows.length} highlighted scenes.</span>}
      </p>

      {rowVals.length === 0 || colVals.length === 0 ? (
        <p className="text-sm text-gray-600 mt-8 text-center">
          No scenes have {(rowVals.length === 0 ? rowLayer : colLayer).label.toLowerCase()} set yet.
        </p>
      ) : (
        <div className="flex gap-6 items-start flex-wrap">
          <div className="overflow-auto max-w-full max-h-[70vh] border border-[#1f2a44] rounded">
            <table className="border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-[#0f0f1e] p-1 text-left font-normal">
                    <span style={{ color: rowLayer.color }}>{rowLayer.label}</span>
                    <span className="text-gray-600"> ↓ / </span>
                    <span style={{ color: colLayer.color }}>{colLayer.label}</span>
                    <span className="text-gray-600"> →</span>
                  </th>
                  {colVals.map((c) => (
                    <th key={c.key} className="sticky top-0 z-20 bg-[#0f0f1e] p-0 align-bottom font-normal">
                      <div className="h-28 w-7 flex items-end justify-center pb-1">
                        <span className="[writing-mode:vertical-rl] rotate-180 text-gray-400 truncate max-h-[104px]" title={`${c.label} (${c.count})`}>
                          {c.label}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowVals.map((r) => (
                  <tr key={r.key}>
                    <th className="sticky left-0 z-10 bg-[#0f0f1e] text-left font-normal text-gray-400 pr-2 pl-1 max-w-[180px] truncate" title={`${r.label} (${r.count})`}>
                      {r.label} <span className="text-gray-600">{r.count}</span>
                    </th>
                    {colVals.map((c) => {
                      const list = cells.get(`${r.key}\u0000${c.key}`);
                      const v = stat(list);
                      const isPicked = picked?.r === r.key && picked?.c === c.key;
                      const intensity = v == null ? 0 : Math.min(1, prefs.matrixStat === 'count' || prefs.matrixStat === 'wordcount' ? v / statMax : v / 10);
                      const bg = v == null
                        ? undefined
                        : prefs.matrixStat === 'count'
                          ? `rgba(159,122,234,${0.15 + intensity * 0.85})`
                          : heatColor(intensity * 10, 10);
                      return (
                        <td key={c.key} className="p-[1px]">
                          <button
                            disabled={!list}
                            onClick={() => setPicked(isPicked ? null : { r: r.key, c: c.key })}
                            className={`w-7 h-6 rounded-sm text-[10px] ${v == null ? 'bg-[#16213e]' : 'text-white hover:brightness-125'} ${isPicked ? 'ring-1 ring-white' : ''}`}
                            style={{ background: bg }}
                            title={list ? `${r.label} + ${c.label}: ${list.length} scene${list.length === 1 ? '' : 's'}` : undefined}
                          >
                            {v == null ? '' : fmt(v)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {picked && (
            <div className="w-72 shrink-0 p-3 bg-[#16213e] border border-[#0f3460] rounded-lg">
              <div className="text-xs mb-2">
                <span style={{ color: rowLayer.color }}>{label(rowVals, picked.r)}</span>
                <span className="text-gray-500"> + </span>
                <span style={{ color: colLayer.color }}>{label(colVals, picked.c)}</span>
                <span className="text-gray-500"> — {pickedList.length} scene{pickedList.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex flex-col gap-1 max-h-[50vh] overflow-auto">
                {pickedList.map((s) => (
                  <button
                    key={s.scene.id}
                    onClick={() => p.openScene(s.scene.id)}
                    className="text-left text-xs text-gray-300 hover:text-white hover:bg-white/5 rounded px-1.5 py-0.5"
                  >
                    <span className="text-gray-500">{s.position}.</span> {s.scene.title}
                    {s.metrics.tension != null && <span className="text-gray-600"> · T{s.metrics.tension}</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const f: FocusValue[] = [{ layer: rowLayer.id, key: picked.r, label: label(rowVals, picked.r) }];
                  if (!(same && picked.r === picked.c)) f.push({ layer: colLayer.id, key: picked.c, label: label(colVals, picked.c) });
                  p.setFocus(f);
                  p.patch({ view: 'lanes', layers: Array.from(new Set([...prefs.layers, rowLayer.id, colLayer.id])) });
                }}
                className="mt-3 text-xs text-[#9f7aea] hover:text-white"
              >
                Show these in Lanes →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
