import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { countWords } from '../utils/textStats';
import type { AssemblyScene, BinderItem, ManuscriptAssembly } from '../types';

function flattenDocuments(items: BinderItem[], path: string[] = []): Array<{ item: BinderItem; path: string }> {
  return items.flatMap((item) => {
    const nextPath = item.id === 'manuscript' ? [] : [...path, item.title];
    return [
      ...(item.type === 'document' ? [{ item, path: nextPath.slice(0, -1).join(' / ') || 'Manuscript' }] : []),
      ...flattenDocuments(item.children, nextPath),
    ];
  });
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

function orderedScenes(assembly: ManuscriptAssembly): AssemblyScene[] {
  return [...assembly.scenes].sort((a, b) => a.order - b.order);
}

export function ManuscriptAssemblyView() {
  const {
    binder,
    manuscriptAssemblies = [],
    revisionPasses = [],
    addManuscriptAssembly,
    updateManuscriptAssembly,
    deleteManuscriptAssembly,
    archiveManuscriptAssembly,
    unarchiveManuscriptAssembly,
    setAssemblyScenes,
    addSceneToAssembly,
    removeSceneFromAssembly,
    updateAssemblyScene,
    reorderAssemblyScenes,
    createAssemblyFromBinder,
    createAssemblyFromChronologicalOrder,
    createAssemblyFromRevisionPass,
    pendingSelectId,
    setPendingSelectId,
    setArea,
    setViewMode,
    selectItem,
  } = useAppStore();

  const [selectedId, setSelectedId] = useState<string | null>(manuscriptAssemblies[0]?.id ?? null);
  const [sceneQuery, setSceneQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [povFilter, setPovFilter] = useState('');
  const [plotlineFilter, setPlotlineFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [revisionPassId, setRevisionPassId] = useState('');
  const [exportWarning, setExportWarning] = useState('');

  const manuscriptRoot = binder.find((item) => item.id === 'manuscript');
  const sceneRecords = useMemo(() => flattenDocuments(manuscriptRoot ? [manuscriptRoot] : binder), [binder, manuscriptRoot]);
  const sceneById = useMemo(() => new Map(sceneRecords.map((record) => [record.item.id, record])), [sceneRecords]);
  const activeAssemblies = manuscriptAssemblies.filter((assembly) => !assembly.archivedAt);
  const archivedAssemblies = manuscriptAssemblies.filter((assembly) => assembly.archivedAt);
  const effectiveSelectedId = pendingSelectId && manuscriptAssemblies.some((assembly) => assembly.id === pendingSelectId) ? pendingSelectId : selectedId;
  const selectedAssembly = manuscriptAssemblies.find((assembly) => assembly.id === effectiveSelectedId) ?? activeAssemblies[0] ?? archivedAssemblies[0] ?? null;
  const assemblyScenes = selectedAssembly ? orderedScenes(selectedAssembly) : [];
  const includedScenes = assemblyScenes.filter((scene) => scene.included);
  const totalWords = includedScenes.reduce((sum, assemblyScene) => sum + countWords(sceneById.get(assemblyScene.sceneId)?.item.content ?? ''), 0);
  const statuses = [...new Set(sceneRecords.map(({ item }) => item.status).filter(Boolean))].sort();
  const povs = [...new Set(sceneRecords.map(({ item }) => item.sceneMetadata?.povCharacter).filter(Boolean))].sort();
  const plotlines = [...new Set(sceneRecords.map(({ item }) => item.sceneMetadata?.plotline).filter(Boolean))].sort();
  const tags = [...new Set(sceneRecords.flatMap(({ item }) => item.sceneMetadata?.tags ?? []))].sort();
  const filteredScenes = sceneRecords.filter(({ item }) => {
    const queryMatches = item.title.toLowerCase().includes(sceneQuery.toLowerCase());
    const statusMatches = !statusFilter || item.status === statusFilter;
    const povMatches = !povFilter || item.sceneMetadata?.povCharacter === povFilter;
    const plotlineMatches = !plotlineFilter || item.sceneMetadata?.plotline === plotlineFilter;
    const tagMatches = !tagFilter || (item.sceneMetadata?.tags ?? []).includes(tagFilter);
    return queryMatches && statusMatches && povMatches && plotlineMatches && tagMatches;
  });

  function createBlank() {
    const id = addManuscriptAssembly();
    setPendingSelectId(null);
    setSelectedId(id);
  }

  function createFromBinder() {
    const id = createAssemblyFromBinder();
    setPendingSelectId(null);
    setSelectedId(id);
  }

  function createFromChronology() {
    const id = createAssemblyFromChronologicalOrder();
    setPendingSelectId(null);
    setSelectedId(id);
  }

  function createFromRevisionPass() {
    if (!revisionPassId) return;
    const pass = revisionPasses.find((item) => item.id === revisionPassId);
    const id = createAssemblyFromRevisionPass(revisionPassId, pass ? `${pass.title} assembly` : undefined);
    setPendingSelectId(null);
    setSelectedId(id);
  }

  function moveScene(sceneId: string, direction: -1 | 1) {
    if (!selectedAssembly) return;
    const ids = assemblyScenes.map((scene) => scene.sceneId);
    const index = ids.indexOf(sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderAssemblyScenes(selectedAssembly.id, ids);
  }

  function openScene(sceneId: string) {
    setArea('manuscript');
    setViewMode('editor');
    selectItem(sceneId);
  }

  function exportMarkdown() {
    if (!selectedAssembly) return;
    const missing: string[] = [];
    const lines = [`# ${selectedAssembly.title}`, ''];
    if (selectedAssembly.description) lines.push(selectedAssembly.description, '');
    includedScenes.forEach((assemblyScene) => {
      const scene = sceneById.get(assemblyScene.sceneId)?.item;
      if (!scene) {
        missing.push(assemblyScene.sceneId);
        return;
      }
      if (assemblyScene.chapterBreakBefore) lines.push('\n# Chapter Break\n');
      if (assemblyScene.sceneBreakBefore) lines.push('\n---\n');
      lines.push(`## ${assemblyScene.titleOverride?.trim() || scene.title}`, '');
      if (selectedAssembly.includeSynopsis && scene.synopsis.trim()) lines.push(`> ${scene.synopsis.trim()}`, '');
      lines.push(htmlToText(scene.content), '');
      if (selectedAssembly.includePrivateNotes && assemblyScene.notes?.trim()) lines.push(`<!-- Assembly notes: ${assemblyScene.notes.trim()} -->`, '');
    });
    setExportWarning(missing.length ? `Skipped ${missing.length} missing scene reference(s).` : '');
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedAssembly.title.replace(/[^a-z0-9]+/gi, '_') || 'assembly'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderAssemblyCard(assembly: ManuscriptAssembly) {
    const included = assembly.scenes.filter((scene) => scene.included).length;
    return (
      <button key={assembly.id} onClick={() => { setSelectedId(assembly.id); setPendingSelectId(null); }} className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedAssembly?.id === assembly.id ? 'border-[#6b46c1] bg-[#6b46c1]/15' : 'border-[#0f3460] bg-[#16213e] hover:bg-[#1f2a48]'} ${assembly.archivedAt ? 'opacity-60' : ''}`}>
        <div className="font-semibold text-gray-100 truncate">{assembly.title}</div>
        <div className="mt-1 text-xs text-gray-400">{included}/{assembly.scenes.length} scenes • {assembly.sourceMode.replace('_', ' ')}</div>
      </button>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-[#0d1117]">
      <aside className="w-80 border-r border-[#0f3460] p-4 overflow-y-auto bg-[#101827]">
        <h1 className="text-xl font-bold mb-4">Assembly</h1>
        <div className="grid gap-2 mb-4">
          <button onClick={createBlank} className="px-3 py-2 rounded bg-[#6b46c1] text-white text-sm text-left">+ Blank assembly</button>
          <button onClick={createFromBinder} className="px-3 py-2 rounded bg-[#2d3748] text-gray-100 text-sm text-left">Create from binder order</button>
          <button onClick={createFromChronology} className="px-3 py-2 rounded bg-[#2d3748] text-gray-100 text-sm text-left">Create from chronological order</button>
          <div className="flex gap-2">
            <select value={revisionPassId} onChange={(event) => setRevisionPassId(event.target.value)} className="min-w-0 flex-1 bg-[#16213e] border border-[#0f3460] rounded px-2 py-2 text-sm">
              <option value="">Revision pass…</option>
              {revisionPasses.map((pass) => <option key={pass.id} value={pass.id}>{pass.title}</option>)}
            </select>
            <button onClick={createFromRevisionPass} disabled={!revisionPassId} className="px-3 py-2 rounded bg-[#2d3748] disabled:opacity-40 text-gray-100 text-sm">Create</button>
          </div>
        </div>
        <div className="space-y-2">{activeAssemblies.map(renderAssemblyCard)}</div>
        {archivedAssemblies.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm text-gray-400 mb-2">Archived assemblies</summary><div className="space-y-2 mt-2">{archivedAssemblies.map(renderAssemblyCard)}</div></details>}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {!selectedAssembly ? <div className="h-full flex items-center justify-center text-gray-500">Create or select an assembly.</div> : (
          <div className="max-w-6xl mx-auto space-y-6">
            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5 space-y-3">
              <div className="flex gap-3"><input value={selectedAssembly.title} onChange={(event) => updateManuscriptAssembly(selectedAssembly.id, { title: event.target.value })} className="flex-1 bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-xl font-bold" /><button onClick={exportMarkdown} className="px-4 rounded bg-emerald-700 text-white">Export MD</button></div>
              <textarea value={selectedAssembly.description ?? ''} onChange={(event) => updateManuscriptAssembly(selectedAssembly.id, { description: event.target.value })} placeholder="Description" className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 min-h-20" />
              <div className="flex flex-wrap gap-2 text-sm text-gray-300"><span>{includedScenes.length} included scenes</span><span>•</span><span>{totalWords} words</span><span>•</span><span>~{Math.max(1, Math.ceil(totalWords / 250))} pages</span><span>•</span><span>{selectedAssembly.sourceMode.replace('_', ' ')}</span></div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-300">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!selectedAssembly.includeSynopsis} onChange={(event) => updateManuscriptAssembly(selectedAssembly.id, { includeSynopsis: event.target.checked })} />Include scene synopses in export</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!selectedAssembly.includePrivateNotes} onChange={(event) => updateManuscriptAssembly(selectedAssembly.id, { includePrivateNotes: event.target.checked })} />Include assembly notes in export</label>
              </div>
              {exportWarning && <div className="text-sm text-amber-300">{exportWarning}</div>}
              <div className="flex gap-2">{selectedAssembly.archivedAt ? <button onClick={() => unarchiveManuscriptAssembly(selectedAssembly.id)} className="px-3 py-1.5 rounded bg-emerald-700 text-white text-sm">Unarchive</button> : <button onClick={() => archiveManuscriptAssembly(selectedAssembly.id)} className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm">Archive</button>}<button onClick={() => { if (confirm('Delete this assembly?')) { deleteManuscriptAssembly(selectedAssembly.id); setSelectedId(null); } }} className="px-3 py-1.5 rounded bg-red-900/70 text-red-100 text-sm">Delete</button></div>
            </section>

            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5">
              <div className="flex flex-wrap gap-2 items-center mb-3"><h2 className="font-bold mr-auto">Build controls</h2><button onClick={() => setAssemblyScenes(selectedAssembly.id, sceneRecords.map(({ item }, index) => ({ sceneId: item.id, included: true, order: index })))} className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm">Add all manuscript scenes</button><button onClick={() => setAssemblyScenes(selectedAssembly.id, [])} className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm">Clear scenes</button></div>
              <input value={sceneQuery} onChange={(event) => setSceneQuery(event.target.value)} placeholder="Search scenes to add…" className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm mb-3" />
              <div className="grid md:grid-cols-4 gap-2 mb-3">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm"><option value="">Any status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                <select value={povFilter} onChange={(event) => setPovFilter(event.target.value)} className="bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm"><option value="">Any POV</option>{povs.map((pov) => <option key={pov} value={pov}>{pov}</option>)}</select>
                <select value={plotlineFilter} onChange={(event) => setPlotlineFilter(event.target.value)} className="bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm"><option value="">Any plotline</option>{plotlines.map((plotline) => <option key={plotline} value={plotline}>{plotline}</option>)}</select>
                <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm"><option value="">Any tag</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
              </div>
              <div className="grid md:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">{filteredScenes.map(({ item }) => <button key={item.id} onClick={() => addSceneToAssembly(selectedAssembly.id, item.id)} className="text-left bg-[#0d1117] rounded px-3 py-2 text-sm hover:bg-[#1f2a48]"><span className="font-medium">{item.title}</span><span className="ml-2 text-xs text-gray-500">{countWords(item.content)} words</span></button>)}</div>
            </section>

            <section className="space-y-3">
              <h2 className="font-bold">Scene list</h2>
              {assemblyScenes.map((assemblyScene, index) => {
                const record = sceneById.get(assemblyScene.sceneId);
                const scene = record?.item;
                return <div key={`${assemblyScene.sceneId}-${index}`} className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center"><button onClick={() => moveScene(assemblyScene.sceneId, -1)} disabled={index === 0} className="px-2 py-1 rounded bg-[#2d3748] disabled:opacity-40">↑</button><button onClick={() => moveScene(assemblyScene.sceneId, 1)} disabled={index === assemblyScenes.length - 1} className="px-2 py-1 rounded bg-[#2d3748] disabled:opacity-40">↓</button><div className="flex-1 min-w-52 font-semibold">{scene ? scene.title : `Missing scene: ${assemblyScene.sceneId}`}<div className="text-xs text-gray-500">{record?.path ?? 'Broken reference'} • {scene?.status ?? 'Missing'} • {countWords(scene?.content ?? '')} words</div></div>{scene && <button onClick={() => openScene(scene.id)} className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm">Open</button>}<button onClick={() => removeSceneFromAssembly(selectedAssembly.id, assemblyScene.sceneId)} className="px-3 py-1.5 rounded bg-red-900/60 text-red-100 text-sm">Remove</button></div>
                  <div className="grid md:grid-cols-3 gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={assemblyScene.included} onChange={(event) => updateAssemblyScene(selectedAssembly.id, assemblyScene.sceneId, { included: event.target.checked })} />Included</label><label className="flex items-center gap-2"><input type="checkbox" checked={!!assemblyScene.chapterBreakBefore} onChange={(event) => updateAssemblyScene(selectedAssembly.id, assemblyScene.sceneId, { chapterBreakBefore: event.target.checked })} />Chapter break before</label><label className="flex items-center gap-2"><input type="checkbox" checked={!!assemblyScene.sceneBreakBefore} onChange={(event) => updateAssemblyScene(selectedAssembly.id, assemblyScene.sceneId, { sceneBreakBefore: event.target.checked })} />Scene break before</label></div>
                  <input value={assemblyScene.titleOverride ?? ''} onChange={(event) => updateAssemblyScene(selectedAssembly.id, assemblyScene.sceneId, { titleOverride: event.target.value })} placeholder="Optional title override" className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm" />
                  <textarea value={assemblyScene.notes ?? ''} onChange={(event) => updateAssemblyScene(selectedAssembly.id, assemblyScene.sceneId, { notes: event.target.value })} placeholder="Assembly-only notes" className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm min-h-16" />
                </div>;
              })}
            </section>

            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5">
              <h2 className="font-bold mb-3">Preview</h2>
              <div className="space-y-3">{includedScenes.map((assemblyScene) => {
                const scene = sceneById.get(assemblyScene.sceneId)?.item;
                return <div key={`preview-${assemblyScene.sceneId}`} className="border-l-2 border-[#6b46c1] pl-3"><div className="text-xs text-gray-500">{assemblyScene.chapterBreakBefore ? 'Chapter break • ' : ''}{assemblyScene.sceneBreakBefore ? 'Scene break • ' : ''}{scene ? `${countWords(scene.content)} words` : 'Missing reference skipped on export'}</div><div className="font-semibold">{assemblyScene.titleOverride?.trim() || scene?.title || `Missing scene: ${assemblyScene.sceneId}`}</div><p className="text-sm text-gray-400 line-clamp-2">{scene?.synopsis || htmlToText(scene?.content ?? '').slice(0, 240) || 'No preview text.'}</p></div>;
              })}</div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
