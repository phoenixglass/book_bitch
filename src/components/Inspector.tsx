import { useState } from 'react';
import { useAppStore, findItem } from '../store/appStore';
import { TagInput } from './TagInput';
import type { BinderItem, Label, Status, SceneMetadata } from '../types';

const LABELS: Label[] = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const STATUSES: Status[] = [
  'No Status', 'To Do', 'In Progress', 'First Draft',
  'Revised Draft', 'Final Draft', 'Done',
];
const LABEL_COLORS: Record<string, string> = {
  none: '#4a5568', red: '#fc8181', orange: '#f6ad55', yellow: '#f6e05e',
  green: '#68d391', blue: '#63b3ed', purple: '#b794f4',
};
const STATUS_COLORS: Record<Status, string> = {
  'No Status': '#4a5568',
  'To Do': '#fc8181',
  'In Progress': '#f6ad55',
  'First Draft': '#f6e05e',
  'Revised Draft': '#68d391',
  'Final Draft': '#63b3ed',
  'Done': '#b794f4',
};

type Tab = 'synopsis' | 'scene' | 'notes' | 'metadata' | 'snapshots';


function StrField({
  label, value, onChange, placeholder, rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] transition-colors resize-none placeholder-gray-600"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] transition-colors placeholder-gray-600"
        />
      )}
    </div>
  );
}

function SliderField({
  label, value, onChange, max = 10,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <label className="text-xs text-gray-500">{label}</label>
        <span className="text-xs text-gray-400">{value || '—'}/{max}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
    </div>
  );
}

function SceneTab({ item, updateMeta }: { item: BinderItem; updateMeta: (patch: Partial<SceneMetadata>) => void }) {
  const meta = item.sceneMetadata ?? {};

  return (
    <div className="flex flex-col gap-3">
      <StrField
        label="POV Character"
        value={meta.povCharacter ?? ''}
        onChange={(v) => updateMeta({ povCharacter: v })}
        placeholder="Who is the POV character?"
      />

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">Characters Present</label>
        <TagInput
          tags={meta.charactersPresent ?? []}
          onChange={(v) => updateMeta({ charactersPresent: v })}
          placeholder="Add character…"
        />
      </div>

      <StrField
        label="Location"
        value={meta.location ?? ''}
        onChange={(v) => updateMeta({ location: v })}
        placeholder="Where does this take place?"
      />

      <div className="grid grid-cols-2 gap-2">
        <StrField
          label="Timeline Start"
          value={meta.timelineDateStart ?? ''}
          onChange={(v) => updateMeta({ timelineDateStart: v })}
          placeholder="e.g. March 1941"
        />
        <StrField
          label="Timeline End"
          value={meta.timelineDateEnd ?? ''}
          onChange={(v) => updateMeta({ timelineDateEnd: v })}
          placeholder="optional"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={meta.timelineUncertain ?? false}
          onChange={(e) => updateMeta({ timelineUncertain: e.target.checked })}
          className="accent-purple-500"
        />
        Approximate / uncertain date
      </label>

      <StrField
        label="Plotline / Thread"
        value={meta.plotline ?? ''}
        onChange={(v) => updateMeta({ plotline: v })}
        placeholder="Which plotline?"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Manuscript #</label>
          <input
            type="number"
            value={meta.manuscriptOrder ?? ''}
            onChange={(e) => updateMeta({ manuscriptOrder: Number(e.target.value) })}
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Chrono #</label>
          <input
            type="number"
            value={meta.chronologicalOrder ?? ''}
            onChange={(e) => updateMeta({ chronologicalOrder: Number(e.target.value) })}
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
          />
        </div>
      </div>

      <SliderField
        label="Emotional Temperature"
        value={meta.emotionalTemperature ?? 0}
        onChange={(v) => updateMeta({ emotionalTemperature: v })}
      />

      <SliderField
        label="Tension Level"
        value={meta.tensionLevel ?? 0}
        onChange={(v) => updateMeta({ tensionLevel: v })}
      />

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">Themes</label>
        <TagInput
          tags={meta.themes ?? []}
          onChange={(v) => updateMeta({ themes: v })}
          placeholder="Add theme…"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">Motifs</label>
        <TagInput
          tags={meta.motifs ?? []}
          onChange={(v) => updateMeta({ motifs: v })}
          placeholder="Add motif…"
        />
      </div>

      <StrField
        label="Scene Function"
        value={meta.sceneFunction ?? ''}
        onChange={(v) => updateMeta({ sceneFunction: v })}
        placeholder="e.g. Revelation, confrontation…"
      />

      <StrField
        label="What changed by end of scene?"
        value={meta.whatChanged ?? ''}
        onChange={(v) => updateMeta({ whatChanged: v })}
        rows={2}
      />

      <StrField
        label="Unanswered questions"
        value={meta.unansweredQuestions ?? ''}
        onChange={(v) => updateMeta({ unansweredQuestions: v })}
        rows={2}
        placeholder="What is left unresolved?"
      />

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">Tags</label>
        <TagInput
          tags={meta.tags ?? []}
          onChange={(v) => updateMeta({ tags: v })}
          placeholder="Add tag…"
        />
      </div>
    </div>
  );
}

