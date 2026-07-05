import { useMemo, useState } from 'react';
import { useAppStore, findItem } from '../store/appStore';
import { countWords } from '../utils/textStats';
import type { BinderItem, RevisionPass, RevisionPassSceneStatus } from '../types';

const STATUS_LABELS: Record<RevisionPassSceneStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
};

const TEMPLATES: Array<
  Pick<RevisionPass, 'title' | 'description' | 'focus' | 'color'> & { checklist: string[] }
> = [
  {
    title: 'Continuity Pass',
    description: 'Find contradictions and continuity gaps.',
    focus: 'Continuity',
    color: '#38bdf8',
    checklist: [
      'Verify character facts',
      'Verify timeline/date',
      'Verify location',
      'Check for contradictions with Codex',
      'Note any unresolved continuity questions',
    ],
  },
  {
    title: 'Timeline Pass',
    description: 'Check chronology, ordering, and cause/effect.',
    focus: 'Timeline',
    color: '#22c55e',
    checklist: [
      'Confirm chronological position',
      'Confirm manuscript position still works',
      'Check date/time clues',
      'Check causal sequence',
      'Flag uncertainty',
    ],
  },
  {
    title: 'Character Voice Pass',
    description: 'Keep character voice sharp and consistent.',
    focus: 'Voice',
    color: '#a78bfa',
    checklist: [
      'Check dialogue voice',
      'Check interiority/narration voice',
      'Check repeated phrases',
      'Check emotional logic',
      'Mark voice drift',
    ],
  },
  {
    title: 'Emotional Logic Pass',
    description: 'Track the emotional turn and escalation in every scene.',
    focus: 'Emotional logic',
    color: '#fb7185',
    checklist: [
      'Identify what changes by scene end',
      'Check power shift',
      'Check desire/resistance',
      'Check emotional escalation',
      'Cut explanation that should be dramatized',
    ],
  },
  {
    title: 'Line Edit Pass',
    description: 'Tighten prose at the sentence level.',
    focus: 'Line edit',
    color: '#f59e0b',
    checklist: [
      'Cut throat-clearing',
      'Check sentence rhythm',
      'Remove repeated words/phrases',
      'Strengthen verbs',
      'Check scene ending',
    ],
  },
  {
    title: 'Research / Fact Check Pass',
    description: 'Verify real-world details and unresolved research.',
    focus: 'Research / fact-check',
    color: '#14b8a6',
    checklist: [
      'Verify factual claims',
      'Link relevant research notes',
      'Check names/titles/places',
      'Flag unresolved research questions',
      'Update Codex if needed',
    ],
  },
];

function flattenDocuments(items: BinderItem[]): BinderItem[] {
  const docs: BinderItem[] = [];

  for (const item of items) {
    if (item.type === 'document') docs.push(item);
    docs.push(...flattenDocuments(item.children));
  }

  return docs;
}

function getManuscriptScenes(binder: BinderItem[]): BinderItem[] {
  const manuscriptRoot = binder.find(
    (item) => item.id === 'manuscript' || item.title.toLowerCase() === 'manuscript',
  );

  if (manuscriptRoot) return flattenDocuments(manuscriptRoot.children);

  return flattenDocuments(
    binder.filter((item) => !['research', 'trash'].includes(item.id.toLowerCase())),
  );
}

function getNextRunnableSceneId(pass: RevisionPass): string | null {
  return pass.targetSceneIds.find((sceneId) => {
    const status = pass.sceneStates[sceneId]?.status ?? 'not_started';
    return status !== 'done' && status !== 'skipped';
  }) ?? pass.targetSceneIds[0] ?? null;
}

