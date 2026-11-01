import type { BinderItem, SceneMetadata } from '../types';

/**
 * Tolerant readers for scene metadata.
 *
 * The types say list fields are string[] and text fields are strings, but
 * stored projects don't always agree: AI output is written into scenes as the
 * model returned it, and older imports predate some fields. A list might
 * arrive as "Mara, Ilya", contain nulls, or hold {name: "Mara"} objects; a
 * text field might be a number or null. Anything that iterates or trims these
 * values should go through here instead of trusting the type.
 */

function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['name', 'label', 'title', 'value']) {
      if (typeof o[k] === 'string') return (o[k] as string).trim();
    }
  }
  return '';
}

/** A single text value; '' when missing or unusable. */
export function toText(v: unknown): string {
  return textOf(v);
}

/** A list of non-empty strings. A bare string is treated as a comma-separated list. */
export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  const one = textOf(v);
  return one ? [one] : [];
}

/** A 1–10 scale value; null when unset, zero or not a number ("7" is accepted). */
export function toScale(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

// ─── Whole-project clean-up ─────────────────────────────────────────────────
// Applied wherever project data enters the store (local load, cloud load,
// backup import, item updates) so components can trust the declared types.
// Without this, one malformed value crashes any view that renders it, and
// because the current view is persisted, reloading lands straight back on
// the crash.

const LIST_FIELDS = ['charactersPresent', 'themes', 'motifs', 'tags'] as const;
const TEXT_FIELDS = [
  'povCharacter', 'location', 'locationOverall', 'timelineDateStart', 'timelineSpecificDate',
  'timelineDateEnd', 'timelineLabel', 'timelineNotes', 'plotline', 'sceneFunction',
  'unansweredQuestions', 'whatChanged',
] as const;
const SCALE_FIELDS = ['emotionalTemperature', 'tensionLevel'] as const;
const ORDER_FIELDS = ['manuscriptOrder', 'chronologicalOrder'] as const;

/** Text that may have been stored as a list ("questions" from an AI run). */
function textOrJoined(v: unknown): string {
  return Array.isArray(v) ? toList(v).join(', ') : textOf(v);
}

/**
 * Coerce scene metadata to its declared shape. Only keys that are present are
 * touched (absent stays absent) and unknown keys are kept, so nothing is lost.
 * Returns the same object when it was already clean.
 */
export function normalizeSceneMetadata(meta: unknown): Partial<SceneMetadata> | undefined {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const src = meta as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  let changed = false;
  const put = (k: string, v: unknown) => {
    if (out[k] !== v) { out[k] = v; changed = true; }
  };
  for (const k of LIST_FIELDS) {
    if (!(k in src)) continue;
    const v = src[k];
    const clean = toList(v);
    if (!Array.isArray(v) || v.length !== clean.length || v.some((x, i) => x !== clean[i])) put(k, clean);
  }
  for (const k of TEXT_FIELDS) {
    if (k in src && typeof src[k] !== 'string') put(k, textOrJoined(src[k]));
  }
  for (const k of SCALE_FIELDS) {
    if (!(k in src) || typeof src[k] === 'number' || src[k] === undefined) continue;
    put(k, toScale(src[k]) ?? undefined);
  }
  for (const k of ORDER_FIELDS) {
    if (!(k in src) || typeof src[k] === 'number' || src[k] === undefined) continue;
    const n = typeof src[k] === 'string' ? Number((src[k] as string).trim()) : NaN;
    put(k, Number.isFinite(n) ? n : undefined);
  }
  if ('timelineUncertain' in src && typeof src.timelineUncertain !== 'boolean' && src.timelineUncertain !== undefined) {
    put('timelineUncertain', src.timelineUncertain === true || src.timelineUncertain === 'true');
  }
  return changed ? (out as Partial<SceneMetadata>) : (meta as Partial<SceneMetadata>);
}

/** Clean one binder item and its subtree. Returns the same object when nothing changed. */
export function normalizeBinderItem(raw: unknown): BinderItem | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as BinderItem;
  const fixes: Partial<BinderItem> = {};
  for (const k of ['title', 'content', 'synopsis', 'notes'] as const) {
    if (typeof item[k] !== 'string') fixes[k] = textOrJoined(item[k]);
  }
  if (typeof item.status !== 'string') fixes.status = 'No Status';
  if (!Array.isArray(item.snapshots)) fixes.snapshots = [];
  const kids = normalizeBinder(item.children);
  if (kids !== item.children) fixes.children = kids;
  if ('sceneMetadata' in item) {
    const meta = normalizeSceneMetadata(item.sceneMetadata);
    if (meta !== item.sceneMetadata) fixes.sceneMetadata = meta;
  }
  return Object.keys(fixes).length ? { ...item, ...fixes } : item;
}

/** Clean a whole binder tree. Returns the same array when nothing changed. */
export function normalizeBinder(items: unknown): BinderItem[] {
  if (!Array.isArray(items)) return [];
  let changed = false;
  const out: BinderItem[] = [];
  for (const raw of items) {
    const clean = normalizeBinderItem(raw);
    if (clean !== raw) changed = true;
    if (clean) out.push(clean);
  }
  return changed ? out : (items as BinderItem[]);
}
