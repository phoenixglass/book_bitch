import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import type { ObjectType, BinderItem } from '../types';

interface SearchResult {
  id: string;
  type: ObjectType;
  title: string;
  snippet: string;
  tags: string[];
}

const TYPE_ICONS: Record<ObjectType, string> = {
  scene: '📄', fragment: '🧩', omitted_material: '🗂️', notebook_entry: '📓',
  codex_entry: '📚', question: '❓', moodboard_item: '🖼️',
};

const TYPE_LABELS: Record<ObjectType, string> = {
  scene: 'Scene', fragment: 'Fragment', omitted_material: 'Omitted',
  notebook_entry: 'Notebook', codex_entry: 'Codex', question: 'Question',
  moodboard_item: 'Moodboard',
};

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function snippet(text: string, query: string, len = 120) {
  const lc = text.toLowerCase();
  const qlc = query.toLowerCase();
  const idx = lc.indexOf(qlc);
  if (idx === -1) return text.slice(0, len) + (text.length > len ? '…' : '');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function collectScenes(items: BinderItem[]): { id: string; title: string; content: string; tags: string[] }[] {
  const scenes: { id: string; title: string; content: string; tags: string[] }[] = [];
  for (const item of items) {
    if (item.id === 'trash') continue;
    if (item.type === 'document') {
      scenes.push({ id: item.id, title: item.title, content: item.content + ' ' + item.synopsis + ' ' + item.notes, tags: item.sceneMetadata?.tags ?? [] });
    }
    if (item.children.length) scenes.push(...collectScenes(item.children));
  }
  return scenes;
}

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const {
    binder, fragments, omittedMaterial, notebookEntries, codexEntries, questions, moodboardItems,
    selectItem, setArea, setViewMode, searchQuery, setSearchQuery, setPendingSelectId,
  } = useAppStore();

  const [query, setQuery] = useState(searchQuery);
  const [filterType, setFilterType] = useState<string>('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelectedIdx(0); }, [query, filterType]);

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const lc = query.toLowerCase();

    const results: SearchResult[] = [];

    // Scenes
    for (const s of collectScenes(binder)) {
      const text = stripHtml(s.content);
      if (s.title.toLowerCase().includes(lc) || text.toLowerCase().includes(lc)) {
        results.push({ id: s.id, type: 'scene', title: s.title, snippet: snippet(text, query), tags: s.tags });
      }
    }

    // Fragments
    for (const f of fragments) {
      if (f.title.toLowerCase().includes(lc) || f.content.toLowerCase().includes(lc)) {
        results.push({ id: f.id, type: 'fragment', title: f.title, snippet: snippet(f.content, query), tags: f.tags });
      }
    }

    // Omitted
    for (const o of omittedMaterial) {
      const text = stripHtml(o.content);
      if (o.title.toLowerCase().includes(lc) || text.toLowerCase().includes(lc) || o.reason.toLowerCase().includes(lc)) {
        results.push({ id: o.id, type: 'omitted_material', title: o.title, snippet: snippet(text || o.reason, query), tags: o.tags });
      }
    }

    // Notebook
    for (const n of notebookEntries) {
      if (n.title.toLowerCase().includes(lc) || n.content.toLowerCase().includes(lc)) {
        results.push({ id: n.id, type: 'notebook_entry', title: n.title, snippet: snippet(n.content, query), tags: n.tags });
      }
    }

    // Codex
    for (const c of codexEntries) {
      const searchText = `${c.name} ${c.description} ${c.notes} ${c.aliases.join(' ')}`;
      if (searchText.toLowerCase().includes(lc)) {
        results.push({ id: c.id, type: 'codex_entry', title: c.name, snippet: snippet(c.description, query), tags: c.tags });
      }
    }

    // Questions
    for (const q of questions) {
      if (q.text.toLowerCase().includes(lc) || q.answer.toLowerCase().includes(lc)) {
        results.push({ id: q.id, type: 'question', title: q.text.slice(0, 80) || 'Question', snippet: snippet(q.answer, query), tags: [] });
      }
    }

    // Moodboard
    for (const m of moodboardItems) {
      if (m.title.toLowerCase().includes(lc) || m.description.toLowerCase().includes(lc)) {
        results.push({ id: m.id, type: 'moodboard_item', title: m.title, snippet: m.description, tags: m.tags });
      }
    }

    return filterType ? results.filter(r => r.type === filterType) : results;
  }, [query, filterType, binder, fragments, omittedMaterial, notebookEntries, codexEntries, questions, moodboardItems]);

  function navigate(result: SearchResult) {
    setSearchQuery(query);
    switch (result.type) {
      case 'scene':
        selectItem(result.id);
        setArea('manuscript');
        setViewMode('editor');
        break;
      case 'fragment':
        setPendingSelectId(result.id);
        setArea('fragments');
        break;
      case 'omitted_material':
        setPendingSelectId(result.id);
        setArea('omitted');
        break;
      case 'notebook_entry':
        setPendingSelectId(result.id);
        setArea('notebook');
        break;
      case 'codex_entry':
        setPendingSelectId(result.id);
        setArea('codex');
        break;
      case 'question':
        setPendingSelectId(result.id);
        setArea('questions');
        break;
      case 'moodboard_item':
        setPendingSelectId(result.id);
        setArea('moodboard');
        break;
    }
    onClose();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIdx]) navigate(results[selectedIdx]);
  }

  function highlightMatch(text: string, q: string) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[#6b46c1]/40 text-white rounded">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border border-[#0f3460] rounded-xl w-[640px] max-h-[70vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#0f3460]">
          <span className="text-gray-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across scenes, fragments, notebook, codex, questions…"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-500 hover:text-gray-300 text-sm">✕</button>
          )}
        </div>

        {/* Type filters */}
        <div className="flex gap-1 px-4 py-2 border-b border-[#0f3460] overflow-x-auto">
          <button
            onClick={() => setFilterType('')}
            className={`text-xs px-2 py-0.5 rounded transition-colors whitespace-nowrap ${!filterType ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            All {results.length > 0 && `(${results.length})`}
          </button>
          {(['scene','fragment','omitted_material','notebook_entry','codex_entry','question'] as ObjectType[]).map(t => {
            const count = results.filter(r => r.type === t).length;
            if (count === 0 && !filterType) return null;
            return (
              <button
                key={t}
                onClick={() => setFilterType(filterType === t ? '' : t)}
                className={`text-xs px-2 py-0.5 rounded transition-colors whitespace-nowrap ${filterType === t ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {TYPE_ICONS[t]} {TYPE_LABELS[t]} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!query && (
            <div className="p-6 text-center text-gray-600">
              <p className="text-sm">Start typing to search the project.</p>
              <p className="text-xs mt-1">Searches scenes, fragments, omitted material, notebook, codex, and questions.</p>
            </div>
          )}
          {query && results.length === 0 && (
            <div className="p-6 text-center text-gray-600">
              <p className="text-sm">No results for "{query}"</p>
            </div>
          )}
          {results.map((result, idx) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => navigate(result)}
              className={`w-full text-left px-4 py-3 border-b border-[#0f3460]/50 transition-colors ${idx === selectedIdx ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm">{TYPE_ICONS[result.type]}</span>
                <span className="text-xs text-gray-500 shrink-0">{TYPE_LABELS[result.type]}</span>
                <span className="text-sm text-white font-medium truncate">{highlightMatch(result.title, query)}</span>
              </div>
              {result.snippet && (
                <p className="text-xs text-gray-500 line-clamp-2 pl-6 leading-relaxed">
                  {highlightMatch(result.snippet, query)}
                </p>
              )}
              {result.tags.length > 0 && (
                <div className="flex gap-1 mt-1 pl-6">
                  {result.tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[10px] bg-[#6b46c1]/20 text-purple-400 rounded px-1">#{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-[#0f3460] text-xs text-gray-600 flex gap-4">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
