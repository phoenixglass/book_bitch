import { useState } from 'react';
import { useAppStore, findItem } from '../store/appStore';
import type { SplitRefTarget } from '../types';

function stripHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('p, h1, h2, h3, li, br').forEach(el => el.after(document.createTextNode('\n')));
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

const REF_TYPES: { type: SplitRefTarget['type']; icon: string; label: string }[] = [
  { type: 'scene', icon: '📄', label: 'Scene' },
  { type: 'fragment', icon: '🧩', label: 'Fragment' },
  { type: 'omitted', icon: '🗂️', label: 'Omitted' },
  { type: 'codex', icon: '📚', label: 'Codex' },
  { type: 'notebook', icon: '📓', label: 'Notebook' },
  { type: 'question', icon: '❓', label: 'Question' },
];

interface RefPickerProps {
  currentType: SplitRefTarget['type'];
  onPick: (target: SplitRefTarget) => void;
}

function RefPicker({ currentType, onPick }: RefPickerProps) {
  const { binder, fragments, omittedMaterial, codexEntries, notebookEntries, questions } = useAppStore();
  const [type, setType] = useState<SplitRefTarget['type']>(currentType);

  function collectScenes(items: typeof binder): { id: string; title: string }[] {
    const scenes: { id: string; title: string }[] = [];
    for (const item of items) {
      if (item.id === 'trash') continue;
      if (item.type === 'document') scenes.push({ id: item.id, title: item.title });
      if (item.children.length) scenes.push(...collectScenes(item.children));
    }
    return scenes;
  }

  const options: { id: string; title: string }[] = (() => {
    switch (type) {
      case 'scene': return collectScenes(binder);
      case 'fragment': return fragments.map(f => ({ id: f.id, title: f.title }));
      case 'omitted': return omittedMaterial.map(o => ({ id: o.id, title: o.title }));
      case 'codex': return codexEntries.map(c => ({ id: c.id, title: c.name }));
      case 'notebook': return notebookEntries.map(n => ({ id: n.id, title: n.title }));
      case 'question': return questions.map(q => ({ id: q.id, title: q.text.slice(0, 80) || 'Question' }));
      default: return [];
    }
  })();

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap">
        {REF_TYPES.map(rt => (
          <button
            key={rt.type}
            onClick={() => setType(rt.type)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${type === rt.type ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2d3748]'}`}
          >
            {rt.icon} {rt.label}
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
        {options.length === 0 && <p className="text-xs text-gray-600 italic">No items of this type.</p>}
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onPick({ type, id: opt.id })}
            className="w-full text-left px-2 py-1 text-xs text-gray-300 hover:bg-[#2d3748] rounded transition-colors truncate"
          >
            {opt.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function RefContent({ target }: { target: SplitRefTarget }) {
  const { binder, fragments, omittedMaterial, codexEntries, notebookEntries, questions } = useAppStore();

  if (target.type === 'scene') {
    const item = findItem(binder, target.id);
    if (!item) return <p className="text-xs text-gray-600 p-3">Scene not found.</p>;
    return (
      <div className="p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">{item.title}</h2>
        {item.synopsis && <p className="text-sm text-gray-400 italic">{item.synopsis}</p>}
        {item.sceneMetadata?.povCharacter && (
          <p className="text-xs text-gray-500">POV: {item.sceneMetadata.povCharacter}</p>
        )}
        <div
          className="prose-sm text-gray-300 text-sm leading-relaxed whitespace-pre-wrap"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {stripHtml(item.content) || <span className="text-gray-600 italic">Empty scene.</span>}
        </div>
      </div>
    );
  }

  if (target.type === 'fragment') {
    const frag = fragments.find(f => f.id === target.id);
    if (!frag) return <p className="text-xs text-gray-600 p-3">Fragment not found.</p>;
    return (
      <div className="p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">{frag.title}</h2>
        <p className="text-xs text-gray-500">{frag.fragmentType.replace('_', ' ')} · {frag.status.replace('_', ' ')}</p>
        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Georgia, serif' }}>
          {frag.content || <span className="text-gray-600 italic">Empty fragment.</span>}
        </div>
      </div>
    );
  }

  if (target.type === 'omitted') {
    const item = omittedMaterial.find(o => o.id === target.id);
    if (!item) return <p className="text-xs text-gray-600 p-3">Omitted material not found.</p>;
    return (
      <div className="p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">{item.title}</h2>
        {item.sourceSceneTitle && <p className="text-xs text-gray-500">From: {item.sourceSceneTitle}</p>}
        {item.reason && <p className="text-xs text-gray-500 italic">Reason: {item.reason}</p>}
        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Georgia, serif' }}>
          {stripHtml(item.content) || <span className="text-gray-600 italic">Empty.</span>}
        </div>
      </div>
    );
  }

  if (target.type === 'codex') {
    const entry = codexEntries.find(c => c.id === target.id);
    if (!entry) return <p className="text-xs text-gray-600 p-3">Codex entry not found.</p>;
    return (
      <div className="p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">{entry.name}</h2>
        <p className="text-xs text-gray-500">{entry.codexType}</p>
        {entry.aliases.length > 0 && <p className="text-xs text-gray-500">aka: {entry.aliases.join(', ')}</p>}
        <p className="text-sm text-gray-300 leading-relaxed">{entry.description}</p>
        {entry.notes && <p className="text-xs text-gray-400 italic">{entry.notes}</p>}
        {Object.entries(entry.customFields).map(([k, v]) => (
          <div key={k}><span className="text-xs text-gray-500">{k}: </span><span className="text-xs text-gray-300">{v}</span></div>
        ))}
      </div>
    );
  }

  if (target.type === 'notebook') {
    const entry = notebookEntries.find(n => n.id === target.id);
    if (!entry) return <p className="text-xs text-gray-600 p-3">Notebook entry not found.</p>;
    return (
      <div className="p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">{entry.title}</h2>
        <p className="text-xs text-gray-500">{entry.date}</p>
        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.content}</div>
      </div>
    );
  }

  if (target.type === 'question') {
    const q = questions.find(q => q.id === target.id);
    if (!q) return <p className="text-xs text-gray-600 p-3">Question not found.</p>;
    return (
      <div className="p-4 flex flex-col gap-3">
        <p className="text-base text-white font-medium leading-relaxed">{q.text}</p>
        <p className="text-xs text-gray-500">{q.category} · {q.questionStatus.replace('_', ' ')}</p>
        {q.answer && <div className="border-t border-[#0f3460] pt-2 text-sm text-gray-300">{q.answer}</div>}
      </div>
    );
  }

  return null;
}

export function ReferencePane() {
  const { splitRefTarget, splitRefPinned, setSplitRefTarget, setSplitRefPinned, setSplitScreen } = useAppStore();
  const [picking, setPicking] = useState(!splitRefTarget);

  return (
    <div className="w-[45%] min-w-[280px] flex flex-col border-l border-[#0f3460] bg-[#16213e] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#0f3460] shrink-0">
        <span className="text-xs text-gray-400 font-semibold flex-1">Reference</span>
        <button
          onClick={() => setSplitRefPinned(!splitRefPinned)}
          title={splitRefPinned ? 'Unpin reference pane' : 'Pin reference pane (stays when navigating)'}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${splitRefPinned ? 'bg-[#6b46c1] text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          📌
        </button>
        <button
          onClick={() => setPicking(!picking)}
          className="text-xs px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-[#2d3748] transition-colors"
        >
          {picking ? 'Cancel' : 'Change'}
        </button>
        <button
          onClick={() => setSplitScreen(false)}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors px-1"
          title="Close reference pane"
        >
          ✕
        </button>
      </div>

      {picking ? (
        <div className="flex-1 overflow-y-auto">
          <p className="text-xs text-gray-500 px-3 pt-2">Choose what to show as reference:</p>
          <RefPicker
            currentType={splitRefTarget?.type ?? 'scene'}
            onPick={(target) => { setSplitRefTarget(target); setPicking(false); }}
          />
        </div>
      ) : splitRefTarget ? (
        <div className="flex-1 overflow-y-auto">
          <RefContent target={splitRefTarget} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center p-4">
            <p className="text-sm">No reference selected.</p>
            <button onClick={() => setPicking(true)} className="text-xs text-purple-400 hover:text-purple-300 mt-2">
              Choose reference →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
