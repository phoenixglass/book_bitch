import { useEffect, useMemo, useState } from 'react';
import { findItem, useAppStore } from '../store/appStore';
import { useConnections, navigateToConnection, type Connection, type ConnectionType } from '../lib/connections';
import { stripHtml, countWords } from '../utils/textStats';
import type { QuestionCategory, TruthMirrorResult, TruthMirrorTargetType } from '../types';

// ── Object-type labels & field mapping ───────────────────────────────────────

const TARGET_LABELS: Record<TruthMirrorTargetType, string> = {
  scene: 'Scene',
  manuscript_assembly: 'Assembly',
  codex_entry: 'Codex Entry',
  research_item: 'Research Item',
  fragment: 'Fragment',
  omitted_material: 'Omitted Material',
};

type StringFieldKey = 'surfaceReading' | 'deeperReading' | 'centralWant' | 'actualWant' | 'refusalOrBlindSpot' | 'contradiction' | 'powerShift' | 'whatChanges' | 'suggestedRevisionPass';
type ListFieldKey = 'explanationVsDramatization' | 'unresolvedQuestions' | 'suggestedNextActions';

const DEFAULT_LABELS: Record<StringFieldKey | ListFieldKey, string> = {
  surfaceReading: 'Surface Reading',
  deeperReading: 'Deeper Reading',
  centralWant: 'What They Think They Want',
  actualWant: 'What They Actually Want',
  refusalOrBlindSpot: 'What They Refuse to Know',
  contradiction: 'Most Alive Contradiction',
  powerShift: 'Power Shift',
  whatChanges: 'What Changes',
  suggestedRevisionPass: 'Suggested Revision Pass',
  explanationVsDramatization: 'Explaining Instead of Dramatizing',
  unresolvedQuestions: 'Unresolved',
  suggestedNextActions: 'Examine Next',
};

const TYPE_LABEL_OVERRIDES: Partial<Record<TruthMirrorTargetType, Partial<Record<StringFieldKey | ListFieldKey, string>>>> = {
  manuscript_assembly: {
    surfaceReading: 'Pattern Across the Assembly',
    deeperReading: 'Emotional / Structural Progression',
    explanationVsDramatization: 'Redundant or Under-Integrated Scenes',
    unresolvedQuestions: 'Threads That Disappear / Gaps',
    suggestedNextActions: 'Scenes to Review First',
  },
  codex_entry: {
    surfaceReading: 'What This Entry Claims',
    deeperReading: 'What Pressure Would Reveal It',
    unresolvedQuestions: 'Where This Is Underdeveloped',
    suggestedNextActions: 'What Would Make This More Useful',
  },
  research_item: {
    surfaceReading: 'Concrete Details Worth Preserving',
    deeperReading: 'Fictional Uses for This Story',
    explanationVsDramatization: 'Info-Dump Risk',
    unresolvedQuestions: 'Questions This Raises',
    suggestedNextActions: 'Turn Exposition Into…',
  },
  fragment: {
    surfaceReading: 'What Is Alive Here',
    deeperReading: 'Problem It Might Solve / Create',
    suggestedNextActions: 'What Would Let It Re-Enter the Manuscript',
    unresolvedQuestions: 'Open Questions',
  },
  omitted_material: {
    surfaceReading: 'What Is Alive Here',
    deeperReading: 'Problem It Might Solve / Create',
    suggestedNextActions: 'What Would Let It Re-Enter the Manuscript',
    unresolvedQuestions: 'Open Questions',
  },
};

function labelFor(targetType: TruthMirrorTargetType, field: StringFieldKey | ListFieldKey): string {
  return TYPE_LABEL_OVERRIDES[targetType]?.[field] ?? DEFAULT_LABELS[field];
}

const REVISION_PRESSURE_LABEL_OVERRIDES: Partial<Record<TruthMirrorTargetType, string>> = {
  codex_entry: 'Revision Questions Raised',
};
function revisionPressureLabel(targetType: TruthMirrorTargetType): string {
  return REVISION_PRESSURE_LABEL_OVERRIDES[targetType] ?? 'Revision Pressure Points';
}

const STRING_FIELD_ORDER: StringFieldKey[] = [
  'surfaceReading', 'deeperReading', 'centralWant', 'actualWant',
  'refusalOrBlindSpot', 'contradiction', 'powerShift', 'whatChanges',
];
const LIST_FIELD_ORDER: ListFieldKey[] = ['explanationVsDramatization', 'unresolvedQuestions', 'suggestedNextActions'];

