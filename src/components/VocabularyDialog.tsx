import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  VOCAB_FIELDS,
  VOCAB_LABELS,
  VOCAB_SINGULAR,
  collectVocabulary,
  findDuplicateGroups,
  findFieldOverlaps,
  pickCanonical,
  tagsInUse,
  type FieldOverlap,
  type VocabEntry,
  type VocabField,
  type VocabGroup,
} from '../utils/vocabulary';

type Tab = VocabField | 'overlaps';

/** Wraps a batch of store changes so the dialog can undo it. Returns objects changed. */
type Run = (label: string, fn: () => number) => number;

const UNDO_KEYS = [
  'binder', 'fragments', 'omittedMaterial', 'notebookEntries', 'codexEntries',
  'moodboardItems', 'researchEntries', 'projectTags',
] as const;
type UndoSnap = Pick<ReturnType<typeof useAppStore.getState>, (typeof UNDO_KEYS)[number]>;

function takeSnap(): UndoSnap {
  const s = useAppStore.getState();
  return Object.fromEntries(UNDO_KEYS.map((k) => [k, s[k]])) as UndoSnap;
}

const DISMISSED_KEY = 'bb.vocab.dismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-2000))); } catch { /* storage unavailable */ }
}

const KIND_BADGE: Record<VocabGroup['kind'], { label: string; cls: string }> = {
  spelling: { label: 'Same word', cls: 'bg-green-900/50 text-green-300' },
  similar: { label: 'Reordered / typo', cls: 'bg-yellow-900/50 text-yellow-300' },
  ai: { label: 'AI: same idea', cls: 'bg-purple-900/50 text-purple-300' },
  contains: { label: 'Overlapping words', cls: 'bg-blue-900/50 text-blue-300' },
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ─── Suggested-merge card ────────────────────────────────────────────────────

function GroupCard({
  group, counts, onMerge, onDismiss,
}: {
  group: VocabGroup;
  counts: Map<string, number>;
  onMerge: (members: string[], into: string) => void;
  onDismiss: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(group.preselected));
  const [into, setInto] = useState(group.canonical);
  const badge = KIND_BADGE[group.kind];
  const ticked = group.members.filter((m) => checked.has(m));
  const target = into.trim();
  const willChange = ticked.filter((m) => m !== target);
  const canMerge = !!target && willChange.length > 0 && (ticked.length >= 2 || !group.members.includes(target));

  function toggle(m: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  return (
    <div className="border border-[#2d3748] rounded-lg p-3 bg-[#16213e]/60">
      <div className="flex items-start gap-2 mb-2">
        <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 ${badge.cls}`}>{badge.label}</span>
        {group.reason && <span className="text-xs text-gray-500 leading-snug">{group.reason}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {group.members.map((m) => (
          <label
            key={m}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs cursor-pointer border transition-colors ${
              checked.has(m) ? 'border-[#6b46c1] bg-[#6b46c1]/25 text-white' : 'border-[#2d3748] text-gray-400 hover:text-gray-200'
            }`}
          >
            <input type="checkbox" className="accent-[#6b46c1]" checked={checked.has(m)} onChange={() => toggle(m)} />
            <span>{m}</span>
            <span className="text-gray-500">{counts.get(m) ?? 0}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Merge ticked into</span>
        <input
          value={into}
          onChange={(e) => setInto(e.target.value)}
          list={`vocab-into-${group.id}`}
          className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1 text-xs text-white outline-none focus:border-[#6b46c1] w-44"
        />
        <datalist id={`vocab-into-${group.id}`}>
          {group.members.map((m) => <option key={m} value={m} />)}
        </datalist>
        <button
          disabled={!canMerge}
          onClick={() => onMerge(ticked, target)}
          className="px-2.5 py-1 rounded text-xs bg-[#6b46c1] text-white hover:bg-[#7c5cd6] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Merge
        </button>
        <div className="flex-1" />
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-300" title="Hide this suggestion">
          Not the same
        </button>
      </div>
    </div>
  );
}

// ─── One field (themes / motifs / tags) ──────────────────────────────────────

function FieldPanel({
  field, entries, onStatus, run,
}: {
  field: VocabField;
  entries: VocabEntry[];
  onStatus: (msg: string) => void;
  run: Run;
}) {
  const applyVocabularyOp = useAppStore((s) => s.applyVocabularyOp);
  const pruneUnusedTags = useAppStore((s) => s.pruneUnusedTags);
  const projectTags = useAppStore((s) => s.projectTags);
  const aiSettings = useAppStore((s) => s.aiSettings);
  const storyBrief = useAppStore((s) => s.storyBrief);

  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [aiGroups, setAiGroups] = useState<VocabGroup[]>([]);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [aiError, setAiError] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'count' | 'alpha'>('count');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeInto, setMergeInto] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const counts = useMemo(() => new Map(entries.map((e) => [e.value, e.total])), [entries]);
  const existing = useMemo(() => new Set(entries.map((e) => e.value)), [entries]);

  const groups = useMemo(() => {
    const auto = findDuplicateGroups(entries);
    // AI groups survive merges only while ≥2 of their members still exist.
    const ai = aiGroups
      .map((g) => ({ ...g, members: g.members.filter((m) => existing.has(m)) }))
      .filter((g) => g.members.length >= 2)
      .map((g) => ({ ...g, preselected: g.members }));
    return [...auto, ...ai].filter((g) => !dismissed.has(`${field}:${g.id}:${[...g.members].sort().join('|')}`));
  }, [entries, aiGroups, existing, dismissed, field]);

  const spellingGroups = groups.filter((g) => g.kind === 'spelling');
  const unusedTagCount = useMemo(() => {
    if (field !== 'tags') return 0;
    const used = tagsInUse(useAppStore.getState());
    return projectTags.filter((t) => !used.has(t.name.trim().toLowerCase())).length;
  }, [field, projectTags]);

  const visible = useMemo(() => {
    const lc = filter.trim().toLowerCase();
    const list = lc ? entries.filter((e) => e.value.toLowerCase().includes(lc)) : entries;
    return sort === 'alpha' ? [...list].sort((a, b) => a.value.localeCompare(b.value)) : list;
  }, [entries, filter, sort]);

  const singular = VOCAB_SINGULAR[field];

  function rename(mapping: Record<string, string | null>, description: string) {
    const changed = run(description, () => applyVocabularyOp({ type: 'rename', field, mapping }, description));
    onStatus(changed > 0 ? `${description} — ${plural(changed, 'item')} updated.` : 'Nothing to change.');
    setSelected(new Set());
  }

  function merge(members: string[], into: string) {
    const mapping: Record<string, string> = {};
    for (const m of members) if (m !== into) mapping[m] = into;
    if (Object.keys(mapping).length === 0) return;
    rename(mapping, `Merged ${members.filter((m) => m !== into).map((m) => `“${m}”`).join(', ')} into “${into}”`);
  }

  function mergeAllSpelling() {
    const mapping: Record<string, string> = {};
    for (const g of spellingGroups) for (const m of g.members) if (m !== g.canonical) mapping[m] = g.canonical;
    const n = Object.keys(mapping).length;
    if (n === 0) return;
    rename(mapping, `Merged ${plural(n, 'spelling variant')} in ${plural(spellingGroups.length, 'group')}`);
  }

  function dismiss(g: VocabGroup) {
    const next = new Set(dismissed);
    next.add(`${field}:${g.id}:${[...g.members].sort().join('|')}`);
    setDismissed(next);
    saveDismissed(next);
  }

  function move(values: string[], to: VocabField) {
    const target = pickCanonical(values, counts);
    const label = `Moved ${values.map((v) => `“${v}”`).join(', ')} from ${VOCAB_LABELS[field].toLowerCase()} to ${VOCAB_LABELS[to].toLowerCase()} as “${target}”`;
    const changed = run(label, () => applyVocabularyOp({ type: 'move', from: field, to, values, target }, label));
    onStatus(changed > 0
      ? `Moved to ${VOCAB_LABELS[to].toLowerCase()} on ${plural(changed, 'item')}.`
      : `Nothing moved — none of those items have a ${VOCAB_SINGULAR[to]} field.`);
    setSelected(new Set());
  }

  function remove(values: string[]) {
    const total = values.reduce((s, v) => s + (counts.get(v) ?? 0), 0);
    if (!window.confirm(`Remove ${values.length === 1 ? `“${values[0]}”` : plural(values.length, singular)} from ${plural(total, 'item')}? You can undo this until you close this window.`)) return;
    rename(Object.fromEntries(values.map((v) => [v, null])), `Removed ${values.map((v) => `“${v}”`).join(', ')}`);
  }

  function commitEdit() {
    if (editing === null) return;
    const to = editValue.trim();
    if (to && to !== editing) rename({ [editing]: to }, `Renamed “${editing}” to “${to}”`);
    setEditing(null);
  }

  async function askAI() {
    setAiState('loading');
    setAiError('');
    try {
      const brief = storyBrief?.content;
      const res = await fetch('/api/ai/consolidate-vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          values: entries.map((e) => ({ value: e.value, count: e.total })),
          mode: aiSettings.mode,
          allowDrafting: aiSettings.allowDrafting,
          storyContext: brief && brief.length > 50_000 ? brief.slice(0, 50_000) : brief,
        }),
      });
      const data = await res.json().catch(() => ({})) as { groups?: Array<{ canonical: string; members: string[]; reason: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Server returned ${res.status}`);
      const found = (data.groups ?? []).map((g, i) => ({
        id: `ai:${i}:${g.canonical}`,
        kind: 'ai' as const,
        members: [...g.members].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)),
        canonical: g.canonical,
        preselected: g.members,
        reason: g.reason,
      }));
      setAiGroups(found);
      setAiState('done');
      onStatus(found.length > 0 ? `AI suggested ${plural(found.length, 'group')} of synonyms.` : 'AI found no synonyms worth merging.');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
      setAiState('error');
    }
  }

  const selectedList = entries.filter((e) => selected.has(e.value)).map((e) => e.value);
  const otherFields = VOCAB_FIELDS.filter((f) => f !== field);

  return (
    <div className="space-y-5">
      {/* Suggested merges */}
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-white">Suggested merges</h3>
          <span className="text-xs text-gray-500">{groups.length}</span>
          <div className="flex-1" />
          {spellingGroups.length > 0 && (
            <button
              onClick={mergeAllSpelling}
              className="px-2.5 py-1 rounded text-xs bg-green-800/70 text-green-100 hover:bg-green-700"
              title="Merge every 'Same word' group into its most-used spelling"
            >
              Merge all {spellingGroups.length} “same word” groups
            </button>
          )}
          <button
            onClick={askAI}
            disabled={aiState === 'loading' || aiSettings.mode === 'disabled' || entries.length < 2}
            title={aiSettings.mode === 'disabled' ? 'AI is turned off in AI settings' : 'Send this list of names (not your manuscript) to the AI to find synonyms'}
            className="px-2.5 py-1 rounded text-xs border border-[#6b46c1] text-purple-200 hover:bg-[#6b46c1]/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {aiState === 'loading' ? 'Asking AI…' : '✨ Find synonyms with AI'}
          </button>
        </div>
        {aiState === 'error' && <p className="text-xs text-red-400 mb-2">AI failed: {aiError}</p>}
        {groups.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No look-alikes found by spelling.{aiState === 'idle' ? ' Synonyms (“grief” / “mourning”) need the AI button.' : ''}
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <GroupCard
                key={`${g.id}:${g.members.join('|')}`}
                group={g}
                counts={counts}
                onMerge={merge}
                onDismiss={() => dismiss(g)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Tag registry clean-up */}
      {field === 'tags' && unusedTagCount > 0 && (
        <section className="border border-[#2d3748] rounded-lg p-3 text-xs text-gray-400 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[200px]">
            The tag autocomplete list holds {plural(unusedTagCount, 'name')} that nothing uses as a tag. Until now, every
            character, theme and motif typed into a box was also added to this list, so it fills up with non-tags.
          </span>
          <button
            onClick={() => { const n = run('Cleared unused tag names', pruneUnusedTags); onStatus(`Removed ${plural(n, 'unused name')} from tag autocomplete.`); }}
            className="px-2.5 py-1 rounded bg-[#2d3748] text-gray-200 hover:bg-[#3d4a60]"
          >
            Clear them out
          </button>
        </section>
      )}

      {/* Full list */}
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-white">All {VOCAB_LABELS[field].toLowerCase()}</h3>
          <span className="text-xs text-gray-500">{entries.length}</span>
          <div className="flex-1" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1 text-xs text-white outline-none focus:border-[#6b46c1] w-36"
          />
          <button
            onClick={() => setSort(sort === 'count' ? 'alpha' : 'count')}
            className="text-xs text-gray-400 hover:text-white"
          >
            Sort: {sort === 'count' ? 'most used' : 'A–Z'}
          </button>
        </div>

        {selectedList.length > 0 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 mb-2 p-2 rounded bg-[#0f3460] border border-[#6b46c1]/50 text-xs">
            <span className="text-white">{selectedList.length} selected</span>
            <span className="text-gray-400">· merge into</span>
            <input
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              placeholder={pickCanonical(selectedList, counts)}
              list="vocab-merge-into"
              className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1 text-white outline-none focus:border-[#6b46c1] w-40"
            />
            <datalist id="vocab-merge-into">{selectedList.map((v) => <option key={v} value={v} />)}</datalist>
            <button
              onClick={() => { merge(selectedList, mergeInto.trim() || pickCanonical(selectedList, counts)); setMergeInto(''); }}
              disabled={selectedList.length < 2 && !mergeInto.trim()}
              className="px-2 py-1 rounded bg-[#6b46c1] text-white hover:bg-[#7c5cd6] disabled:opacity-40"
            >
              Merge
            </button>
            <span className="text-gray-500">|</span>
            {otherFields.map((f) => (
              <button key={f} onClick={() => move(selectedList, f)} className="px-2 py-1 rounded bg-[#2d3748] text-gray-200 hover:bg-[#3d4a60]">
                Make {VOCAB_SINGULAR[f]}
              </button>
            ))}
            <button onClick={() => remove(selectedList)} className="px-2 py-1 rounded bg-red-900/60 text-red-200 hover:bg-red-800">
              Remove
            </button>
            <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:text-white ml-auto">Clear</button>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No {VOCAB_LABELS[field].toLowerCase()} yet.</p>
        ) : (
          <div className="divide-y divide-[#2d3748]/60 border border-[#2d3748] rounded">
            {visible.map((e) => (
              <div key={e.value} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-[#16213e]">
                <input
                  type="checkbox"
                  className="accent-[#6b46c1]"
                  checked={selected.has(e.value)}
                  onChange={() => setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(e.value)) next.delete(e.value); else next.add(e.value);
                    return next;
                  })}
                />
                {editing === e.value ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(ev) => setEditValue(ev.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') commitEdit(); if (ev.key === 'Escape') setEditing(null); }}
                    className="flex-1 bg-[#0d1117] border border-[#6b46c1] rounded px-1.5 py-0.5 text-sm text-white outline-none"
                  />
                ) : (
                  <button
                    className="flex-1 text-left text-gray-200 truncate"
                    title={`Click to rename everywhere · used in: ${e.examples.join(', ')}${e.total > e.examples.length ? '…' : ''}`}
                    onClick={() => { setEditing(e.value); setEditValue(e.value); }}
                  >
                    {e.value}
                  </button>
                )}
                <span className="text-xs text-gray-500 tabular-nums shrink-0" title={`${plural(e.scenes, 'scene')}, ${plural(e.total - e.scenes, 'other item')}`}>
                  {e.total}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-600 mt-2">
          Click a name to rename it everywhere. Renaming to a name that already exists merges the two.
        </p>
      </section>
    </div>
  );
}

// ─── Overlaps between fields ─────────────────────────────────────────────────

function OverlapsPanel({ overlaps, onStatus, run }: { overlaps: FieldOverlap[]; onStatus: (msg: string) => void; run: Run }) {
  const applyVocabularyOp = useAppStore((s) => s.applyVocabularyOp);
  const [kept, setKept] = useState<Set<string>>(new Set());

  function keepAs(o: FieldOverlap, to: VocabField) {
    const all = Object.values(o.byField).flatMap((f) => f?.values ?? []);
    const slot = o.byField[to];
    // Prefer the spelling already used in the destination field.
    const target = slot ? slot.values[0] : all[0];
    const changed = run(`Kept “${target}” as a ${VOCAB_SINGULAR[to]} only`, () => moveAll(o, to, target));
    onStatus(`“${target}” is now only a ${VOCAB_SINGULAR[to]} — ${plural(changed, 'item')} updated.`);
  }

  function moveAll(o: FieldOverlap, to: VocabField, target: string): number {
    const slot = o.byField[to];
    let changed = 0;
    if (slot) {
      const mapping = Object.fromEntries(slot.values.filter((v) => v !== target).map((v) => [v, target]));
      if (Object.keys(mapping).length) changed += applyVocabularyOp({ type: 'rename', field: to, mapping }, `Unified spelling of “${target}”`);
    }
    for (const from of VOCAB_FIELDS) {
      const src = o.byField[from];
      if (from === to || !src) continue;
      changed += applyVocabularyOp(
        { type: 'move', from, to, values: src.values, target },
        `Moved “${src.values.join('”, “')}” from ${VOCAB_LABELS[from].toLowerCase()} to ${VOCAB_LABELS[to].toLowerCase()}`,
      );
    }
    return changed;
  }

  const visible = overlaps.filter((o) => !kept.has(o.key));
  if (visible.length === 0) {
    return <p className="text-xs text-gray-500 italic">No idea is filed under more than one of themes, motifs and tags.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        These ideas are filed as more than one kind. A <b className="text-gray-300">theme</b> is an abstract idea the book explores,
        a <b className="text-gray-300">motif</b> is a concrete recurring image or object, and a <b className="text-gray-300">tag</b> is an
        organisational label. Pick where each belongs. (Notes, research, codex and moodboard items only have tags, so their tags are left alone.)
      </p>
      {visible.map((o) => (
        <div key={o.key} className="border border-[#2d3748] rounded-lg p-3 bg-[#16213e]/60 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[220px] flex flex-wrap gap-1.5">
            {VOCAB_FIELDS.filter((f) => o.byField[f]).map((f) => (
              <span key={f} className="text-xs rounded px-2 py-1 bg-[#0d1117] border border-[#2d3748] text-gray-300">
                <span className="text-gray-500">{VOCAB_SINGULAR[f]}:</span> {o.byField[f]!.values.join(' / ')}{' '}
                <span className="text-gray-500">{o.byField[f]!.total}</span>
              </span>
            ))}
          </div>
          <span className="text-xs text-gray-500">Keep as</span>
          {VOCAB_FIELDS.map((f) => (
            <button
              key={f}
              onClick={() => keepAs(o, f)}
              className="px-2 py-1 rounded text-xs bg-[#2d3748] text-gray-200 hover:bg-[#6b46c1]"
            >
              {VOCAB_SINGULAR[f]}
            </button>
          ))}
          <button
            onClick={() => setKept((prev) => new Set(prev).add(o.key))}
            className="text-xs text-gray-500 hover:text-gray-300"
            title="Leave it in both places"
          >
            Leave
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

export function VocabularyDialog({ onClose, initialTab = 'themes' }: { onClose: () => void; initialTab?: Tab }) {
  const binder = useAppStore((s) => s.binder);
  const fragments = useAppStore((s) => s.fragments);
  const omittedMaterial = useAppStore((s) => s.omittedMaterial);
  const notebookEntries = useAppStore((s) => s.notebookEntries);
  const codexEntries = useAppStore((s) => s.codexEntries);
  const moodboardItems = useAppStore((s) => s.moodboardItems);
  const researchEntries = useAppStore((s) => s.researchEntries);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [status, setStatus] = useState('');
  // While this modal is open nothing else can edit the project, so restoring a
  // pre-change snapshot of the touched collections is a safe, exact undo.
  const [undoStack, setUndoStack] = useState<Array<{ label: string; snap: UndoSnap }>>([]);

  const run: Run = (label, fn) => {
    const snap = takeSnap();
    const changed = fn();
    if (changed > 0) setUndoStack((st) => [...st.slice(-49), { label, snap }]);
    return changed;
  };

  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    useAppStore.setState(last.snap);
    setUndoStack((st) => st.slice(0, -1));
    setStatus(`Undid: ${last.label}`);
  }

  const byField = useMemo(() => {
    const state = { binder, fragments, omittedMaterial, notebookEntries, codexEntries, moodboardItems, researchEntries };
    return Object.fromEntries(VOCAB_FIELDS.map((f) => [f, collectVocabulary(state, f)])) as Record<VocabField, VocabEntry[]>;
  }, [binder, fragments, omittedMaterial, notebookEntries, codexEntries, moodboardItems, researchEntries]);

  const overlaps = useMemo(() => findFieldOverlaps(byField), [byField]);
  const dupCounts = useMemo(
    () => Object.fromEntries(VOCAB_FIELDS.map((f) => [f, findDuplicateGroups(byField[f]).filter((g) => g.kind !== 'contains').length])) as Record<VocabField, number>,
    [byField],
  );

  const tabs: { id: Tab; label: string; count: number; flag: number }[] = [
    ...VOCAB_FIELDS.map((f) => ({ id: f as Tab, label: VOCAB_LABELS[f], count: byField[f].length, flag: dupCounts[f] })),
    { id: 'overlaps', label: 'In two places', count: overlaps.length, flag: overlaps.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] border border-[#0f3460] rounded-xl shadow-2xl w-full max-w-[860px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#0f3460] shrink-0">
          <div>
            <div className="text-white font-semibold text-sm">🏷️ Clean up themes, motifs & tags</div>
            <div className="text-xs text-gray-500">Changes apply to every scene, fragment and note that uses the name.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-[#0f3460] overflow-x-auto shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setStatus(''); }}
              className={`px-3 py-1.5 text-xs rounded-t whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-[#6b46c1] text-white' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label} <span className="text-gray-500">{t.count}</span>
              {t.flag > 0 && t.id !== 'overlaps' && (
                <span className="ml-1.5 rounded-full bg-yellow-700/70 text-yellow-100 px-1.5 text-[10px]" title="Suggested merges">{t.flag}</span>
              )}
            </button>
          ))}
        </div>

        {status && (
          <div className="px-5 py-2 text-xs text-green-300 bg-green-900/20 border-b border-[#0f3460] shrink-0">{status}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overlaps'
            ? <OverlapsPanel overlaps={overlaps} onStatus={setStatus} run={run} />
            : <FieldPanel key={tab} field={tab} entries={byField[tab]} onStatus={setStatus} run={run} />}
        </div>

        <div className="px-5 py-2 border-t border-[#0f3460] flex items-center gap-3 shrink-0">
          <span className="flex-1 text-[11px] text-gray-600">
            Undo works until you close this window. After that, the only fallback is 🕓 History (signed-in projects, snapshots about every 15 minutes).
          </span>
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title={undoStack.length ? `Undo: ${undoStack[undoStack.length - 1].label}` : 'Nothing to undo'}
            className="px-2.5 py-1 rounded text-xs bg-[#2d3748] text-gray-200 hover:bg-[#3d4a60] disabled:opacity-40"
          >
            ↶ Undo{undoStack.length > 1 ? ` (${undoStack.length})` : ''}
          </button>
          <button onClick={onClose} className="px-2.5 py-1 rounded text-xs bg-[#6b46c1] text-white hover:bg-[#7c5cd6]">Done</button>
        </div>
      </div>
    </div>
  );
}
