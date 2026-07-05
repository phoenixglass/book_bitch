import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import { ConnectionsPanel } from './ConnectionsPanel';
import { RelationshipPicker } from './RelationshipPicker';
import type { BinderItem, CodexEntry, CodexType } from '../types';

interface ExtractedEntry {
  name: string;
  codexType: CodexType;
  description: string;
  aliases?: string[];
  role?: string;
  relationships?: string;
  physicalDetails?: string;
  atmosphere?: string;
  meaning?: string;
  appearances?: string;
}

function collectScenes(items: BinderItem[]): Array<{ id: string; title: string; text: string }> {
  const scenes: Array<{ id: string; title: string; text: string }> = [];
  for (const item of items) {
    if (item.type === 'document' && item.content?.trim()) {
      scenes.push({ id: item.id, title: item.title || 'Untitled', text: item.content });
    }
    if (item.children?.length) scenes.push(...collectScenes(item.children));
  }
  return scenes;
}

const TYPE_LABELS: Record<CodexType, string> = {
  character: 'Character', place: 'Place', object: 'Object', motif: 'Motif',
  institution: 'Institution', event: 'Event', document: 'Document',
  theme: 'Theme', custom: 'Custom',
};

const TYPE_ICONS: Record<CodexType, string> = {
  character: '👤', place: '📍', object: '🔮', motif: '🌀',
  institution: '🏛️', event: '📅', document: '📄', theme: '💡', custom: '⚙️',
};

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
          <RelationshipPicker
            label="Related Scenes"
            selectedIds={entry.relatedSceneIds}
            onChange={(v) => updateCodexEntry(entry.id, { relatedSceneIds: v })}
            targetTypes={["scene"]}
          />
        </div>

        <ConnectionsPanel objectType="codex_entry" objectId={entry.id} />

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
  const { codexEntries, addCodexEntry, pendingSelectId, setPendingSelectId, binder, setAIContextObject } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'codex_entry', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);

  // Adopt a pending selection (e.g. from global search) during render rather
  // than in an effect, so the newly selected item shows on the same render —
  // including when this view just mounted fresh with a selection already
  // pending (e.g. navigated here from a search result).
  if (pendingSelectId && pendingSelectId !== selectedId) {
    setSelectedId(pendingSelectId);
  }
  useEffect(() => {
    if (pendingSelectId) setPendingSelectId(null);
  }, [pendingSelectId, setPendingSelectId]);
  const [filterType, setFilterType] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  // ── Scan state ──────────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ExtractedEntry[] | null>(null);
  const [scanSelected, setScanSelected] = useState<boolean[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanTruncated, setScanTruncated] = useState(false);

  const existingNames = useMemo(
    () => new Set(codexEntries.map((e) => e.name.toLowerCase())),
    [codexEntries],
  );

  const handleScan = useCallback(async () => {
    const scenes = collectScenes(binder);
    if (scenes.length === 0) {
      setScanError('No manuscript content found. Write some scenes first.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setScanResults(null);
    try {
      const resp = await fetch('/api/ai/codex-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        let message = `Server returned ${resp.status}`;
        try { const e = JSON.parse(text) as { error?: string }; if (e.error) message = e.error; } catch { /* not JSON */ }
        throw new Error(message);
      }
      const data = await resp.json() as { entries?: ExtractedEntry[]; error?: string; truncated?: boolean };
      const entries = (data.entries ?? []) as ExtractedEntry[];
      setScanResults(entries);
      setScanSelected(entries.map(() => true));
      setScanTruncated(data.truncated ?? false);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }, [binder]);

  function importSelected() {
    if (!scanResults) return;
    scanResults.forEach((entry, i) => {
      if (!scanSelected[i]) return;
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
      });
    });
    setScanResults(null);
    setScanSelected([]);
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
                onClick={handleScan}
                disabled={scanning}
                title="Extract entities from manuscript using AI"
                className="text-xs bg-[#0f3460] text-blue-300 px-2 py-0.5 rounded hover:bg-[#1a4a7a] disabled:opacity-50 transition-colors"
              >
                {scanning ? '⏳' : '✨'} Scan
              </button>
              <button
                onClick={() => { const id = addCodexEntry(); setSelectedId(id); }}
                className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
              >
                + New
              </button>
            </div>
          </div>
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
            <button onClick={() => { setScanResults(null); setScanSelected([]); }} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
            <span className="text-sm font-semibold text-white flex-1">
              Extracted {scanResults.length} {scanResults.length === 1 ? 'entity' : 'entities'} from manuscript
              {filterType && <span className="text-gray-500 font-normal"> · showing {TYPE_LABELS[filterType as CodexType]} only</span>}
            </span>
            {scanTruncated && (
              <span className="text-xs text-yellow-500" title="Manuscript was too long — only the first portion was scanned">⚠ Partial scan</span>
            )}
            <button
              onClick={importSelected}
              disabled={!scanSelected.some(Boolean)}
              className="text-xs bg-[#6b46c1] text-white px-3 py-1 rounded hover:bg-[#553c9a] disabled:opacity-40 transition-colors"
            >
              Import {scanSelected.filter(Boolean).length} selected
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {scanResults.filter(e => !filterType || e.codexType === filterType).length === 0 && (
              <p className="text-sm text-gray-500 text-center mt-8">
                {filterType ? `No ${TYPE_LABELS[filterType as CodexType]} entities found in manuscript.` : 'No entities found. Try adding more content to your manuscript.'}
              </p>
            )}
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => setScanSelected(scanResults.map((e, i) => !filterType || e.codexType === filterType ? true : scanSelected[i]))}
                className="text-xs text-gray-500 hover:text-gray-300"
              >Select all</button>
              <span className="text-gray-700">·</span>
              <button
                onClick={() => setScanSelected(scanResults.map((e, i) => !filterType || e.codexType === filterType ? false : scanSelected[i]))}
                className="text-xs text-gray-500 hover:text-gray-300"
              >Deselect all</button>
            </div>
            {scanResults.map((entry, i) => {
              if (filterType && entry.codexType !== filterType) return null;
              const isDuplicate = existingNames.has(entry.name.toLowerCase());
              return (
                <label
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                    scanSelected[i]
                      ? 'border-[#6b46c1]/60 bg-[#6b46c1]/10'
                      : 'border-[#2d3748] bg-[#16213e]'
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
                      <span className="text-xs text-gray-500 bg-[#0d1117] px-1.5 py-0.5 rounded">
                        {TYPE_ICONS[entry.codexType]} {TYPE_LABELS[entry.codexType]}
                      </span>
                      {isDuplicate && (
                        <span className="text-xs text-yellow-600 bg-yellow-900/20 px-1.5 py-0.5 rounded" title="An entry with this name already exists in your Codex">
                          already exists
                        </span>
                      )}
                    </div>
                    {entry.description && (
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{entry.description}</p>
                    )}
                    {entry.aliases && entry.aliases.length > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">aka {entry.aliases.join(', ')}</p>
                    )}
                  </div>
                </label>
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