const QUESTION_CATEGORY_BY_TYPE: Record<TruthMirrorTargetType, QuestionCategory> = {
  scene: 'structure',
  manuscript_assembly: 'structure',
  codex_entry: 'character',
  research_item: 'research',
  fragment: 'structure',
  omitted_material: 'structure',
};

const MIN_WORDS_FOR_FULL_ANALYSIS = 30;

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// ── Subject builders ──────────────────────────────────────────────────────────

interface TruthMirrorSubject {
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  exists: boolean;
}

function useTruthMirrorSubject(targetType: TruthMirrorTargetType, targetId: string): TruthMirrorSubject {
  const store = useAppStore();
  return useMemo(() => {
    if (targetType === 'scene') {
      const item = findItem(store.binder, targetId);
      if (!item) return { title: 'Untitled scene', content: '', metadata: {}, exists: false };
      return {
        title: item.title || 'Untitled scene',
        content: stripHtml(item.content ?? ''),
        metadata: { synopsis: item.synopsis, notes: item.notes, status: item.status, ...item.sceneMetadata },
        exists: true,
      };
    }
    if (targetType === 'codex_entry') {
      const entry = store.codexEntries.find((c) => c.id === targetId);
      if (!entry) return { title: 'Untitled codex entry', content: '', metadata: {}, exists: false };
      return {
        title: entry.name || 'Untitled codex entry',
        content: stripHtml(entry.description ?? ''),
        metadata: {
          codexType: entry.codexType, aliases: entry.aliases, notes: entry.notes, role: entry.role, age: entry.age,
          pronouns: entry.pronouns, relationships: entry.relationships, physicalDetails: entry.physicalDetails,
          voiceNotes: entry.voiceNotes, arcNotes: entry.arcNotes, secrets: entry.secrets, contradictions: entry.contradictions,
          atmosphere: entry.atmosphere, meaning: entry.meaning, appearances: entry.appearances, evolution: entry.evolution,
          customFields: entry.customFields,
        },
        exists: true,
      };
    }
    if (targetType === 'research_item') {
      const entry = store.researchEntries.find((r) => r.id === targetId);
      if (!entry) return { title: 'Untitled research item', content: '', metadata: {}, exists: false };
      return {
        title: entry.title || 'Untitled research item',
        content: stripHtml(entry.content ?? ''),
        metadata: { researchType: entry.researchType, source: entry.source, notes: entry.notes, tags: entry.tags },
        exists: true,
      };
    }
    if (targetType === 'fragment') {
      const f = store.fragments.find((x) => x.id === targetId);
      if (!f) return { title: 'Untitled fragment', content: '', metadata: {}, exists: false };
      return {
        title: f.title || 'Untitled fragment',
        content: stripHtml(f.content ?? ''),
        metadata: {
          fragmentType: f.fragmentType, status: f.status, possiblePlacement: f.possiblePlacement, notes: f.notes,
          relatedCharacters: f.relatedCharacters, relatedPlaces: f.relatedPlaces, relatedThemes: f.relatedThemes, tags: f.tags,
        },
        exists: true,
      };
    }
    if (targetType === 'omitted_material') {
      const o = store.omittedMaterial.find((x) => x.id === targetId);
      if (!o) return { title: 'Untitled omitted material', content: '', metadata: {}, exists: false };
      return {
        title: o.title || 'Untitled omitted material',
        content: stripHtml(o.content ?? ''),
        metadata: {
          omissionStatus: o.omissionStatus, reason: o.reason, sourceSceneTitle: o.sourceSceneTitle, notes: o.notes,
          relatedCharacters: o.relatedCharacters, relatedThemes: o.relatedThemes, relatedLocations: o.relatedLocations, tags: o.tags,
        },
        exists: true,
      };
    }
    // manuscript_assembly
    const assembly = store.manuscriptAssemblies.find((a) => a.id === targetId);
    if (!assembly) return { title: 'Untitled assembly', content: '', metadata: {}, exists: false };
    return {
      title: assembly.title || 'Untitled assembly',
      content: '',
      metadata: { description: assembly.description, sourceMode: assembly.sourceMode, sceneCount: assembly.scenes.length },
      exists: true,
    };
  }, [targetType, targetId, store]);
}

