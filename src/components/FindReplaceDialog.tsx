import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore, findItem } from '../store/appStore';
import { findMatchesInBinder, replaceInSingleItem } from '../utils/findReplace';
import type { FindReplaceField, FindReplaceOptions } from '../types';

const FIELD_LABELS: Record<FindReplaceField, string> = {
  content: 'Manuscript text',
  title: 'Titles',
  synopsis: 'Synopses',
  notes: 'Notes',
};

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#6b46c1]/40 text-white rounded">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function FindReplaceDialog({ onClose }: { onClose: () => void }) {
  const { binder, updateItem, findAndReplaceInBinder } = useAppStore();

  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [fields, setFields] = useState<Record<FindReplaceField, boolean>>({
    content: true,
    title: false,
    synopsis: false,
    notes: false,
  });
  const [lastResult, setLastResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const options: FindReplaceOptions = useMemo(
    () => ({ caseSensitive, wholeWord, fields }),
    [caseSensitive, wholeWord, fields],
  );

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return findMatchesInBinder(binder, query, options);
  }, [binder, query, options]);

  const totalCount = matches.reduce((a, m) => a + m.count, 0);

  function toggleField(field: FindReplaceField) {
    setFields((f) => ({ ...f, [field]: !f[field] }));
    setLastResult(null);
  }

  function handleReplaceAll() {
    if (!query.trim() || totalCount === 0) return;
    const count = findAndReplaceInBinder(query, replaceWith, options);
    setLastResult(`Replaced ${count} occurrence${count === 1 ? '' : 's'} across ${matches.length} location${matches.length === 1 ? '' : 's'}.`);
  }

  function handleReplaceOne(matchId: string) {
    const item = findItem(binder, matchId);
    if (!item) return;
    const patch = replaceInSingleItem(item, query, replaceWith, options);
    if (Object.keys(patch).length > 0) {
      updateItem(matchId, patch);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a2e] border border-[#0f3460] rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#0f3460]">
          <span className="text-white font-semibold text-sm">🔁 Find & Replace (whole binder)</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>

        {/* Inputs */}
        <div className="px-5 py-4 space-y-3 border-b border-[#0f3460]">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Find</label>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLastResult(null); }}
              placeholder="Text to find…"
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#6b46c1]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Replace with</label>
            <input
              value={replaceWith}
              onChange={(e) => { setReplaceWith(e.target.value); setLastResult(null); }}
              placeholder="Replacement text (leave blank to delete)…"
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#6b46c1]"
            />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="accent-[#6b46c1]" />
              Case sensitive
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} className="accent-[#6b46c1]" />
              Whole word
            </label>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(FIELD_LABELS) as FindReplaceField[]).map((field) => (
              <label key={field} className="flex items-center gap-1.5 text-xs text-gray-400">
                <input type="checkbox" checked={fields[field]} onChange={() => toggleField(field)} className="accent-[#6b46c1]" />
                {FIELD_LABELS[field]}
              </label>
            ))}
          </div>
        </div>

        {/* Preview / results */}
        <div className="flex-1 overflow-y-auto">
          {!query.trim() && (
            <div className="p-6 text-center text-gray-600">
              <p className="text-sm">Type something to find across every document in the binder.</p>
            </div>
          )}
          {query.trim() && matches.length === 0 && (
            <div className="p-6 text-center text-gray-600">
              <p className="text-sm">No matches for "{query}"</p>
            </div>
          )}
          {matches.map((m) => (
            <div key={`${m.id}-${m.field}`} className="flex items-start justify-between gap-2 px-5 py-2.5 border-b border-[#0f3460]/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium truncate">{m.title}</span>
                  <span className="text-[10px] text-gray-500 shrink-0">{FIELD_LABELS[m.field]} · {m.count}×</span>
                </div>
                {m.snippet && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{highlight(m.snippet, query)}</p>
                )}
              </div>
              <button
                onClick={() => handleReplaceOne(m.id)}
                className="shrink-0 text-xs px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-[#2d3748] border border-[#2d3748] transition-colors"
              >
                Replace here
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#0f3460]">
          <span className="text-xs text-gray-500">
            {lastResult ?? (totalCount > 0 ? `${totalCount} match${totalCount === 1 ? '' : 'es'} in ${matches.length} location${matches.length === 1 ? '' : 's'}. Cannot be undone.` : '')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs text-gray-400 hover:text-white border border-[#2d3748] hover:border-[#6b46c1] transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={totalCount === 0}
              className="px-4 py-1.5 rounded text-xs bg-[#6b46c1] text-white hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Replace All ({totalCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
