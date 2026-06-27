import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import { getFullBinderContent } from '../lib/binder';
import type { CodexEntry, CodexType, CodexExtractionCandidate, CodexExtractCoverage } from '../types';

const TYPE_LABELS: Record<CodexType, string> = {
  character: 'Character', place: 'Place', object: 'Object', motif: 'Motif',
  institution: 'Institution', publication: 'Publication / Media', reference: 'Real-world Reference',
  relationship: 'Relationship', event: 'Event', document: 'Document',
  theme: 'Theme', custom: 'Custom',
};

const TYPE_ICONS: Record<CodexType, string> = {
  character: '👤', place: '📍', object: '🔮', motif: '🌀',
  institution: '🏛️', publication: '📰', reference: '🌐', relationship: '🔗',
  event: '📅', document: '📄', theme: '💡', custom: '⚙️',
};

const TIER_LABELS: Record<string, string> = { major: 'Major', secondary: 'Secondary', minor: 'Minor' };

function CodexDetail({ entry, onClose }: { entry: CodexEntry; onClose: () => void }) {
  const { updateCodexEntry, deleteCodexEntry } = useAppStore();
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldVal, setNewFieldVal] = useState('');

  function addCustomField() {
    if (!newFieldKey.trim()) return;
    updateCodexEntry(entry.id, {
      customFields: { ...entry.customFields, [newFieldKey.trim()]: newFieldVal },
    });
    setNewFieldKey('');
    setNewFieldVal('');
  }

  function removeCustomField(key: string) {
    const next = { ...entry.customFields };
    delete next[key];
    updateCodexEntry(entry.id, { customFields: next });
  }

  const isCharacter = entry.codexType === 'character';
  const isPlace = entry.codexType === 'place';
  const isMotifOrObject = entry.codexType === 'motif' || entry.codexType === 'object';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
        <span className="text-lg">{TYPE_ICONS[entry.codexType]}</span>
        <select
          value={entry.codexType}
          onChange={(e) => updateCodexEntry(entry.id, { codexType: e.target.value as CodexType })}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          {(Object.entries(TYPE_LABELS) as [CodexType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {entry.codexType === 'custom' && (
          <input
            value={entry.customTypeName ?? ''}
            onChange={(e) => updateCodexEntry(entry.id, { customTypeName: e.target.value })}
            placeholder="Custom type name…"
            className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-32"
          />
        )}
        <span className="flex-1" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <input
          value={entry.name}
          onChange={(e) => updateCodexEntry(entry.id, { name: e.target.value })}
          className="text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1]"
          placeholder="Name…"
        />

        <div>
          <label className="text-xs text-gray-500 block mb-1">Aliases</label>
          <TagInput
            tags={entry.aliases}
            onChange={(v) => updateCodexEntry(entry.id, { aliases: v })}
            placeholder="Add alias…"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Description</label>
          <textarea
            value={entry.description}
            onChange={(e) => updateCodexEntry(entry.id, { description: e.target.value })}
            rows={5}
            placeholder="Who or what is this?"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y leading-relaxed placeholder-gray-600"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea
            value={entry.notes}
            onChange={(e) => updateCodexEntry(entry.id, { notes: e.target.value })}
            rows={3}
            placeholder="Private working notes…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-300 text-xs outline-none focus:border-[#6b46c1] resize-y placeholder-gray-600"
          />
        </div>

        {/* AI classification metadata */}
        {(entry.narrativeFunction || entry.characterTier || entry.isActualStoryCharacter || entry.isPassingReference) && (
          <div className="border border-[#0f3460] rounded p-3 flex flex-col gap-2">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Classification</p>
            {isCharacter && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Tier</label>
                <select
                  value={entry.characterTier ?? ''}
                  onChange={(e) => updateCodexEntry(entry.id, { characterTier: (e.target.value || undefined) as CodexEntry['characterTier'] })}
                  className="bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
                >
                  <option value="">—</option>
                  <option value="major">Major</option>
                  <option value="secondary">Secondary</option>
                  <option value="minor">Minor</option>
                </select>
                {entry.isPassingReference && <span className="text-xs text-amber-400">passing reference</span>}
                {entry.isActualStoryCharacter && <span className="text-xs text-green-400">actual character</span>}
              </div>
            )}
            {entry.narrativeFunction && (
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Narrative function</label>
                <textarea
                  value={entry.narrativeFunction}
                  onChange={(e) => updateCodexEntry(entry.id, { narrativeFunction: e.target.value })}
                  rows={2}
                  className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs resize-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Character-specific fields */}
        {isCharacter && (
          <div className="border border-[#0f3460] rounded p-3 flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Character Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['role', 'Role', 'e.g. Protagonist, Antagonist'],
                ['age', 'Age / DOB', ''],
                ['pronouns', 'Pronouns', 'e.g. she/her, he/him, they/them'],
                ['relationships', 'Relationships', 'Key relationships…'],
                ['physicalDetails', 'Physical Details', ''],
              ].map(([field, label, placeholder]) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                  <input
                    value={(entry as unknown as Record<string, string>)[field] ?? ''}
                    onChange={(e) => updateCodexEntry(entry.id, { [field]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
                  />
                </div>
              ))}
            </div>
            {[
              ['voiceNotes', 'Voice Notes', 5],
              ['arcNotes', 'Arc Notes', 3],
              ['secrets', 'Secrets', 2],
              ['contradictions', 'Contradictions / Tensions', 2],
            ].map(([field, label, rows]) => (
              <div key={field as string}>
                <label className="text-xs text-gray-500 block mb-0.5">{label as string}</label>
                <textarea
                  value={(entry as unknown as Record<string, string>)[field as string] ?? ''}
                  onChange={(e) => updateCodexEntry(entry.id, { [field as string]: e.target.value })}
                  rows={rows as number}
                  className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs resize-none"
                />
              </div>
            ))}
          </div>
        )}

        {/* Place-specific fields */}
        {isPlace && (
          <div className="border border-[#0f3460] rounded p-3 flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Place Details</p>
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">Atmosphere</label>
              <textarea
                value={entry.atmosphere ?? ''}
                onChange={(e) => updateCodexEntry(entry.id, { atmosphere: e.target.value })}
                rows={3}
                className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs resize-none"
              />
            </div>
          </div>
        )}

        {/* Motif/Object-specific fields */}
        {isMotifOrObject && (
          <div className="border border-[#0f3460] rounded p-3 flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
              {entry.codexType === 'motif' ? 'Motif' : 'Object'} Details
            </p>
            {[
              ['meaning', 'Meaning / Function', 2],
              ['appearances', 'Appearances in text', 3],
              ['evolution', 'Evolution across manuscript', 3],
            ].map(([field, label, rows]) => (
              <div key={field as string}>
                <label className="text-xs text-gray-500 block mb-0.5">{label as string}</label>
                <textarea
                  value={(entry as unknown as Record<string, string>)[field as string] ?? ''}
                  onChange={(e) => updateCodexEntry(entry.id, { [field as string]: e.target.value })}
                  rows={rows as number}
                  className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs resize-none"
                />
              </div>
            ))}
          </div>
        )}

        {/* Tags & Relations */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={entry.tags}
              onChange={(v) => updateCodexEntry(entry.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Scene IDs</label>
            <TagInput
              tags={entry.relatedSceneIds}
              onChange={(v) => updateCodexEntry(entry.id, { relatedSceneIds: v })}
              placeholder="Add scene ID…"
            />
          </div>
        </div>

        {/* Custom Fields */}
        <div className="border border-[#0f3460] rounded p-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Custom Fields</p>
          {Object.entries(entry.customFields).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400 w-24 shrink-0">{key}</span>
              <input
                value={val}
                onChange={(e) => updateCodexEntry(entry.id, {
                  customFields: { ...entry.customFields, [key]: e.target.value },
                })}
                className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
              />
              <button onClick={() => removeCustomField(key)} className="text-red-500 hover:text-red-300 text-xs px-1">✕</button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              value={newFieldKey}
              onChange={(e) => setNewFieldKey(e.target.value)}
              placeholder="Field name…"
              className="w-28 bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
            <input
              value={newFieldVal}
              onChange={(e) => setNewFieldVal(e.target.value)}
              placeholder="Value…"
              onKeyDown={(e) => e.key === 'Enter' && addCustomField()}
              className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
            <button onClick={addCustomField} className="text-xs bg-[#6b46c1]/30 text-purple-300 hover:bg-[#6b46c1]/50 px-2 py-0.5 rounded transition-colors">
              Add
            </button>
          </div>
        </div>

        <div className="border-t border-[#0f3460] pt-3">
          <button
            onClick={() => {
              if (window.confirm(`Delete "${entry.name}" from Codex?`)) {
                deleteCodexEntry(entry.id);
                onClose();
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            🗑 Delete Entry
          </button>
        </div>

        <div className="text-xs text-gray-600">
          Created {new Date(entry.createdAt).toLocaleString()} · Updated {new Date(entry.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export function CodexView() {
  const {
    codexEntries, addCodexEntry, updateCodexEntry, pendingSelectId, setPendingSelectId,
    binder, fragments, omittedMaterial, notebookEntries, setAIContextObject, selectedId: manuscriptSelectedId,
  } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'codex_entry', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);

  useEffect(() => {
    if (pendingSelectId) {
      setSelectedId(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, setPendingSelectId]);
  const [filterType, setFilterType] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  // ── Scan state ──────────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<CodexExtractionCandidate[] | null>(null);
  const [scanSelected, setScanSelected] = useState<boolean[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CodexExtractCoverage | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());

  // ── Scan scope / options ──────────────────────────────────────────────────
  const [scope, setScope] = useState<'full' | 'current'>('full');
  const [includeFragments, setIncludeFragments] = useState(false);
  const [includeOmitted, setIncludeOmitted] = useState(false);
  const [includeResearch, setIncludeResearch] = useState(false);
  const [showScopePanel, setShowScopePanel] = useState(false);

  const existingByName = useMemo(() => {
    const map = new Map<string, CodexEntry>();
    for (const e of codexEntries) {
      map.set(e.name.toLowerCase().trim(), e);
      for (const a of e.aliases) map.set(a.toLowerCase().trim(), e);
    }
    return map;
  }, [codexEntries]);

  // Build the item list that WILL be analyzed, given the current scope/options.
  const scanItems = useMemo(() => {
    if (scope === 'current') {
      const findDoc = (items: typeof binder): { id: string; title: string; text: string }[] => {
        for (const it of items) {
          if (it.id === manuscriptSelectedId && it.type === 'document') {
            return [{ id: it.id, title: it.title || 'Untitled', text: it.content }];
          }
          const found = it.children?.length ? findDoc(it.children) : [];
          if (found.length) return found;
        }
        return [];
      };
      return { items: findDoc(binder), stats: null as ReturnType<typeof getFullBinderContent>['stats'] | null };
    }
    const res = getFullBinderContent(
      { binder, fragments, omittedMaterial, notebookEntries },
      { includeManuscript: true, includeFragments, includeOmittedMaterial: includeOmitted, includeResearch },
    );
    return { items: res.items.map((i) => ({ id: i.id, title: i.title, text: i.text })), stats: res.stats };
  }, [scope, binder, fragments, omittedMaterial, notebookEntries, includeFragments, includeOmitted, includeResearch, manuscriptSelectedId]);

  const scanItemCount = scanItems.items.length;
  const scanWordCount = useMemo(
    () => scanItems.items.reduce((n, s) => n + (s.text.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length), 0),
    [scanItems],
  );

  const handleScan = useCallback(async () => {
    if (scanItems.items.length === 0) {
      setScanError(scope === 'current'
        ? 'No chapter is selected, or the selected item has no text. Select a manuscript chapter first.'
        : 'No manuscript content found. Write some chapters first.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setScanResults(null);
    setCoverage(null);
    setShowScopePanel(false);
    try {
      const resp = await fetch('/api/ai/codex-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: scanItems.items }),
      });
      const data = await resp.json() as { entries?: CodexExtractionCandidate[]; error?: string; coverage?: CodexExtractCoverage };
      if (!resp.ok) throw new Error(data.error ?? 'Unknown error');
      const entries = (data.entries ?? []) as CodexExtractionCandidate[];
      setScanResults(entries);
      // Default: select likely actual entities; leave passing references unchecked.
      setScanSelected(entries.map((e) => !e.isPassingReference));
      setCoverage(data.coverage ?? null);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }, [scanItems, scope]);

  function reclassify(i: number, codexType: CodexType) {
    setScanResults((prev) => prev ? prev.map((e, j) => j === i ? { ...e, codexType } : e) : prev);
  }

  function importSelected() {
    if (!scanResults) return;
    let created = 0;
    let mergedCount = 0;
    scanResults.forEach((entry, i) => {
      if (!scanSelected[i]) return;
      const sceneIds = Array.from(new Set((entry.sourceAppearances ?? []).map((a) => a.itemId).filter(Boolean)));
      const existing = existingByName.get(entry.name.toLowerCase().trim())
        ?? entry.aliases.map((a) => existingByName.get(a.toLowerCase().trim())).find(Boolean);
      if (existing) {
        // Merge into the existing entry rather than duplicating.
        updateCodexEntry(existing.id, {
          aliases: Array.from(new Set([...existing.aliases, ...entry.aliases])),
          relatedSceneIds: Array.from(new Set([...existing.relatedSceneIds, ...sceneIds])),
          description: existing.description?.trim() ? existing.description : entry.description,
          narrativeFunction: existing.narrativeFunction ?? entry.narrativeFunction,
          characterTier: existing.characterTier ?? entry.characterTier,
          isActualStoryCharacter: entry.isActualStoryCharacter,
          isPassingReference: entry.isPassingReference,
        });
        mergedCount += 1;
      } else {
        addCodexEntry({
          name: entry.name,
          codexType: entry.codexType,
          description: entry.description,
          aliases: entry.aliases ?? [],
          role: entry.role,
          relationships: entry.relationships,
          physicalDetails: entry.physicalDetails,
          atmosphere: entry.atmosphere,
          meaning: entry.meaning,
          appearances: entry.appearances,
          relatedSceneIds: sceneIds,
          characterTier: entry.characterTier,
          narrativeFunction: entry.narrativeFunction,
          isActualStoryCharacter: entry.isActualStoryCharacter,
          isPassingReference: entry.isPassingReference,
          tags: entry.suggestedTags ?? [],
        });
        created += 1;
      }
    });
    setScanResults(null);
    setScanSelected([]);
    setCoverage(null);
    if (created || mergedCount) {
      setScanError(null);
    }
  }

  const filtered = useMemo(() => {
    let list = codexEntries;
    if (filterType) list = list.filter(e => e.codexType === filterType);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(lc) ||
        e.description.toLowerCase().includes(lc) ||
        e.aliases.some(a => a.toLowerCase().includes(lc)) ||
        e.tags.some(t => t.toLowerCase().includes(lc)),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [codexEntries, filterType, filterText]);

  const grouped = useMemo(() => {
    const map: Partial<Record<CodexType, CodexEntry[]>> = {};
    for (const e of filtered) {
      if (!map[e.codexType]) map[e.codexType] = [];
      map[e.codexType]!.push(e);
    }
    return map;
  }, [filtered]);

  const selected = codexEntries.find(e => e.id === selectedId) ?? null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Codex</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowScopePanel((v) => !v)}
                disabled={scanning}
                title="Generate Codex from the binder using AI"
                className="text-xs bg-[#0f3460] text-blue-300 px-2 py-0.5 rounded hover:bg-[#1a4a7a] disabled:opacity-50 transition-colors"
              >
                {scanning ? '⏳ Scanning…' : '✨ Generate'}
              </button>
              <button
                onClick={() => { const id = addCodexEntry(); setSelectedId(id); }}
                className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
              >
                + New
              </button>
            </div>
          </div>

          {showScopePanel && (
            <div className="mb-2 p-2 rounded border border-[#0f3460] bg-[#0d1117] flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Codex generation scope</p>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input type="radio" name="codex-scope" checked={scope === 'full'} onChange={() => setScope('full')} className="accent-purple-500" />
                Full Observations binder
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input type="radio" name="codex-scope" checked={scope === 'current'} onChange={() => setScope('current')} className="accent-purple-500" />
                Current chapter only
              </label>
              {scope === 'full' && (
                <div className="flex flex-col gap-1 pl-1 border-l border-[#0f3460]">
                  <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={includeFragments} onChange={(e) => setIncludeFragments(e.target.checked)} className="accent-purple-500" /> Include Fragments
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={includeOmitted} onChange={(e) => setIncludeOmitted(e.target.checked)} className="accent-purple-500" /> Include Omitted material
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={includeResearch} onChange={(e) => setIncludeResearch(e.target.checked)} className="accent-purple-500" /> Include Research
                  </label>
                </div>
              )}
              <div className="text-[11px] text-gray-400 border-t border-[#0f3460] pt-1.5">
                <div><span className="text-gray-300 font-semibold">{scanItemCount}</span> item{scanItemCount === 1 ? '' : 's'} · ~<span className="text-gray-300 font-semibold">{scanWordCount.toLocaleString()}</span> words</div>
                <div className="text-gray-600 mt-0.5">Trash is always excluded. Empty items are skipped.</div>
                {scanWordCount > 120000 && (
                  <div className="text-yellow-600 mt-0.5">Large binder — it will be analyzed in chunks across multiple AI calls (no chapters are dropped).</div>
                )}
              </div>
              <button
                onClick={handleScan}
                disabled={scanning || scanItemCount === 0}
                className="text-xs bg-[#6b46c1] text-white px-2 py-1 rounded hover:bg-[#553c9a] disabled:opacity-40 transition-colors"
              >
                {scanning ? 'Scanning…' : `Run Codex generation on ${scanItemCount} item${scanItemCount === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search codex…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-400 outline-none"
          >
            <option value="">All types</option>
            {(Object.entries(TYPE_LABELS) as [CodexType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600">
              <div className="text-3xl mb-2">📚</div>
              <p className="text-xs">No codex entries yet.</p>
              <p className="text-xs mt-1 text-gray-700">Create entries for characters, places, motifs, objects, and more.</p>
            </div>
          )}
          {(Object.entries(grouped) as [CodexType, CodexEntry[]][]).map(([type, entries]) => (
            <div key={type}>
              <div className="px-3 py-1 text-xs text-gray-600 font-semibold bg-[#0d1117] sticky top-0">
                {TYPE_ICONS[type]} {TYPE_LABELS[type]} ({entries.length})
              </div>
              {entries.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`w-full text-left px-3 py-2 border-b border-[#0f3460]/50 transition-colors ${selectedId === entry.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
                >
                  <div className="text-sm text-white">{entry.name}</div>
                  {entry.aliases.length > 0 && (
                    <div className="text-xs text-gray-500">aka {entry.aliases.join(', ')}</div>
                  )}
                  {entry.description && (
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{entry.description}</p>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {scanResults !== null ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
            <button onClick={() => { setScanResults(null); setScanSelected([]); setCoverage(null); }} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
            <span className="text-sm font-semibold text-white flex-1">
              {scanResults.length} candidate{scanResults.length === 1 ? '' : 's'} — review before saving
            </span>
            <button
              onClick={importSelected}
              disabled={!scanSelected.some(Boolean)}
              className="text-xs bg-[#6b46c1] text-white px-3 py-1 rounded hover:bg-[#553c9a] disabled:opacity-40 transition-colors"
            >
              Save {scanSelected.filter(Boolean).length} selected
            </button>
          </div>

          {/* Coverage summary */}
          <div className="px-4 py-2 border-b border-[#0f3460] bg-[#0d1117] shrink-0 text-[11px] text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            {coverage && (
              <>
                <span>📄 {coverage.itemsWithEntities}/{coverage.itemsAnalyzed} chapters contributed</span>
                <span>🧩 {coverage.chunkCount} chunk{coverage.chunkCount === 1 ? '' : 's'}</span>
                <span>📝 {coverage.totalWordCount.toLocaleString()} words analyzed</span>
              </>
            )}
            {(() => {
              const c = scanResults;
              const chars = c.filter((e) => e.codexType === 'character').length;
              const refs = c.filter((e) => e.codexType === 'reference' || e.isPassingReference).length;
              const insts = c.filter((e) => e.codexType === 'institution' || e.codexType === 'publication').length;
              const places = c.filter((e) => e.codexType === 'place').length;
              const motifs = c.filter((e) => e.codexType === 'motif' || e.codexType === 'theme').length;
              return (
                <>
                  <span className="text-gray-300">👤 {chars} characters</span>
                  <span>🌐 {refs} references</span>
                  <span>🏛️ {insts} institutions/media</span>
                  <span>📍 {places} places</span>
                  <span>🌀 {motifs} motifs/themes</span>
                </>
              );
            })()}
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {scanResults.length === 0 && (
              <p className="text-sm text-gray-500 text-center mt-8">No entities found. Try adding more content or widening the scope.</p>
            )}
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setScanSelected(scanResults.map(() => true))} className="text-xs text-gray-500 hover:text-gray-300">Select all</button>
              <span className="text-gray-700">·</span>
              <button onClick={() => setScanSelected(scanResults.map(() => false))} className="text-xs text-gray-500 hover:text-gray-300">Deselect all</button>
              <span className="text-gray-700">·</span>
              <button onClick={() => setScanSelected(scanResults.map((e) => !e.isPassingReference))} className="text-xs text-gray-500 hover:text-gray-300" title="Select likely actual story entities, skip passing references">Only actual entities</button>
            </div>
            {scanResults.map((entry, i) => {
              const existing = existingByName.get(entry.name.toLowerCase().trim())
                ?? entry.aliases.map((a) => existingByName.get(a.toLowerCase().trim())).find(Boolean);
              const sourcesOpen = expandedSources.has(i);
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded border transition-colors ${
                    scanSelected[i] ? 'border-[#6b46c1]/60 bg-[#6b46c1]/10' : 'border-[#2d3748] bg-[#16213e]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={scanSelected[i] ?? false}
                    onChange={(e) => {
                      const next = [...scanSelected];
                      next[i] = e.target.checked;
                      setScanSelected(next);
                    }}
                    className="mt-0.5 accent-purple-500 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{entry.name}</span>
                      <select
                        value={entry.codexType}
                        onChange={(e) => reclassify(i, e.target.value as CodexType)}
                        title="Reclassify before saving"
                        className="text-xs bg-[#0d1117] border border-[#2d3748] rounded px-1 py-0.5 text-gray-300 outline-none focus:border-[#6b46c1]"
                      >
                        {(Object.entries(TYPE_LABELS) as [CodexType, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{TYPE_ICONS[v]} {l}</option>
                        ))}
                      </select>
                      {entry.codexType === 'character' && entry.characterTier && (
                        <span className="text-xs text-purple-300 bg-purple-900/20 px-1.5 py-0.5 rounded">{TIER_LABELS[entry.characterTier] ?? entry.characterTier}</span>
                      )}
                      {entry.isActualStoryCharacter && (
                        <span className="text-xs text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded" title="Functions as an actual character in the story">actual character</span>
                      )}
                      {entry.isPassingReference && (
                        <span className="text-xs text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded" title="Passing real-world / one-off mention, not a story character">passing reference</span>
                      )}
                      {typeof entry.confidence === 'number' && (
                        <span className="text-[10px] text-gray-500" title="Model confidence">{Math.round(entry.confidence * 100)}%</span>
                      )}
                      {existing && (
                        <span className="text-xs text-yellow-600 bg-yellow-900/20 px-1.5 py-0.5 rounded" title="Will be merged into the existing Codex entry, not duplicated">
                          merges into “{existing.name}”
                        </span>
                      )}
                    </div>
                    {entry.description && (
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{entry.description}</p>
                    )}
                    {entry.narrativeFunction && (
                      <p className="text-xs text-gray-500 mt-0.5"><span className="text-gray-600">Function:</span> {entry.narrativeFunction}</p>
                    )}
                    {entry.aliases && entry.aliases.length > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">aka {entry.aliases.join(', ')}</p>
                    )}
                    {entry.sourceAppearances && entry.sourceAppearances.length > 0 && (
                      <div className="mt-1">
                        <button
                          onClick={() => setExpandedSources((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i); else next.add(i);
                            return next;
                          })}
                          className="text-[11px] text-blue-400 hover:text-blue-300"
                        >
                          {sourcesOpen ? '▾' : '▸'} appears in {new Set(entry.sourceAppearances.map((a) => a.itemId)).size} chapter{new Set(entry.sourceAppearances.map((a) => a.itemId)).size === 1 ? '' : 's'}
                        </button>
                        {sourcesOpen && (
                          <ul className="mt-1 pl-3 flex flex-col gap-1 border-l border-[#0f3460]">
                            {entry.sourceAppearances.map((a, k) => (
                              <li key={k} className="text-[11px] text-gray-500">
                                <span className="text-gray-400">{a.itemTitle || a.itemId}</span>
                                {a.occurrenceCount ? <span className="text-gray-600"> ·×{a.occurrenceCount}</span> : null}
                                {a.evidence ? <span className="text-gray-600 italic"> — “{a.evidence}”</span> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : scanError ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center px-6">
            <div className="text-3xl mb-2">⚠️</div>
            <p className="text-sm text-red-400">{scanError}</p>
            <button onClick={() => setScanError(null)} className="text-xs text-gray-500 hover:text-gray-300 mt-3">Dismiss</button>
          </div>
        </div>
      ) : selected ? (
        <CodexDetail key={selected.id} entry={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-5xl mb-3">📚</div>
            <p className="text-sm">Select an entry to view it.</p>
            <p className="text-xs mt-1 text-gray-700">Your Codex is a flexible bible for every element of your world.</p>
            <p className="text-xs mt-3 text-gray-700">
              Use <span className="text-blue-400">✨ Scan</span> to extract entities from your manuscript automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