interface AssemblySceneSummary {
  id: string;
  title: string;
  order: number;
  included: boolean;
  synopsis?: string;
  status?: string;
  wordCount: number;
  povCharacter?: string;
  plotline?: string;
}

function useAssemblySceneSummaries(targetType: TruthMirrorTargetType, targetId: string): AssemblySceneSummary[] {
  const store = useAppStore();
  return useMemo(() => {
    if (targetType !== 'manuscript_assembly') return [];
    const assembly = store.manuscriptAssemblies.find((a) => a.id === targetId);
    if (!assembly) return [];
    const out: AssemblySceneSummary[] = [];
    for (const s of [...assembly.scenes].sort((a, b) => a.order - b.order)) {
      const scene = findItem(store.binder, s.sceneId);
      if (!scene) continue; // ignore broken scene references rather than sending fake data
      out.push({
        id: scene.id,
        title: s.titleOverride?.trim() || scene.title || 'Untitled scene',
        order: s.order,
        included: s.included,
        synopsis: scene.synopsis?.slice(0, 300),
        status: scene.status,
        wordCount: countWords(scene.content ?? ''),
        povCharacter: scene.sceneMetadata?.povCharacter,
        plotline: scene.sceneMetadata?.plotline,
      });
    }
    return out;
  }, [targetType, targetId, store]);
}

function hasUsefulValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

// ── Related-object matching (no hallucinated links) ──────────────────────────

interface MatchedRef { text: string; match: Connection | null }

function matchRelatedObjects(strings: string[], candidates: Connection[]): MatchedRef[] {
  return strings.map((text) => {
    const lower = text.toLowerCase();
    const match = candidates.find((c) => c.title.trim().length > 2 && lower.includes(c.title.trim().toLowerCase()));
    return { text, match: match ?? null };
  });
}

// ── Notebook formatting ───────────────────────────────────────────────────────

function formatResultAsText(result: TruthMirrorResult, targetType: TruthMirrorTargetType): string {
  const lines: string[] = [];
  const section = (label: string, value: string) => { if (value.trim()) lines.push(`## ${label}`, value.trim(), ''); };
  const list = (label: string, items: string[]) => { if (items.length > 0) lines.push(`## ${label}`, ...items.map((i) => `- ${i}`), ''); };

  if (result.metadataOnly) lines.push('_Metadata-only analysis — limited source text was available._', '');
  for (const f of STRING_FIELD_ORDER) section(labelFor(targetType, f), result[f]);
  for (const f of LIST_FIELD_ORDER) list(labelFor(targetType, f), result[f]);
  list(revisionPressureLabel(targetType), result.revisionPressurePoints);
  list('Related Objects to Review', result.relatedObjectsToReview);
  section(labelFor(targetType, 'suggestedRevisionPass'), result.suggestedRevisionPass);
  return lines.join('\n').trim();
}

// ── Main component ────────────────────────────────────────────────────────────

interface TruthMirrorPanelProps {
  targetType: TruthMirrorTargetType;
  targetId: string;
}

