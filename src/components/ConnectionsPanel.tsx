import { useMemo } from 'react';
import { findItem, useAppStore } from '../store/appStore';
import type { AppArea, BinderItem, ObjectType } from '../types';

type ConnectionType = Exclude<ObjectType, 'revision_pass' | 'manuscript_assembly'>;
interface Connection { id: string; type: ConnectionType; title: string; subtitle?: string }

const GROUPS: Record<ConnectionType, { label: string; area: AppArea }> = {
  scene: { label: 'Manuscript scenes', area: 'manuscript' },
  fragment: { label: 'Fragments', area: 'fragments' },
  omitted_material: { label: 'Omitted material', area: 'omitted' },
  notebook_entry: { label: 'Notebook entries', area: 'notebook' },
  codex_entry: { label: 'Codex entries', area: 'codex' },
  research_item: { label: 'Research items', area: 'research' },
  question: { label: 'Questions', area: 'questions' },
  moodboard_item: { label: 'Moodboard images', area: 'moodboard' },
};

function hasId(ids: string[] | undefined, id: string) { return (ids ?? []).includes(id); }
function pushUnique(map: Map<string, Connection>, item: Connection) { map.set(`${item.type}:${item.id}`, item); }

export function ConnectionsPanel({ objectType, objectId, compact = false }: { objectType: ConnectionType; objectId: string; compact?: boolean }) {
  const state = useAppStore();
  const connections = useMemo(() => {
    const out = new Map<string, Connection>();
    const addScene = (id?: string) => { const s = id ? findItem(state.binder, id) : null; if (s?.type === 'document') pushUnique(out, { id: s.id, type: 'scene', title: s.title || 'Untitled scene', subtitle: s.synopsis }); };
    state.fragments.forEach((f) => {
      if (f.trashedAt) return;
      if ((objectType === 'scene' && f.attachedToSceneId === objectId) || (objectType === 'fragment' && f.id === objectId && f.attachedToSceneId)) {
        if (objectType === 'fragment') addScene(f.attachedToSceneId);
        else pushUnique(out, { id: f.id, type: 'fragment', title: f.title || 'Untitled fragment' });
      }
    });
    state.omittedMaterial.forEach((o) => {
      if (o.trashedAt) return;
      if ((objectType === 'scene' && o.sourceSceneId === objectId) || (objectType === 'omitted_material' && o.id === objectId && o.sourceSceneId)) {
        if (objectType === 'omitted_material') addScene(o.sourceSceneId);
        else pushUnique(out, { id: o.id, type: 'omitted_material', title: o.title || 'Untitled omitted material' });
      }
    });

    state.notebookEntries.forEach((n) => {
      if (objectType === 'notebook_entry' && n.id === objectId) { n.relatedSceneIds?.forEach(addScene); n.relatedFragmentIds?.forEach((id) => { const f = state.fragments.find((x) => x.id === id && !x.trashedAt); if (f) pushUnique(out, { id, type: 'fragment', title: f.title }); }); n.relatedCodexIds?.forEach((id) => { const c = state.codexEntries.find((x) => x.id === id); if (c) pushUnique(out, { id, type: 'codex_entry', title: c.name }); }); n.relatedQuestionIds?.forEach((id) => { const q = state.questions.find((x) => x.id === id); if (q) pushUnique(out, { id, type: 'question', title: q.text || 'Untitled question' }); }); }
      if ((objectType === 'scene' && hasId(n.relatedSceneIds, objectId)) || (objectType === 'fragment' && hasId(n.relatedFragmentIds, objectId)) || (objectType === 'codex_entry' && hasId(n.relatedCodexIds, objectId)) || (objectType === 'question' && hasId(n.relatedQuestionIds, objectId))) pushUnique(out, { id: n.id, type: 'notebook_entry', title: n.title || 'Untitled notebook entry' });
    });

    state.codexEntries.forEach((c) => {
      if (objectType === 'codex_entry' && c.id === objectId) { c.relatedSceneIds?.forEach(addScene); c.relatedFragmentIds?.forEach((id) => { const f = state.fragments.find((x) => x.id === id && !x.trashedAt); if (f) pushUnique(out, { id, type: 'fragment', title: f.title }); }); c.relatedOmittedIds?.forEach((id) => { const o = state.omittedMaterial.find((x) => x.id === id && !x.trashedAt); if (o) pushUnique(out, { id, type: 'omitted_material', title: o.title }); }); c.relatedNotebookIds?.forEach((id) => { const n = state.notebookEntries.find((x) => x.id === id); if (n) pushUnique(out, { id, type: 'notebook_entry', title: n.title }); }); c.relatedQuestionIds?.forEach((id) => { const q = state.questions.find((x) => x.id === id); if (q) pushUnique(out, { id, type: 'question', title: q.text || 'Untitled question' }); }); }
      if ((objectType === 'scene' && hasId(c.relatedSceneIds, objectId)) || (objectType === 'fragment' && hasId(c.relatedFragmentIds, objectId)) || (objectType === 'omitted_material' && hasId(c.relatedOmittedIds, objectId)) || (objectType === 'notebook_entry' && hasId(c.relatedNotebookIds, objectId)) || (objectType === 'question' && hasId(c.relatedQuestionIds, objectId))) pushUnique(out, { id: c.id, type: 'codex_entry', title: c.name || 'Untitled codex entry', subtitle: c.codexType });
    });

    state.researchEntries.forEach((r) => {
      if (r.trashedAt) return;
      if (objectType === 'research_item' && r.id === objectId) { r.relatedSceneIds?.forEach(addScene); r.relatedCodexIds?.forEach((id) => { const c = state.codexEntries.find((x) => x.id === id); if (c) pushUnique(out, { id, type: 'codex_entry', title: c.name }); }); r.relatedQuestionIds?.forEach((id) => { const q = state.questions.find((x) => x.id === id); if (q) pushUnique(out, { id, type: 'question', title: q.text || 'Untitled question' }); }); r.relatedNotebookIds?.forEach((id) => { const n = state.notebookEntries.find((x) => x.id === id); if (n) pushUnique(out, { id, type: 'notebook_entry', title: n.title }); }); r.relatedFragmentIds?.forEach((id) => { const f = state.fragments.find((x) => x.id === id && !x.trashedAt); if (f) pushUnique(out, { id, type: 'fragment', title: f.title }); }); }
      if ((objectType === 'scene' && hasId(r.relatedSceneIds, objectId)) || (objectType === 'codex_entry' && hasId(r.relatedCodexIds, objectId)) || (objectType === 'question' && hasId(r.relatedQuestionIds, objectId)) || (objectType === 'notebook_entry' && hasId(r.relatedNotebookIds, objectId)) || (objectType === 'fragment' && hasId(r.relatedFragmentIds, objectId))) pushUnique(out, { id: r.id, type: 'research_item', title: r.title || 'Untitled research item', subtitle: r.researchType });
    });

    state.questions.forEach((q) => {
      if (objectType === 'question' && q.id === objectId) { q.relatedSceneIds?.forEach(addScene); q.relatedCodexIds?.forEach((id) => { const c = state.codexEntries.find((x) => x.id === id); if (c) pushUnique(out, { id, type: 'codex_entry', title: c.name }); }); q.relatedFragmentIds?.forEach((id) => { const f = state.fragments.find((x) => x.id === id && !x.trashedAt); if (f) pushUnique(out, { id, type: 'fragment', title: f.title }); }); q.relatedOmittedIds?.forEach((id) => { const o = state.omittedMaterial.find((x) => x.id === id && !x.trashedAt); if (o) pushUnique(out, { id, type: 'omitted_material', title: o.title }); }); q.relatedNotebookIds?.forEach((id) => { const n = state.notebookEntries.find((x) => x.id === id); if (n) pushUnique(out, { id, type: 'notebook_entry', title: n.title }); }); }
      if ((objectType === 'scene' && hasId(q.relatedSceneIds, objectId)) || (objectType === 'codex_entry' && hasId(q.relatedCodexIds, objectId)) || (objectType === 'fragment' && hasId(q.relatedFragmentIds, objectId)) || (objectType === 'omitted_material' && hasId(q.relatedOmittedIds, objectId)) || (objectType === 'notebook_entry' && hasId(q.relatedNotebookIds, objectId))) pushUnique(out, { id: q.id, type: 'question', title: q.text || 'Untitled question', subtitle: q.category });
    });

    state.moodboardItems.forEach((m) => {
      if (objectType === 'moodboard_item' && m.id === objectId) { m.relatedSceneIds?.forEach(addScene); m.relatedCodexIds?.forEach((id) => { const c = state.codexEntries.find((x) => x.id === id); if (c) pushUnique(out, { id, type: 'codex_entry', title: c.name }); }); }
      if ((objectType === 'scene' && hasId(m.relatedSceneIds, objectId)) || (objectType === 'codex_entry' && hasId(m.relatedCodexIds, objectId))) pushUnique(out, { id: m.id, type: 'moodboard_item', title: m.title || 'Untitled moodboard item' });
    });

    state.links.forEach((l) => {
      if (l.sourceId === objectId && l.sourceType === objectType && l.targetType !== 'revision_pass') {
        const target = resolveTitle(l.targetType as ConnectionType, l.targetId, state.binder, state);
        if (target) pushUnique(out, { id: l.targetId, type: l.targetType as ConnectionType, title: target });
      } else if (l.targetId === objectId && l.targetType === objectType && l.sourceType !== 'revision_pass') {
        const source = resolveTitle(l.sourceType as ConnectionType, l.sourceId, state.binder, state);
        if (source) pushUnique(out, { id: l.sourceId, type: l.sourceType as ConnectionType, title: source });
      }
    });

    return [...out.values()].filter((c) => !(c.id === objectId && c.type === objectType));
  }, [objectId, objectType, state]);

  function go(c: Connection) {
    state.setArea(GROUPS[c.type].area);
    if (c.type === 'scene') { state.setViewMode('editor'); state.selectItem(c.id); } else { state.setPendingSelectId(c.id); }
  }

  const grouped = connections.reduce((acc, c) => { (acc[c.type] ??= []).push(c); return acc; }, {} as Partial<Record<ConnectionType, Connection[]>>);

  return (
    <section className={`border border-[#0f3460] rounded bg-[#111827]/40 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Connections</div>
      {connections.length === 0 ? <p className="text-xs text-gray-600 italic">No connected items yet.</p> : (
        <div className="space-y-2">
          {(Object.keys(GROUPS) as ConnectionType[]).map((type) => grouped[type]?.length ? (
            <div key={type}>
              <div className="text-[10px] text-gray-500 uppercase mb-1">{GROUPS[type].label}</div>
              <div className="space-y-1">
                {grouped[type]!.map((c) => <button key={`${c.type}:${c.id}`} onClick={() => go(c)} className="block w-full text-left text-xs text-gray-200 bg-[#1a1a2e] hover:bg-[#24304f] border border-[#2d3748] rounded px-2 py-1 transition-colors"><span className="truncate block">{c.title}</span>{!compact && c.subtitle && <span className="text-[10px] text-gray-600 truncate block">{c.subtitle}</span>}</button>)}
              </div>
            </div>
          ) : null)}
        </div>
      )}
    </section>
  );
}

function resolveTitle(type: ConnectionType, id: string, binder: BinderItem[], state: ReturnType<typeof useAppStore.getState>) {
  if (type === 'scene') return findItem(binder, id)?.title;
  if (type === 'fragment') return state.fragments.find((x) => x.id === id && !x.trashedAt)?.title;
  if (type === 'omitted_material') return state.omittedMaterial.find((x) => x.id === id && !x.trashedAt)?.title;
  if (type === 'notebook_entry') return state.notebookEntries.find((x) => x.id === id)?.title;
  if (type === 'codex_entry') return state.codexEntries.find((x) => x.id === id)?.name;
  if (type === 'question') return state.questions.find((x) => x.id === id)?.text;
  if (type === 'moodboard_item') return state.moodboardItems.find((x) => x.id === id)?.title;
  if (type === 'research_item') return state.researchEntries.find((x) => x.id === id && !x.trashedAt)?.title;
}