export function Inspector() {
  const {
    binder, selectedId, updateItem,
    takeSnapshot, restoreSnapshot, deleteSnapshot,
    removeItem, sendSceneToOmitted,
    projectTarget, setProjectTarget,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>('synopsis');
  const [snapshotLabel, setSnapshotLabel] = useState('');

  const item = selectedId ? findItem(binder, selectedId) : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'synopsis', label: 'Synopsis' },
    { id: 'scene', label: 'Scene' },
    { id: 'notes', label: 'Notes' },
    { id: 'metadata', label: 'Meta' },
    { id: 'snapshots', label: '📸' },
  ];

  function updateMeta(patch: Partial<SceneMetadata>) {
    if (!item) return;
    updateItem(item.id, {
      sceneMetadata: { ...item.sceneMetadata, ...patch },
    });
  }

  return (
    <div className="w-60 shrink-0 bg-[#16213e] border-l border-[#0f3460] flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-[#0f3460]">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Inspector
        </div>
        <div className="flex gap-0.5 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-1 px-1.5 rounded text-xs transition-colors ${
                tab === t.id
                  ? 'bg-[#6b46c1] text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {!item && (
          <p className="text-xs text-gray-600 italic">Select a document</p>
        )}

        {item && (
          <>
            {tab === 'synopsis' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500">Title</label>
                <input
                  value={item.title}
                  onChange={(e) => updateItem(item.id, { title: e.target.value })}
                  className="bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm text-white outline-none focus:border-[#6b46c1] transition-colors"
                />
                <label className="text-xs text-gray-500">Synopsis</label>
                <textarea
                  value={item.synopsis}
                  onChange={(e) => updateItem(item.id, { synopsis: e.target.value })}
                  placeholder="Brief summary of this section..."
                  rows={6}
                  className="bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-[#6b46c1] transition-colors resize-none placeholder-gray-600"
                />
              </div>
            )}

            {tab === 'scene' && item.type === 'document' && (
              <SceneTab item={item} updateMeta={updateMeta} />
            )}
            {tab === 'scene' && item.type !== 'document' && (
              <p className="text-xs text-gray-600 italic">Scene metadata is only available for documents.</p>
            )}

            {tab === 'notes' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500">Document Notes</label>
                <textarea
                  value={item.notes}
                  onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                  placeholder="Private notes for this document..."
                  rows={14}
                  className="bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-[#6b46c1] transition-colors resize-none placeholder-gray-600"
                />
              </div>
            )}

            {tab === 'metadata' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Label</label>
                  <select
                    value={item.label}
                    onChange={(e) => updateItem(item.id, { label: e.target.value as Label })}
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm outline-none focus:border-[#6b46c1]"
                    style={{ color: LABEL_COLORS[item.label] }}
                  >
                    {LABELS.map((l) => (
                      <option key={l} value={l} style={{ color: LABEL_COLORS[l] }}>
                        ● {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Status</label>
                  <select
                    value={item.status}
                    onChange={(e) => updateItem(item.id, { status: e.target.value as Status })}
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm outline-none focus:border-[#6b46c1]"
                    style={{ color: STATUS_COLORS[item.status] }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} style={{ color: STATUS_COLORS[s] }}>● {s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Word Count Target</label>
                  <input
                    type="number"
                    value={item.wordCountTarget || ''}
                    onChange={(e) => updateItem(item.id, { wordCountTarget: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-[#6b46c1]"
                  />
                </div>

                <div className="pt-2 border-t border-[#0f3460]">
                  <label className="text-xs text-gray-500 block mb-1">Project Word Target</label>
                  <input
                    type="number"
                    value={projectTarget.wordTarget || ''}
                    onChange={(e) => setProjectTarget({ wordTarget: parseInt(e.target.value) || 0 })}
                    placeholder="80000"
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-[#6b46c1]"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Deadline</label>
                  <input
                    type="date"
                    value={projectTarget.deadlineDate}
                    onChange={(e) => setProjectTarget({ deadlineDate: e.target.value })}
                    className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-[#6b46c1]"
                  />
                </div>

                <div className="pt-2 border-t border-[#0f3460] flex flex-col gap-2">
                  <button
                    onClick={() => {
                      const reason = window.prompt('Reason for omitting (optional):') ?? '';
                      if (reason !== null) {
                        sendSceneToOmitted(item.id, reason);
                      }
                    }}
                    className="w-full py-1 rounded bg-amber-900/30 hover:bg-amber-800/40 text-amber-400 text-xs transition-colors"
                  >
                    🗂 Send to Omitted Material
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Move "${item.title}" to Trash?`)) {
                        removeItem(item.id);
                      }
                    }}
                    className="w-full py-1 rounded bg-red-900/30 hover:bg-red-800/40 text-red-400 text-xs transition-colors"
                  >
                    🗑 Move to Trash
                  </button>
                </div>
              </div>
            )}

            {tab === 'snapshots' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    value={snapshotLabel}
                    onChange={(e) => setSnapshotLabel(e.target.value)}
                    placeholder="Snapshot label..."
                    className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
                  />
                  <button
                    onClick={() => { takeSnapshot(item.id, snapshotLabel); setSnapshotLabel(''); }}
                    className="px-2 py-1 bg-[#6b46c1] text-white rounded text-xs hover:bg-[#553c9a] transition-colors"
                  >
                    📸
                  </button>
                </div>

                {item.snapshots.length === 0 && (
                  <p className="text-xs text-gray-600 italic">No snapshots yet.</p>
                )}

                <div className="flex flex-col gap-2">
                  {[...item.snapshots].reverse().map((snap) => (
                    <div key={snap.id} className="bg-[#1a1a2e] border border-[#2d3748] rounded p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-300">{snap.label || 'Snapshot'}</span>
                        <span className="text-gray-600 text-xs">
                          {new Date(snap.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {snap.note && (
                        <p className="text-gray-500 text-xs mb-1 italic">{snap.note}</p>
                      )}
                      <p className="text-gray-500 text-xs mb-2 truncate">
                        {snap.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 60) || '—'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (window.confirm('Restore this snapshot? Current content will be overwritten.')) {
                              restoreSnapshot(item.id, snap.id);
                            }
                          }}
                          className="flex-1 py-0.5 bg-[#6b46c1]/30 text-purple-300 rounded hover:bg-[#6b46c1]/50 transition-colors text-xs"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => deleteSnapshot(item.id, snap.id)}
                          className="px-2 py-0.5 text-red-400 hover:bg-red-900/30 rounded transition-colors text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