export function TruthMirrorPanel({ targetType, targetId }: TruthMirrorPanelProps) {
  const store = useAppStore();
  const { aiSettings, storyBrief, revisionPasses, addNotebookEntry, addQuestion, addRevisionPass, addRevisionPassChecklistItem, updateRevisionPass, updateRevisionSceneState } = store;

  const subject = useTruthMirrorSubject(targetType, targetId);
  const assemblyScenes = useAssemblySceneSummaries(targetType, targetId);
  const isAssembly = targetType === 'manuscript_assembly';
  // Connections aren't tracked for assemblies — the assembly's own scene list stands in for them.
  const connections = useConnections(isAssembly ? 'scene' : (targetType as ConnectionType), isAssembly ? '' : targetId);

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => { if (!cancelled) setAiConfigured(!!d.configured); })
      .catch(() => { if (!cancelled) setAiConfigured(false); });
    return () => { cancelled = true; };
  }, []);

  const [runState, setRunState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<TruthMirrorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notebookSaved, setNotebookSaved] = useState(false);
  const [savedQuestionIdx, setSavedQuestionIdx] = useState<Set<number>>(new Set());
  const [sentPointIdx, setSentPointIdx] = useState<Set<number>>(new Set());
  const [selectedPassId, setSelectedPassId] = useState('');
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [createdPassTitle, setCreatedPassTitle] = useState<string | null>(null);

  // Reset all transient state when the target object changes (same render-time
  // key-comparison pattern AIPanel uses, avoiding an extra effect).
  const resetKey = `${targetType}:${targetId}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setRunState('idle');
    setResult(null);
    setError(null);
    setCopied(false);
    setNotebookSaved(false);
    setSavedQuestionIdx(new Set());
    setSentPointIdx(new Set());
    setSelectedPassId('');
    setSelectedSceneId('');
    setCreatedPassTitle(null);
  }

  const contentWordCount = subject.content ? subject.content.split(/\s+/).filter(Boolean).length : 0;
  const hasUsefulMetadata = Object.values(subject.metadata).some(hasUsefulValue);
  const hasSubstantialContent = isAssembly ? assemblyScenes.length > 0 : contentWordCount >= MIN_WORDS_FOR_FULL_ANALYSIS;
  const canRunAnything = isAssembly ? assemblyScenes.length > 0 : (hasSubstantialContent || hasUsefulMetadata);

  async function handleRun() {
    setRunState('loading');
    setError(null);
    setResult(null);
    try {
      const metadataOnly = isAssembly ? false : !hasSubstantialContent;
      const body: Record<string, unknown> = {
        targetType,
        targetTitle: subject.title,
        targetMetadata: subject.metadata,
        metadataOnly,
      };
      if (isAssembly) {
        body.assemblyScenes = assemblyScenes;
      } else {
        body.targetContent = subject.content.length > 60_000 ? subject.content.slice(0, 60_000) : subject.content;
        body.connections = connections.map((c) => ({ type: c.type, title: c.title, subtitle: c.subtitle }));
      }
      if (targetType === 'scene') {
        const passes = revisionPasses
          .filter((p) => !p.archivedAt && p.targetSceneIds.includes(targetId))
          .slice(0, 3)
          .map((p) => ({ title: p.title, focus: p.focus, description: p.description }));
        if (passes.length > 0) body.revisionPassContexts = passes;
      }
      if (storyBrief?.content) {
        body.storyContext = storyBrief.content.length > 20_000 ? storyBrief.content.slice(0, 20_000) : storyBrief.content;
      }

      const res = await fetch('/api/ai/truth-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `Server returned ${res.status}`;
        try { const e = JSON.parse(text) as { error?: string }; if (e.error) message = e.error; } catch { /* not JSON */ }
        throw new Error(message);
      }
      const data = (await res.json()) as TruthMirrorResult;
      setResult(data);
      setRunState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunState('error');
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(formatResultAsText(result, targetType)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable — silently ignore */ });
  }

  function handleSaveToNotebook() {
    if (!result) return;
    addNotebookEntry({
      title: `Truth Mirror: ${subject.title}`,
      content: formatResultAsText(result, targetType),
      tags: ['truth-mirror', targetType, slugify(subject.title)].filter(Boolean),
      relatedSceneIds: targetType === 'scene' ? [targetId] : [],
      relatedFragmentIds: targetType === 'fragment' ? [targetId] : [],
      relatedCodexIds: targetType === 'codex_entry' ? [targetId] : [],
      relatedQuestionIds: [],
    });
    setNotebookSaved(true);
  }

  function handleSaveQuestion(text: string, idx: number) {
    addQuestion({
      text,
      category: QUESTION_CATEGORY_BY_TYPE[targetType],
      priority: 'medium',
      questionStatus: 'open',
      relatedSceneIds: targetType === 'scene' ? [targetId] : [],
      relatedFragmentIds: targetType === 'fragment' ? [targetId] : [],
      relatedOmittedIds: targetType === 'omitted_material' ? [targetId] : [],
      relatedCodexIds: targetType === 'codex_entry' ? [targetId] : [],
      relatedNotebookIds: [],
      answer: '',
      notes: `From Truth Mirror analysis of "${subject.title}"`,
    });
    setSavedQuestionIdx((prev) => new Set(prev).add(idx));
  }

  const matchCandidates: Connection[] = isAssembly
    ? assemblyScenes.map((s) => ({ id: s.id, type: 'scene' as ConnectionType, title: s.title }))
    : connections;
  const matchedRelated = result ? matchRelatedObjects(result.relatedObjectsToReview, matchCandidates) : [];
  const matchedScenesForAssembly = matchedRelated
    .map((m) => m.match)
    .filter((c): c is Connection => !!c && c.type === 'scene');

  const activePasses = revisionPasses.filter((p) => !p.archivedAt);
  const canSendToPass = (targetType === 'scene' || (isAssembly && matchedScenesForAssembly.length > 0));

  function handleSendToPass(point: string, idx: number) {
    const sceneId = targetType === 'scene' ? targetId : selectedSceneId;
    if (!selectedPassId || !sceneId) return;
    const pass = revisionPasses.find((p) => p.id === selectedPassId);
    if (!pass) return;
    if (!pass.targetSceneIds.includes(sceneId)) {
      updateRevisionPass(pass.id, { targetSceneIds: [...pass.targetSceneIds, sceneId] });
    }
    const existingNotes = pass.sceneStates[sceneId]?.notes ?? '';
    const noteLine = isAssembly ? `[Truth Mirror — ${subject.title}] ${point}` : `[Truth Mirror] ${point}`;
    updateRevisionSceneState(pass.id, sceneId, { notes: [existingNotes, noteLine].filter(Boolean).join('\n\n') });
    setSentPointIdx((prev) => new Set(prev).add(idx));
  }

  function handleCreatePass() {
    if (!result) return;
    const passId = addRevisionPass({
      title: `Truth Mirror: ${subject.title}`,
      description: result.deeperReading || result.surfaceReading || '',
      focus: result.suggestedRevisionPass || 'Truth Mirror findings',
    });
    result.revisionPressurePoints.forEach((p) => addRevisionPassChecklistItem(passId, p));
    if (targetType === 'scene') {
      updateRevisionPass(passId, { targetSceneIds: [targetId] });
    } else if (isAssembly && matchedScenesForAssembly.length > 0) {
      updateRevisionPass(passId, { targetSceneIds: matchedScenesForAssembly.map((s) => s.id) });
    }
    setCreatedPassTitle(`Truth Mirror: ${subject.title}`);
  }

  if (!subject.exists) return null;

  return (
    <section className="border border-[#0f3460] rounded bg-[#111827]/40 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">🪞 Truth Mirror</span>
          <span className="text-[10px] text-purple-400 bg-purple-900/20 rounded px-1.5 py-0.5">{TARGET_LABELS[targetType]}</span>
        </div>
      </div>

      {aiConfigured === false && (
        <p className="text-[11px] text-amber-400">
          AI is not configured — add an <code className="text-amber-300">ANTHROPIC_API_KEY</code> to run Truth Mirror.
        </p>
      )}

      {aiConfigured && aiSettings.mode === 'disabled' && (
        <p className="text-[11px] text-gray-500">AI is disabled in project settings.</p>
      )}

      {aiConfigured && aiSettings.mode !== 'disabled' && (
        <>
          {!hasSubstantialContent && (
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              {isAssembly
                ? 'This assembly has no included scenes yet. Add scenes to the build before running Truth Mirror.'
                : `Not enough content to interrogate yet (${contentWordCount} word${contentWordCount === 1 ? '' : 's'}). Add more prose, a description, or notes first${hasUsefulMetadata ? ', or run a metadata-only reading below.' : '.'}`}
            </p>
          )}

          <button
            onClick={handleRun}
            disabled={runState === 'loading' || !canRunAnything}
            className={`self-start px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              runState === 'loading' || !canRunAnything
                ? 'bg-[#2d3748] text-gray-500 cursor-default'
                : 'bg-purple-700 text-white hover:bg-purple-600'
            }`}
          >
            {runState === 'loading'
              ? '⟳ Running…'
              : !hasSubstantialContent && hasUsefulMetadata
              ? 'Run Metadata-Only Analysis'
              : 'Run Truth Mirror'}
          </button>
        </>
      )}

      {runState === 'error' && error && (
        <div className="border border-red-800/40 rounded p-2 bg-red-900/10">
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {runState === 'done' && result && (
        <div className="flex flex-col gap-3 border-t border-[#0f3460] pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            {result.metadataOnly && (
              <span className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-1.5 py-0.5">metadata-only reading</span>
            )}
            {result.truncated && (
              <span className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-1.5 py-0.5">content truncated</span>
            )}
            <button onClick={handleCopy} className="text-[10px] px-2 py-0.5 rounded bg-[#2d3748] text-gray-300 hover:text-white transition-colors">
              {copied ? '✓ Copied' : 'Copy Result'}
            </button>
            <button
              onClick={handleSaveToNotebook}
              disabled={notebookSaved}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${notebookSaved ? 'bg-green-900/30 text-green-400 cursor-default' : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white'}`}
            >
              {notebookSaved ? '✓ Saved to Notebook' : 'Save to Notebook'}
            </button>
          </div>

          {STRING_FIELD_ORDER.map((f) => result[f]?.trim() ? (
            <div key={f}>
              <p className="text-[10px] text-gray-500 mb-0.5 font-semibold uppercase tracking-wider">{labelFor(targetType, f)}</p>
              <p className="text-xs text-gray-200 leading-relaxed">{result[f]}</p>
            </div>
          ) : null)}

          {LIST_FIELD_ORDER.map((f) => result[f].length > 0 ? (
            <div key={f}>
              <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wider">{labelFor(targetType, f)}</p>
              {f === 'unresolvedQuestions' ? (
                <div className="flex flex-col gap-1">
                  {result.unresolvedQuestions.map((q, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <p className="text-xs text-gray-300 flex-1">{q}</p>
                      <button
                        onClick={() => handleSaveQuestion(q, i)}
                        disabled={savedQuestionIdx.has(i)}
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] transition-colors ${savedQuestionIdx.has(i) ? 'bg-green-900/30 text-green-400 cursor-default' : 'bg-[#2d3748] text-gray-400 hover:text-white'}`}
                      >
                        {savedQuestionIdx.has(i) ? '✓' : '+ Q'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {result[f].map((item, i) => (
                    <li key={i} className="text-xs text-gray-300 flex gap-1">
                      <span className="text-purple-500 shrink-0">·</span>{item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null)}

          {result.revisionPressurePoints.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wider">{revisionPressureLabel(targetType)}</p>
              <ul className="flex flex-col gap-1 mb-2">
                {result.revisionPressurePoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <p className="text-xs text-gray-300 flex-1">{point}</p>
                    {canSendToPass && activePasses.length > 0 && (
                      <button
                        onClick={() => handleSendToPass(point, i)}
                        disabled={sentPointIdx.has(i) || !selectedPassId || (isAssembly && !selectedSceneId)}
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] transition-colors ${sentPointIdx.has(i) ? 'bg-green-900/30 text-green-400 cursor-default' : 'bg-[#2d3748] text-gray-400 hover:text-white disabled:opacity-40'}`}
                      >
                        {sentPointIdx.has(i) ? '✓' : '+ Pass'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {canSendToPass && activePasses.length > 0 && (
                <div className="flex gap-1 mb-2">
                  <select
                    value={selectedPassId}
                    onChange={(e) => setSelectedPassId(e.target.value)}
                    className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-1 text-[11px] text-gray-300 outline-none focus:border-[#6b46c1]"
                  >
                    <option value="">Choose revision pass…</option>
                    {activePasses.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  {isAssembly && (
                    <select
                      value={selectedSceneId}
                      onChange={(e) => setSelectedSceneId(e.target.value)}
                      className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1.5 py-1 text-[11px] text-gray-300 outline-none focus:border-[#6b46c1]"
                    >
                      <option value="">Choose matched scene…</option>
                      {matchedScenesForAssembly.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  )}
                </div>
              )}

              <button
                onClick={handleCreatePass}
                disabled={!!createdPassTitle}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${createdPassTitle ? 'bg-green-900/30 text-green-400 cursor-default' : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white'}`}
              >
                {createdPassTitle ? `✓ Created "${createdPassTitle}"` : '+ Create New Revision Pass from Result'}
              </button>
            </div>
          )}

          {result.relatedObjectsToReview.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wider">Related Objects to Review</p>
              <div className="flex flex-col gap-1">
                {matchedRelated.map(({ text, match }, i) => match ? (
                  <button
                    key={i}
                    onClick={() => navigateToConnection(store, match)}
                    className="text-left text-xs text-blue-300 bg-[#0f3460]/40 hover:bg-[#0f3460] rounded px-2 py-1 transition-colors"
                  >
                    {match.title}
                  </button>
                ) : (
                  <p key={i} className="text-xs text-gray-500 italic px-2 py-1">{text}</p>
                ))}
              </div>
            </div>
          )}

          {result.suggestedRevisionPass?.trim() && (
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5 font-semibold uppercase tracking-wider">{labelFor(targetType, 'suggestedRevisionPass')}</p>
              <p className="text-xs text-gray-200 leading-relaxed">{result.suggestedRevisionPass}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
