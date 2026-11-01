// Project vocabulary — the free-text themes, motifs and tags attached to
// scenes (and, for themes/tags, to fragments, omitted material and the other
// collections). Nothing constrains these values: every hand-typed entry and
// every AI metadata run can coin a new spelling of an existing idea, so a
// project drifts toward "Grief", "grief", "grief and loss", "Loss & grief"…
//
// This module finds those near-duplicates and rewrites values across the whole
// project. Everything here is pure: callers hand in a snapshot of the
// collections and get back only the collections that actually changed.

import type {
  BinderItem,
  CodexEntry,
  Fragment,
  MoodboardItem,
  NotebookEntry,
  OmittedMaterial,
  ResearchEntry,
} from '../types';

export type VocabField = 'themes' | 'motifs' | 'tags';

export const VOCAB_FIELDS: VocabField[] = ['themes', 'motifs', 'tags'];

export const VOCAB_LABELS: Record<VocabField, string> = {
  themes: 'Themes',
  motifs: 'Motifs',
  tags: 'Tags',
};

export const VOCAB_SINGULAR: Record<VocabField, string> = {
  themes: 'theme',
  motifs: 'motif',
  tags: 'tag',
};

export interface VocabState {
  binder: BinderItem[];
  fragments: Fragment[];
  omittedMaterial: OmittedMaterial[];
  notebookEntries: NotebookEntry[];
  codexEntries: CodexEntry[];
  moodboardItems: MoodboardItem[];
  researchEntries: ResearchEntry[];
}

type FlatCollection = Exclude<keyof VocabState, 'binder'>;

// Which property on each non-scene collection holds each vocabulary field.
// Collections without a themes/motifs property simply don't take part in
// those fields.
const COLLECTION_FIELDS: Record<FlatCollection, Partial<Record<VocabField, string>>> = {
  fragments: { themes: 'relatedThemes', tags: 'tags' },
  omittedMaterial: { themes: 'relatedThemes', tags: 'tags' },
  notebookEntries: { tags: 'tags' },
  codexEntries: { tags: 'tags' },
  moodboardItems: { tags: 'tags' },
  researchEntries: { tags: 'tags' },
};

const FLAT_COLLECTIONS = Object.keys(COLLECTION_FIELDS) as FlatCollection[];

// ─── Normalisation ────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'to', 'for', 'as', 'with', 'vs', 'versus',
]);

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function tokens(value: string): string[] {
  const words = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const content = words.filter((w) => !STOP_WORDS.has(w));
  return (content.length > 0 ? content : words).map(singular);
}

/**
 * Key under which two values are "the same word, spelled differently":
 * case, punctuation, diacritics, possessives, plurals and filler words
 * (the/of/and…) are ignored, but word order is kept.
 */
export function exactKey(value: string): string {
  return tokens(value).join(' ');
}