function passProgress(pass: RevisionPass) {
  const total = pass.targetSceneIds.length;
  const states = pass.targetSceneIds.map(
    (id) => pass.sceneStates[id]?.status ?? 'not_started',
  );
  const done = states.filter((status) => status === 'done').length;
  const inProgress = states.filter((status) => status === 'in_progress').length;
  const skipped = states.filter((status) => status === 'skipped').length;

  return {
    total,
    done,
    inProgress,
    skipped,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

export function RevisionPassesView() {
  const {
    binder,
    revisionPasses = [],
    addRevisionPass,
    updateRevisionPass,
    deleteRevisionPass,
    archiveRevisionPass,
    unarchiveRevisionPass,
    setRevisionPassTargets,
    addRevisionPassChecklistItem,
    updateRevisionPassChecklistItem,
    deleteRevisionPassChecklistItem,
    updateRevisionSceneState,
    toggleRevisionSceneChecklistItem,
    setArea,
    setViewMode,
    selectItem,
  } = useAppStore();

  const [selectedPassId, setSelectedPassId] = useState<string | null>(null);
  const [sceneQuery, setSceneQuery] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const scenes = useMemo(() => getManuscriptScenes(binder), [binder]);
  const selectedPass = revisionPasses.find((pass) => pass.id === selectedPassId)
    ?? revisionPasses.find((pass) => !pass.archivedAt)
    ?? revisionPasses[0]
    ?? null;
  const activePasses = revisionPasses.filter((pass) => !pass.archivedAt);
  const archivedPasses = revisionPasses.filter((pass) => pass.archivedAt);
  const filteredScenes = scenes.filter((scene) =>
    scene.title.toLowerCase().includes(sceneQuery.trim().toLowerCase()),
  );
  const progress = selectedPass ? passProgress(selectedPass) : null;
  const runnableSceneId = selectedPass
    ? activeSceneId && selectedPass.targetSceneIds.includes(activeSceneId)
      ? activeSceneId
      : getNextRunnableSceneId(selectedPass)
    : null;
  const activeScene = runnableSceneId ? findItem(binder, runnableSceneId) : null;
  const activeSceneState = selectedPass && runnableSceneId
    ? selectedPass.sceneStates[runnableSceneId] ?? {
      sceneId: runnableSceneId,
      status: 'not_started' as RevisionPassSceneStatus,
      notes: '',
      checklist: {},
      updatedAt: 0,
    }
    : null;
  const activeSceneChecklistCount = selectedPass && activeSceneState
    ? selectedPass.checklist.filter((item) => activeSceneState.checklist[item.id]).length
    : 0;

  function createBlankPass() {
    const id = addRevisionPass();
    setSelectedPassId(id);
  }

  function createTemplatePass(templateTitle: string) {
    const template = TEMPLATES.find((item) => item.title === templateTitle);
    if (!template) return;

    const id = addRevisionPass({
      title: template.title,
      description: template.description,
      focus: template.focus,
      color: template.color,
    });

    for (const checklistText of template.checklist) {
      addRevisionPassChecklistItem(id, checklistText);
    }

    setSelectedPassId(id);
  }

  function setAllTargets() {
    if (!selectedPass) return;
    const sceneIds = scenes.map((scene) => scene.id);
    setRevisionPassTargets(selectedPass.id, sceneIds);
    setActiveSceneId(sceneIds[0] ?? null);
  }

  function startOrContinuePass() {
    if (!selectedPass) return;
    setActiveSceneId(getNextRunnableSceneId(selectedPass));
  }

  function moveActiveScene(direction: 'previous' | 'next') {
    if (!selectedPass || !runnableSceneId) return;

    const currentIndex = selectedPass.targetSceneIds.indexOf(runnableSceneId);
    const offset = direction === 'next' ? 1 : -1;
    const nextSceneId = selectedPass.targetSceneIds[currentIndex + offset] ?? null;
    setActiveSceneId(nextSceneId);
  }

  function markActiveSceneDoneAndAdvance() {
    if (!selectedPass || !runnableSceneId) return;

    updateRevisionSceneState(selectedPass.id, runnableSceneId, { status: 'done' });
    const currentIndex = selectedPass.targetSceneIds.indexOf(runnableSceneId);
    const nextSceneId = selectedPass.targetSceneIds.slice(currentIndex + 1).find((sceneId) => {
      const status = selectedPass.sceneStates[sceneId]?.status ?? 'not_started';
      return status !== 'done' && status !== 'skipped';
    }) ?? null;
    setActiveSceneId(nextSceneId);
  }

  function toggleTarget(sceneId: string) {
    if (!selectedPass) return;

    const nextTargetIds = selectedPass.targetSceneIds.includes(sceneId)
      ? selectedPass.targetSceneIds.filter((id) => id !== sceneId)
      : [...selectedPass.targetSceneIds, sceneId];

    setRevisionPassTargets(selectedPass.id, nextTargetIds);
  }

  function removeTarget(sceneId: string) {
    if (!selectedPass) return;
    setRevisionPassTargets(
      selectedPass.id,
      selectedPass.targetSceneIds.filter((id) => id !== sceneId),
    );
  }

  function addChecklistItem() {
    if (!selectedPass) return;
    const text = newChecklistText.trim();
    if (!text) return;

    addRevisionPassChecklistItem(selectedPass.id, text);
    setNewChecklistText('');
  }

  function openScene(sceneId: string) {
    setArea('manuscript');
    setViewMode('editor');
    selectItem(sceneId);
  }

  function renderPassCard(pass: RevisionPass) {
    const cardProgress = passProgress(pass);
    const isSelected = selectedPass?.id === pass.id;

    return (
      <button
        key={pass.id}
        onClick={() => setSelectedPassId(pass.id)}
        className={`w-full text-left p-3 rounded-xl border transition-colors ${
          isSelected
            ? 'border-[#6b46c1] bg-[#6b46c1]/15'
            : 'border-[#0f3460] bg-[#16213e] hover:bg-[#1f2a48]'
        } ${pass.archivedAt ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pass.color }} />
          <span className="font-semibold text-gray-100 flex-1 truncate">{pass.title}</span>
          {pass.archivedAt && <span className="text-[10px] uppercase text-gray-400">Archived</span>}
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {cardProgress.total} scenes • {cardProgress.percent}% done
        </div>
        <div className="mt-2 h-1.5 rounded bg-[#0d1117] overflow-hidden">
          <div className="h-full bg-[#6b46c1]" style={{ width: `${cardProgress.percent}%` }} />
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-[#0d1117]">
      <aside className="w-80 border-r border-[#0f3460] p-4 overflow-y-auto bg-[#101827]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Revision</h1>
          <button
            onClick={createBlankPass}
            className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm"
          >
            + Blank
          </button>
        </div>

        <select
          className="w-full mb-4 bg-[#16213e] border border-[#0f3460] rounded px-3 py-2 text-sm"
          value=""
          onChange={(event) => createTemplatePass(event.target.value)}
        >
          <option value="">Create from template…</option>
          {TEMPLATES.map((template) => (
            <option key={template.title} value={template.title}>{template.title}</option>
          ))}
        </select>

        <div className="space-y-2">{activePasses.map(renderPassCard)}</div>

        {archivedPasses.length > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm text-gray-400 mb-2">Archived passes</summary>
            <div className="space-y-2 mt-2">{archivedPasses.map(renderPassCard)}</div>
          </details>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {!selectedPass ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
            <div className="text-5xl mb-3">🧵</div>
            <p className="text-lg font-semibold text-gray-300">No revision pass selected.</p>
            <p className="text-sm">Create a blank pass or choose a template to get started.</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6 pb-10">
            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5 space-y-3">
              <div className="flex gap-3">
                <input
                  value={selectedPass.title}
                  onChange={(event) => updateRevisionPass(selectedPass.id, { title: event.target.value })}
                  className="flex-1 bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-xl font-bold"
                />
                <input
                  type="color"
                  value={selectedPass.color}
                  onChange={(event) => updateRevisionPass(selectedPass.id, { color: event.target.value })}
                  className="h-11 w-14 bg-transparent"
                  aria-label="Revision pass color"
                />
              </div>

              <input
                value={selectedPass.focus}
                onChange={(event) => updateRevisionPass(selectedPass.id, { focus: event.target.value })}
                placeholder="Focus"
                className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2"
              />

              <textarea
                value={selectedPass.description}
                onChange={(event) => updateRevisionPass(selectedPass.id, { description: event.target.value })}
                placeholder="Description"
                className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 min-h-20"
              />

              <div className="flex gap-2">
                {selectedPass.archivedAt ? (
                  <button
                    onClick={() => unarchiveRevisionPass(selectedPass.id)}
                    className="px-3 py-1.5 rounded bg-emerald-700 text-white text-sm"
                  >
                    Unarchive
                  </button>
                ) : (
                  <button
                    onClick={() => archiveRevisionPass(selectedPass.id)}
                    className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm"
                  >
                    Archive
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Delete this revision pass?')) {
                      deleteRevisionPass(selectedPass.id);
                      setSelectedPassId(null);
                    }
                  }}
                  className="px-3 py-1.5 rounded bg-red-900/70 text-red-100 text-sm"
                >
                  Delete
                </button>
              </div>
            </section>

            {progress && (
              <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ['Targets', progress.total],
                  ['Done', progress.done],
                  ['In progress', progress.inProgress],
                  ['Skipped', progress.skipped],
                  ['Complete', `${progress.percent}%`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#16213e] border border-[#0f3460] rounded-xl p-4">
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className="text-2xl font-bold">{value}</div>
                  </div>
                ))}
              </section>
            )}

            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto">
                  <h2 className="font-bold">Run this revision pass</h2>
                  <p className="text-sm text-gray-400">
                    Work through target scenes one at a time, updating status, checklist, and notes as you go.
                  </p>
                </div>
                <button
                  onClick={startOrContinuePass}
                  disabled={selectedPass.targetSceneIds.length === 0}
                  className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {runnableSceneId ? 'Continue pass' : 'Start pass'}
                </button>
              </div>

              {selectedPass.targetSceneIds.length === 0 ? (
                <div className="rounded border border-dashed border-[#0f3460] p-4 text-sm text-gray-400">
                  Add target scenes below before running this revision pass.
                </div>
              ) : activeScene && runnableSceneId && activeSceneState ? (
                <div className="rounded-xl bg-[#0d1117] border border-[#0f3460] p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-56">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Current scene</div>
                      <div className="font-semibold text-lg">{activeScene.title}</div>
                      <div className="text-xs text-gray-500">{countWords(activeScene.content)} words</div>
                    </div>
                    <select
                      value={activeSceneState.status}
                      onChange={(event) =>
                        updateRevisionSceneState(selectedPass.id, runnableSceneId, {
                          status: event.target.value as RevisionPassSceneStatus,
                        })
                      }
                      className="bg-[#16213e] border border-[#0f3460] rounded px-2 py-1 text-sm"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-400">
                      Checklist {activeSceneChecklistCount}/{selectedPass.checklist.length}
                    </span>
                    <button
                      onClick={() => openScene(runnableSceneId)}
                      className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm"
                    >
                      Open scene
                    </button>
                  </div>

                  {selectedPass.checklist.length > 0 && (
                    <div className="grid md:grid-cols-2 gap-2">
                      {selectedPass.checklist.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={!!activeSceneState.checklist[item.id]}
                            onChange={() => toggleRevisionSceneChecklistItem(selectedPass.id, runnableSceneId, item.id)}
                          />
                          {item.text}
                        </label>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={activeSceneState.notes}
                    onChange={(event) =>
                      updateRevisionSceneState(selectedPass.id, runnableSceneId, { notes: event.target.value })
                    }
                    placeholder="Notes for this scene in this pass…"
                    className="w-full bg-[#16213e] border border-[#0f3460] rounded px-3 py-2 text-sm min-h-24"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => moveActiveScene('previous')}
                      disabled={selectedPass.targetSceneIds.indexOf(runnableSceneId) <= 0}
                      className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous scene
                    </button>
                    <button
                      onClick={() => moveActiveScene('next')}
                      disabled={selectedPass.targetSceneIds.indexOf(runnableSceneId) >= selectedPass.targetSceneIds.length - 1}
                      className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next scene
                    </button>
                    <button
                      onClick={markActiveSceneDoneAndAdvance}
                      className="px-3 py-1.5 rounded bg-emerald-700 text-white text-sm"
                    >
                      Mark done & advance
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed border-[#0f3460] p-4 text-sm text-gray-400">
                  All target scenes are done or skipped. Use the target list below to revisit a scene.
                </div>
              )}
            </section>

            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5">
              <h2 className="font-bold mb-3">Checklist</h2>
              <div className="space-y-2">
                {selectedPass.checklist.map((item) => (
                  <div key={item.id} className="flex gap-2">
                    <input
                      value={item.text}
                      onChange={(event) =>
                        updateRevisionPassChecklistItem(selectedPass.id, item.id, event.target.value)
                      }
                      className="flex-1 bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => deleteRevisionPassChecklistItem(selectedPass.id, item.id)}
                      className="px-3 rounded bg-red-900/60 text-red-100"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input
                  value={newChecklistText}
                  onChange={(event) => setNewChecklistText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addChecklistItem();
                  }}
                  placeholder="New checklist item"
                  className="flex-1 bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm"
                />
                <button onClick={addChecklistItem} className="px-3 rounded bg-[#6b46c1] text-white">
                  Add
                </button>
              </div>
            </section>

            <section className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5">
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <h2 className="font-bold mr-auto">Target scenes</h2>
                <span className="text-xs text-gray-400 mr-2">{scenes.length} manuscript scenes found</span>
                <button
                  onClick={setAllTargets}
                  disabled={scenes.length === 0}
                  className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add all manuscript scenes
                </button>
                <button
                  onClick={() => { setRevisionPassTargets(selectedPass.id, []); setActiveSceneId(null); }}
                  className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm"
                >
                  Clear targets
                </button>
              </div>

              <input
                value={sceneQuery}
                onChange={(event) => setSceneQuery(event.target.value)}
                placeholder="Search manuscript scenes…"
                className="w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm mb-3"
              />

              {filteredScenes.length === 0 ? (
                <div className="rounded border border-dashed border-[#0f3460] p-4 text-sm text-gray-400">
                  No manuscript scenes found. Add document scenes in the Manuscript binder first.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {filteredScenes.map((scene) => (
                    <label
                      key={scene.id}
                      className="flex items-center gap-2 bg-[#0d1117] rounded px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPass.targetSceneIds.includes(scene.id)}
                        onChange={() => toggleTarget(scene.id)}
                      />
                      <span className="truncate">{scene.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              {selectedPass.targetSceneIds.length === 0 && (
                <div className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-5 text-sm text-gray-400">
                  No target scenes yet. Use “Add all manuscript scenes” or select scenes above.
                </div>
              )}

              {selectedPass.targetSceneIds.map((sceneId) => {
                const scene = findItem(binder, sceneId);
                if (!scene) return null;

                const sceneState = selectedPass.sceneStates[sceneId] ?? {
                  sceneId,
                  status: 'not_started' as RevisionPassSceneStatus,
                  notes: '',
                  checklist: {},
                  updatedAt: 0,
                };
                const checkedCount = selectedPass.checklist.filter((item) => sceneState.checklist[item.id]).length;

                return (
                  <div key={sceneId} className="bg-[#16213e] border border-[#0f3460] rounded-2xl p-4">
                    <div className="flex flex-wrap gap-3 items-center">
                      <div className="font-semibold flex-1 min-w-48">
                        {scene.title}
                        <span className="ml-2 text-xs text-gray-500">{countWords(scene.content)} words</span>
                      </div>
                      <select
                        value={sceneState.status}
                        onChange={(event) =>
                          updateRevisionSceneState(selectedPass.id, sceneId, {
                            status: event.target.value as RevisionPassSceneStatus,
                          })
                        }
                        className="bg-[#0d1117] border border-[#0f3460] rounded px-2 py-1 text-sm"
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <span className="text-sm text-gray-400">
                        Checklist {checkedCount}/{selectedPass.checklist.length}
                      </span>
                      <button
                        onClick={() => openScene(sceneId)}
                        className="px-3 py-1.5 rounded bg-[#6b46c1] text-white text-sm"
                      >
                        Open scene
                      </button>
                      <button
                        onClick={() => removeTarget(sceneId)}
                        className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-200 text-sm"
                      >
                        Remove
                      </button>
                    </div>

                    {selectedPass.checklist.length > 0 && (
                      <div className="mt-3 grid md:grid-cols-2 gap-2">
                        {selectedPass.checklist.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 text-sm text-gray-300">
                            <input
                              type="checkbox"
                              checked={!!sceneState.checklist[item.id]}
                              onChange={() => toggleRevisionSceneChecklistItem(selectedPass.id, sceneId, item.id)}
                            />
                            {item.text}
                          </label>
                        ))}
                      </div>
                    )}

                    <textarea
                      value={sceneState.notes}
                      onChange={(event) =>
                        updateRevisionSceneState(selectedPass.id, sceneId, { notes: event.target.value })
                      }
                      placeholder="Per-scene revision notes…"
                      className="mt-3 w-full bg-[#0d1117] border border-[#0f3460] rounded px-3 py-2 text-sm min-h-20"
                    />
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
