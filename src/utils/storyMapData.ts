import type { BinderItem, SceneMetadata } from '../types';

/**
 * Data model behind the Structural Map. Kept separate from the component so
 * the layer definitions and the indexing logic are plain functions.
 *
 * A "layer" is one dimension of scene metadata the map can show:
 *  - metric layers have one number per scene (tension, emotion, word count);
 *  - category layers have zero or more string values per scene (POV, tags,
 *    characters present, …). Single-valued fields like POV are just category
 *    layers whose scenes happen to have at most one value.
 */

export type MetricLayerId = 'tension' | 'emotion' | 'wordcount';
export type CategoryLayerId =
  | 'status'
  | 'pov'
  | 'plotline'
  | 'location'
  | 'region'
  | 'characters'
  | 'tags'
  | 'motifs'
  | 'themes';
export type LayerId = MetricLayerId | CategoryLayerId;

type Meta = Partial<SceneMetadata>;

interface LayerBase {
  label: string;
  /** Accent color for this layer's lanes and chips. */
  color: string;
}

export interface MetricLayer extends LayerBase {
  id: MetricLayerId;
  kind: 'metric';
  /** null = not set for this scene. */
  read: (scene: BinderItem, words: number) => number | null;
}

export interface CategoryLayer extends LayerBase {
  id: CategoryLayerId;
  kind: 'category';
  /** True when a scene can carry several values (characters, tags…). */
  multi: boolean;
  read: (scene: BinderItem) => string[];
}

export type Layer = MetricLayer | CategoryLayer;

/** 1–10 scale fields treat 0/undefined as "not set", like the Inspector does. */
function scale(v: number | undefined): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

function one(v: string | undefined): string[] {
  const t = v?.trim();
  return t ? [t] : [];
}

function many(v: string[] | undefined): string[] {
  return (v ?? []).map((s) => s.trim()).filter(Boolean);
}

const meta = (s: BinderItem): Meta => s.sceneMetadata ?? {};

export const METRIC_LAYERS: MetricLayer[] = [
  { id: 'tension', kind: 'metric', label: 'Tension', color: '#fc8181', read: (s) => scale(meta(s).tensionLevel) },
  { id: 'emotion', kind: 'metric', label: 'Emotion', color: '#f6ad55', read: (s) => scale(meta(s).emotionalTemperature) },
  { id: 'wordcount', kind: 'metric', label: 'Word count', color: '#63b3ed', read: (_s, words) => (words > 0 ? words : null) },
];

export const CATEGORY_LAYERS: CategoryLayer[] = [
  { id: 'characters', kind: 'category', multi: true, label: 'Characters present', color: '#b794f4', read: (s) => many(meta(s).charactersPresent) },
  { id: 'pov', kind: 'category', multi: false, label: 'POV', color: '#9f7aea', read: (s) => one(meta(s).povCharacter) },
  { id: 'tags', kind: 'category', multi: true, label: 'Tags', color: '#68d391', read: (s) => many(meta(s).tags) },
  { id: 'motifs', kind: 'category', multi: true, label: 'Motifs', color: '#f6e05e', read: (s) => many(meta(s).motifs) },
  { id: 'themes', kind: 'category', multi: true, label: 'Themes', color: '#ed64a6', read: (s) => many(meta(s).themes) },
  { id: 'location', kind: 'category', multi: false, label: 'Location', color: '#4fd1c5', read: (s) => one(meta(s).location) },
  { id: 'region', kind: 'category', multi: false, label: 'Overall location', color: '#38b2ac', read: (s) => one(meta(s).locationOverall) },
  { id: 'plotline', kind: 'category', multi: false, label: 'Plotline', color: '#f687b3', read: (s) => one(meta(s).plotline) },
  { id: 'status', kind: 'category', multi: false, label: 'Status', color: '#a0aec0', read: (s) => (s.status && s.status !== 'No Status' ? [s.status] : []) },
];

export const ALL_LAYERS: Layer[] = [...METRIC_LAYERS, ...CATEGORY_LAYERS];

export const LAYER_BY_ID = Object.fromEntries(ALL_LAYERS.map((l) => [l.id, l])) as Record<LayerId, Layer>;

export function isMetric(id: LayerId): id is MetricLayerId {
  return LAYER_BY_ID[id]?.kind === 'metric';
}

/** Values are grouped case- and whitespace-insensitively ("Mara" == "mara "). */
export function valueKey(v: string): string {
  return v.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface SceneRow {
  scene: BinderItem;
  /** 1-based position in the current ordering. */
  position: number;
  words: number;
  metrics: Record<MetricLayerId, number | null>;
  /** Normalized value keys per category layer. */
  keys: Record<CategoryLayerId, Set<string>>;
}

export interface LayerValue {
  key: string;
  /** Display label: the first spelling seen in story order. */
  label: string;
  count: number;
  firstPosition: number;
}

export function countWords(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

export function buildRows(ordered: BinderItem[]): SceneRow[] {
  return ordered.map((scene, i) => {
    const words = countWords(scene.content);
    const metrics = {} as Record<MetricLayerId, number | null>;
    for (const l of METRIC_LAYERS) metrics[l.id] = l.read(scene, words);
    const keys = {} as Record<CategoryLayerId, Set<string>>;
    for (const l of CATEGORY_LAYERS) keys[l.id] = new Set(l.read(scene).map(valueKey));
    return { scene, position: i + 1, words, metrics, keys };
  });
}

/**
 * Distinct values of a category layer across the given scenes, most frequent
 * first; ties keep story order (first appearance).
 */
export function indexValues(layer: CategoryLayer, rows: SceneRow[]): LayerValue[] {
  const byKey = new Map<string, LayerValue>();
  for (const row of rows) {
    const seenHere = new Set<string>();
    for (const raw of layer.read(row.scene)) {
      const key = valueKey(raw);
      if (seenHere.has(key)) continue;
      seenHere.add(key);
      const existing = byKey.get(key);
      if (existing) existing.count++;
      else byKey.set(key, { key, label: raw.trim(), count: 1, firstPosition: row.position });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.firstPosition - b.firstPosition);
}

export interface FocusValue {
  layer: CategoryLayerId;
  key: string;
  label: string;
}

/** A scene matches when it carries every focused value (AND, not OR). */
export function matchesFocus(row: SceneRow, focus: FocusValue[]): boolean {
  return focus.every((f) => row.keys[f.layer].has(f.key));
}

export function metricMax(id: MetricLayerId, rows: SceneRow[]): number {
  if (id !== 'wordcount') return 10;
  return Math.max(1, ...rows.map((r) => r.words));
}

/** Blue (low) → red (high), same ramp the map has always used. */
export function heatColor(value: number, max = 10): string {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = Math.round(pct * 252 + (1 - pct) * 45);
  const g = Math.round(pct * 50 + (1 - pct) * 75);
  const b = Math.round(pct * 50 + (1 - pct) * 168);
  return `rgb(${r},${g},${b})`;
}

export const STATUS_COLORS: Record<string, string> = {
  'No Status': '#4a5568', 'To Do': '#63b3ed', 'In Progress': '#f6ad55',
  'First Draft': '#68d391', 'Revised Draft': '#b794f4', 'Final Draft': '#6b46c1', 'Done': '#48bb78',
};

export const VALUE_PALETTE = [
  '#6b46c1', '#f6ad55', '#68d391', '#fc8181', '#63b3ed', '#f6e05e',
  '#b794f4', '#ed8936', '#4fd1c5', '#f687b3', '#9ae6b4', '#90cdf4',
];