/** Like exactKey, but word order is ignored too ("loss and grief" = "grief & loss"). */
function bagKey(value: string): string {
  return [...new Set(tokens(value))].sort().join(' ');
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Typo-distance allowed between two keys; short words get none ("fear"/"tear"). */
function typoAllowance(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  if (len >= 12) return 2;
  if (len >= 7) return 1;
  return 0;
}

// ─── Reading the vocabulary ───────────────────────────────────────────────────

export interface VocabEntry {
  value: string;
  /** Number of objects (scenes, fragments, notes…) carrying this exact value. */
  total: number;
  scenes: number;
  /** Titles of a few carriers, for tooltips. */
  examples: string[];
}

function walkScenes(items: BinderItem[], visit: (item: BinderItem) => void, skipTrash: boolean) {
  for (const item of items) {
    if (skipTrash && item.id === 'trash') continue;
    if (item.type === 'document') visit(item);
    if (item.children?.length) walkScenes(item.children, visit, skipTrash);
  }
}

function sceneValues(item: BinderItem, field: VocabField): string[] {
  const v = item.sceneMetadata?.[field];
  return Array.isArray(v) ? v : [];
}

function flatValues(obj: unknown, prop: string | undefined): string[] {
  if (!prop) return [];
  const v = (obj as Record<string, unknown>)[prop];
  return Array.isArray(v) ? (v as string[]) : [];
}

function titleOf(obj: unknown): string {
  const o = obj as { title?: string; name?: string };
  return o.title || o.name || 'Untitled';
}

/** Every distinct value of a field across the project (trash excluded), most-used first. */
export function collectVocabulary(state: VocabState, field: VocabField): VocabEntry[] {
  const map = new Map<string, VocabEntry>();
  const add = (raw: string, isScene: boolean, title: string) => {
    const value = raw.trim();
    if (!value) return;
    let e = map.get(value);
    if (!e) { e = { value, total: 0, scenes: 0, examples: [] }; map.set(value, e); }
    e.total++;
    if (isScene) e.scenes++;
    if (e.examples.length < 4) e.examples.push(title);
  };
  walkScenes(state.binder, (item) => {
    for (const v of new Set(sceneValues(item, field))) add(v, true, item.title);
  }, true);
  for (const coll of FLAT_COLLECTIONS) {
    const prop = COLLECTION_FIELDS[coll][field];
    if (!prop) continue;
    for (const obj of state[coll] as unknown[]) {
      for (const v of new Set(flatValues(obj, prop))) add(v, false, titleOf(obj));
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
}

/** Distinct values of any string-list scene metadata key, for autocomplete. */
export function collectSceneList(binder: BinderItem[], key: 'charactersPresent' | VocabField): string[] {
  const counts = new Map<string, number>();
  walkScenes(binder, (item) => {
    const v = item.sceneMetadata?.[key];
    if (!Array.isArray(v)) return;
    for (const s of v) {
      const t = s.trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }, true);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

/**
 * If `value` is just a different spelling of something already in `existing`
 * (case, plural, punctuation, "the"…), return the existing spelling so new
 * entries reuse it instead of coining a near-duplicate.
 */
export function snapToExisting(value: string, existing: string[]): string {
  const trimmed = value.trim();
  if (!trimmed || existing.includes(trimmed)) return trimmed;
  const key = exactKey(trimmed);
  if (!key) return trimmed;
  return existing.find((e) => exactKey(e) === key) ?? trimmed;
}

/** snapToExisting for a whole list, dropping anything that collapses into a duplicate. */
export function snapListToExisting(values: string[], existing: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const s = snapToExisting(v, [...existing, ...out]);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// ─── Finding near-duplicates ──────────────────────────────────────────────────

export type GroupKind =
  /** Same words; only case/plural/punctuation/filler differ. Safe to merge. */
  | 'spelling'
  /** Same words in a different order, or a probable typo. Worth a look. */
  | 'similar'
  /** One value's words all appear inside the others ("grief" ⊂ "grief and guilt"). */
  | 'contains'
  /** Suggested by the AI as the same concept. */
  | 'ai';

export interface VocabGroup {
  id: string;
  kind: GroupKind;
  /** Values in the group, most-used first. */
  members: string[];
  /** Suggested surviving name. */
  canonical: string;
  /** Members ticked by default. */
  preselected: string[];
  reason?: string;
}

/** The surviving name for a merge: the most-used spelling, ties broken by shorter. */
export function pickCanonical(members: string[], counts: Map<string, number>): string {
  return [...members].sort((a, b) =>
    (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.length - b.length || a.localeCompare(b),
  )[0];
}

export function findDuplicateGroups(entries: VocabEntry[]): VocabGroup[] {
  const values = entries.map((e) => e.value);
  const counts = new Map(entries.map((e) => [e.value, e.total]));
  const n = values.length;
  const exact = values.map(exactKey);
  const bag = values.map(bagKey);
  const tokSets = values.map((v) => new Set(tokens(v)));

  const parent = values.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  // Exact-key and bag-key buckets — O(n).
  const byExact = new Map<string, number[]>();
  const byBag = new Map<string, number[]>();
  values.forEach((_, i) => {
    if (exact[i]) (byExact.get(exact[i]) ?? byExact.set(exact[i], []).get(exact[i])!).push(i);
    if (bag[i]) (byBag.get(bag[i]) ?? byBag.set(bag[i], []).get(bag[i])!).push(i);
  });
  for (const idx of byExact.values()) for (let k = 1; k < idx.length; k++) union(idx[0], idx[k]);
  // Snapshot which components are pure spelling variants before looser links.
  const spellingRoots = new Map<number, number>();
  values.forEach((_, i) => spellingRoots.set(i, find(i)));

  for (const idx of byBag.values()) for (let k = 1; k < idx.length; k++) union(idx[0], idx[k]);

  // Typos — pairwise, but only across exact keys of similar length.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const allow = typoAllowance(exact[i], exact[j]);
      if (allow === 0) continue;
      if (levenshtein(exact[i], exact[j], allow) <= allow) union(i, j);
    }
  }

  const components = new Map<number, number[]>();
  values.forEach((_, i) => {
    const r = find(i);
    (components.get(r) ?? components.set(r, []).get(r)!).push(i);
  });

  const groups: VocabGroup[] = [];
  for (const idx of components.values()) {
    if (idx.length < 2) continue;
    const members = idx.map((i) => values[i]);
    const isSpelling = new Set(idx.map((i) => spellingRoots.get(i))).size === 1;
    groups.push({
      id: `${isSpelling ? 'spelling' : 'similar'}:${exact[idx[0]]}`,
      kind: isSpelling ? 'spelling' : 'similar',
      members: sortByUse(members, counts),
      canonical: pickCanonical(members, counts),
      preselected: members,
      reason: isSpelling
        ? 'Same words — only capitalisation, plurals, punctuation or filler words differ.'
        : 'Same words in a different order, or a likely typo.',
    });
  }

  // "Contains" groups: a short value (1–2 words) whose words all appear in
  // longer values. Built as a star around the short value — never chained —
  // so one common word doesn't sweep half the vocabulary into a single group.
  // Only the canonical spelling of each component acts as a hub, so
  // "Grief"/"grief"/"griefs" yield one group, not three.
  const hubOf = new Map<number, number>();
  for (const idx of components.values()) {
    const name = pickCanonical(idx.map((i) => values[i]), counts);
    hubOf.set(find(idx[0]), idx.find((i) => values[i] === name)!);
  }
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (hubOf.get(find(i)) !== i) continue;
    const t = tokSets[i];
    if (t.size === 0 || t.size > 2) continue;
    const supers: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j || find(i) === find(j)) continue;
      const u = tokSets[j];
      if (u.size <= t.size || u.size > t.size + 3) continue;
      let all = true;
      for (const w of t) if (!u.has(w)) { all = false; break; }
      if (all) supers.push(j);
    }
    if (supers.length === 0) continue;
    const sig = [i, ...supers].map((k) => find(k)).sort((a, b) => a - b).join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const hub = values[i];
    const others = sortByUse(supers.map((j) => values[j]), counts);
    groups.push({
      id: `contains:${exact[i]}`,
      kind: 'contains',
      members: [hub, ...others],
      canonical: hub,
      // Nothing beyond the hub is ticked: "power" vs "political power" is a
      // judgement call only the author can make.
      preselected: [hub],
      reason: `Every word of “${hub}” appears in the others. Tick the ones that really mean the same thing.`,
    });
  }

  const order: Record<GroupKind, number> = { spelling: 0, similar: 1, ai: 2, contains: 3 };
  return groups.sort((a, b) =>
    order[a.kind] - order[b.kind] ||
    groupWeight(b, counts) - groupWeight(a, counts) ||
    a.canonical.localeCompare(b.canonical),
  );
}

function sortByUse(members: string[], counts: Map<string, number>): string[] {
  return [...members].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
}

function groupWeight(g: VocabGroup, counts: Map<string, number>): number {
  return g.members.reduce((s, m) => s + (counts.get(m) ?? 0), 0);
}

// ─── Cross-field overlap ──────────────────────────────────────────────────────

export interface FieldOverlap {
  key: string;
  /** The spellings used in each field where the idea appears, with use counts. */
  byField: Partial<Record<VocabField, { values: string[]; total: number }>>;
}

/** Ideas filed under more than one of themes / motifs / tags. */
export function findFieldOverlaps(byField: Record<VocabField, VocabEntry[]>): FieldOverlap[] {
  const map = new Map<string, FieldOverlap>();
  for (const field of VOCAB_FIELDS) {
    for (const e of byField[field]) {
      const key = exactKey(e.value);
      if (!key) continue;
      let o = map.get(key);
      if (!o) { o = { key, byField: {} }; map.set(key, o); }
      const slot = o.byField[field] ?? (o.byField[field] = { values: [], total: 0 });
      slot.values.push(e.value);
      slot.total += e.total;
    }
  }
  return [...map.values()]
    .filter((o) => Object.keys(o.byField).length > 1)
    .sort((a, b) => totalOf(b) - totalOf(a) || a.key.localeCompare(b.key));
}

function totalOf(o: FieldOverlap): number {
  return Object.values(o.byField).reduce((s, f) => s + (f?.total ?? 0), 0);
}

// ─── Rewriting the vocabulary ────────────────────────────────────────────────

export type VocabOp =
  /** Rename values within one field. A `null` target deletes the value. */
  | { type: 'rename'; field: VocabField; mapping: Record<string, string | null> }
  /**
   * Move values from one field to another under a single name. Objects that
   * have no `to` field (e.g. notebook entries have no themes) are left as-is.
   */
  | { type: 'move'; from: VocabField; to: VocabField; values: string[]; target: string };

export interface VocabOpResult {
  patch: Partial<VocabState>;
  /** Objects (scenes, fragments, …) whose values changed. */
  changed: number;
}

type FieldRecord = Partial<Record<VocabField, string[]>>;

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Apply an op to one object's fields; returns only the fields that changed. */
function applyToRecord(rec: FieldRecord, op: VocabOp): FieldRecord | null {
  const out: FieldRecord = {};
  if (op.type === 'rename') {
    const cur = rec[op.field];
    if (!cur) return null;
    const next = dedupe(cur.map((v) => (v in op.mapping ? op.mapping[v] : v)).filter((v): v is string => !!v));
    if (sameList(cur, next)) return null;
    out[op.field] = next;
    return out;
  }
  const src = rec[op.from];
  const dst = rec[op.to];
  if (!src || !dst) return null;
  const moving = new Set(op.values);
  if (!src.some((v) => moving.has(v))) return null;
  out[op.from] = src.filter((v) => !moving.has(v));
  out[op.to] = dedupe([...dst, op.target]);
  return out;
}

function mapTree(items: BinderItem[], fn: (item: BinderItem) => BinderItem): [BinderItem[], boolean] {
  let any = false;
  const next = items.map((item) => {
    let updated = fn(item);
    if (item.children?.length) {
      const [kids, changed] = mapTree(item.children, fn);
      if (changed) updated = { ...updated, children: kids };
    }
    if (updated !== item) any = true;
    return updated;
  });
  return [any ? next : items, any];
}

/**
 * Apply a rename/merge/delete/move across the whole project — scenes
 * (including those in the trash, so restoring one doesn't resurrect an old
 * spelling) and every collection that carries the field.
 */
export function applyVocabOp(state: VocabState, op: VocabOp): VocabOpResult {
  let changed = 0;
  const patch: Partial<VocabState> = {};

  const [binder, binderChanged] = mapTree(state.binder, (item) => {
    if (!item.sceneMetadata) return item;
    const rec: FieldRecord = {};
    for (const f of VOCAB_FIELDS) rec[f] = sceneValues(item, f);
    const diff = applyToRecord(rec, op);
    if (!diff) return item;
    changed++;
    return { ...item, sceneMetadata: { ...item.sceneMetadata, ...diff } };
  });
  if (binderChanged) patch.binder = binder;

  for (const coll of FLAT_COLLECTIONS) {
    const props = COLLECTION_FIELDS[coll];
    let collChanged = false;
    const next = (state[coll] as unknown[]).map((obj) => {
      const rec: FieldRecord = {};
      for (const f of VOCAB_FIELDS) {
        const p = props[f];
        if (p) rec[f] = flatValues(obj, p);
      }
      const diff = applyToRecord(rec, op);
      if (!diff) return obj;
      changed++;
      collChanged = true;
      const updated: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
      for (const f of Object.keys(diff) as VocabField[]) updated[props[f]!] = diff[f];
      return updated;
    });
    if (collChanged) (patch as Record<string, unknown>)[coll] = next;
  }

  return { patch, changed };
}

/** Every tag actually in use anywhere (including trash), for pruning the tag autocomplete list. */
export function tagsInUse(state: VocabState): Set<string> {
  const used = new Set<string>();
  walkScenes(state.binder, (item) => sceneValues(item, 'tags').forEach((t) => used.add(t.trim().toLowerCase())), false);
  for (const coll of FLAT_COLLECTIONS) {
    for (const obj of state[coll] as unknown[]) flatValues(obj, 'tags').forEach((t) => used.add(t.trim().toLowerCase()));
  }
  return used;
}
