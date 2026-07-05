import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { ObjectType, BinderItem } from '../types';

interface Option { id: string; type: ObjectType; label: string; detail?: string }

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function collectScenes(items: BinderItem[]): Option[] {
  return items.flatMap((item) => [
    ...(item.type === 'document' ? [{ id: item.id, type: 'scene' as const, label: item.title || 'Untitled scene', detail: stripHtml(item.content).slice(0, 90) }] : []),
    ...collectScenes(item.children ?? []),
  ]);
}

const TYPE_LABEL: Record<ObjectType, string> = {
  scene: 'Scene', fragment: 'Fragment', omitted_material: 'Omitted', notebook_entry: 'Notebook',
  codex_entry: 'Codex', question: 'Question', moodboard_item: 'Moodboard', research_item: 'Research', revision_pass: 'Revision', manuscript_assembly: 'Assembly',
};

export function RelationshipPicker({
  label,
  selectedIds,
  onChange,
  targetTypes,
  compact = false,
}: {
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  targetTypes: ObjectType[];
  compact?: boolean;
}) {
  const { binder, fragments, omittedMaterial, notebookEntries, codexEntries, questions, moodboardItems, researchEntries } = useAppStore();
  const [query, setQuery] = useState('');

  const options = useMemo<Option[]>(() => {
    const all: Option[] = [
      ...collectScenes(binder),
      ...fragments.filter((f) => !f.trashedAt).map((f) => ({ id: f.id, type: 'fragment' as const, label: f.title || 'Untitled fragment', detail: stripHtml(f.content).slice(0, 90) })),
      ...omittedMaterial.filter((o) => !o.trashedAt).map((o) => ({ id: o.id, type: 'omitted_material' as const, label: o.title || 'Untitled omitted material', detail: stripHtml(o.content).slice(0, 90) })),
      ...notebookEntries.map((n) => ({ id: n.id, type: 'notebook_entry' as const, label: n.title || 'Untitled notebook entry', detail: stripHtml(n.content).slice(0, 90) })),
      ...codexEntries.map((c) => ({ id: c.id, type: 'codex_entry' as const, label: c.name || 'Untitled codex entry', detail: c.codexType })),
      ...questions.map((q) => ({ id: q.id, type: 'question' as const, label: q.text || 'Untitled question', detail: q.category })),
      ...moodboardItems.map((m) => ({ id: m.id, type: 'moodboard_item' as const, label: m.title || 'Untitled moodboard item', detail: m.description })),
      ...researchEntries.filter((r) => !r.trashedAt).map((r) => ({ id: r.id, type: 'research_item' as const, label: r.title || 'Untitled research item', detail: stripHtml(r.content || r.notes).slice(0, 90) })),
    ];
    return all.filter((o) => targetTypes.includes(o.type));
  }, [binder, codexEntries, fragments, moodboardItems, notebookEntries, omittedMaterial, questions, researchEntries, targetTypes]);

  const selectedSet = new Set(selectedIds);
  const selected = selectedIds.map((id) => options.find((o) => o.id === id)).filter(Boolean) as Option[];
  const filtered = options.filter((o) => !selectedSet.has(o.id) && `${o.label} ${o.detail ?? ''} ${TYPE_LABEL[o.type]}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-500 block">{label}</label>
      <div className="flex flex-wrap gap-1">
        {selected.map((o) => (
          <button key={`${o.type}:${o.id}`} type="button" onClick={() => onChange(selectedIds.filter((id) => id !== o.id))} className="text-[11px] bg-[#6b46c1]/20 text-purple-200 border border-[#6b46c1]/40 rounded px-1.5 py-0.5 hover:bg-red-900/30" title="Remove">
            {o.label} ×
          </button>
        ))}
        {selected.length === 0 && <span className="text-[11px] text-gray-600 italic">No links yet</span>}
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]" />
      {query && filtered.length > 0 && (
        <div className="border border-[#2d3748] rounded bg-[#10172a] overflow-hidden">
          {filtered.map((o) => (
            <button key={`${o.type}:${o.id}`} type="button" onClick={() => { onChange([...new Set([...selectedIds, o.id])]); setQuery(''); }} className="w-full text-left px-2 py-1 hover:bg-[#2d3748] border-b border-[#2d3748]/50 last:border-0">
              <span className="text-xs text-gray-200">{o.label}</span> <span className="text-[10px] text-gray-500">{TYPE_LABEL[o.type]}</span>
              {!compact && o.detail && <div className="text-[10px] text-gray-600 truncate">{o.detail}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
