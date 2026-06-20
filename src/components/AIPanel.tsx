import { useState, useEffect, useCallback } from 'react';
import { useAppStore, findItem } from '../store/appStore';
import type {
  AIActionType,
  AIQuestionsOutput,
  AISummarizeOutput,
  AIMetadataOutput,
  AITagsOutput,
  AIOutput,
  QuestionCategory,
} from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html: string): number {
  return stripHTML(html).split(/\s+/).filter(Boolean).length;
}

// ── Available actions per AI mode ────────────────────────────────────────────

type ActionDef = { value: AIActionType; label: string; desc: string };

const ALL_ACTIONS: ActionDef[] = [
  { value: 'questions', label: 'Ask Me Questions', desc: 'Generate craft questions about this scene' },
  { value: 'summarize', label: 'Summarize', desc: 'Produce a concise summary with key details' },
  { value: 'metadata', label: 'Generate Metadata', desc: 'Suggest synopsis, POV, location, tone, tags' },
  { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
];

function availableActions(mode: string): ActionDef[] {
  if (mode === 'disabled') return [];
  if (mode === 'questions_only') return ALL_ACTIONS.filter((a) => a.value === 'questions');
  if (mode === 'analysis_only') return ALL_ACTIONS.filter((a) => ['questions', 'summarize'].includes(a.value));
  if (mode === 'summarization') return ALL_ACTIONS.filter((a) => ['questions', 'summarize'].includes(a.value));
  // metadata_assistance, continuity_checking, full
  return ALL_ACTIONS;
}

const QUESTION_CATEGORIES = [
  { value: 'any', label: 'Any category' },
  { value: 'structure', label: 'Structure' },
  { value: 'character', label: 'Character' },
  { value: 'emotional_logic', label: 'Emotional stakes' },
  { value: 'plot', label: 'Plot' },
  { value: 'continuity', label: 'Continuity' },
  { value: 'theme', label: 'Theme / Motif' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'worldbuilding', label: 'World building' },
  { value: 'other', label: 'Surprise me' },
];

// ── AI Status ─────────────────────────────────────────────────────────────────

interface AIStatusInfo {
  configured: boolean;
  provider?: string;
  model?: string;
}

// ── Sub-components for each result type ──────────────────────────────────────

function QuestionsResult({
  output,
  sourceId,
  sourceTitle,
}: {
  output: AIQuestionsOutput;
  sourceId?: string;
  sourceTitle: string;
}) {
  const { addQuestion } = useAppStore();
  const [saved, setSaved] = useState<Set<number>>(new Set());

  function handleSave(idx: number) {
    const q = output.questions[idx];
    addQuestion({
      text: q.text,
      category: q.category as QuestionCategory,
      priority: q.priority,
      questionStatus: 'open',
      relatedSceneIds: sourceId ? [sourceId] : [],
      relatedFragmentIds: [],
      relatedOmittedIds: [],
      relatedCodexIds: [],
      relatedNotebookIds: [],
      answer: '',
      notes: q.reason ? `AI reason: ${q.reason}` : '',
    });
    setSaved((prev) => new Set(prev).add(idx));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        {output.questions.length} question{output.questions.length !== 1 ? 's' : ''} about "{sourceTitle}"
        {output.truncated && (
          <span className="ml-1 text-amber-500">(content was truncated)</span>
        )}
      </p>
      {output.questions.map((q, i) => (
        <div key={i} className="border border-[#2d3748] rounded p-2 flex flex-col gap-1 bg-[#1a1a2e]">
          <p className="text-xs text-gray-200 leading-relaxed">{q.text}</p>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-purple-400 bg-purple-900/20 rounded px-1.5 py-0.5">
              {q.category.replace('_', ' ')}
            </span>
            <span className={`text-[10px] rounded px-1.5 py-0.5 ${
              q.priority === 'high' ? 'text-red-400 bg-red-900/20' :
              q.priority === 'medium' ? 'text-amber-400 bg-amber-900/20' :
              'text-gray-400 bg-gray-800'
            }`}>
              {q.priority}
            </span>
          </div>
          {q.reason && (
            <p className="text-[10px] text-gray-500 italic">{q.reason}</p>
          )}
          <button
            onClick={() => handleSave(i)}
            disabled={saved.has(i)}
            className={`self-start mt-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              saved.has(i)
                ? 'bg-green-900/40 text-green-400 cursor-default'
                : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white'
            }`}
          >
            {saved.has(i) ? '✓ Saved to Question Bank' : '+ Save to Question Bank'}
          </button>
        </div>
      ))}
    </div>
  );
}

function SummarizeResult({
  output,
  sourceId,
}: {
  output: AISummarizeOutput;
  sourceId?: string;
}) {
  const { updateItem, addQuestion } = useAppStore();
  const [synopsisSaved, setSynopsisSaved] = useState(false);
  const [questionsSaved, setQuestionsSaved] = useState<Set<number>>(new Set());

  function handleSaveSynopsis() {
    if (!sourceId) return;
    updateItem(sourceId, { synopsis: output.summary });
    setSynopsisSaved(true);
  }

  function handleSaveQuestion(text: string, idx: number) {
    addQuestion({
      text,
      category: 'plot',
      priority: 'medium',
      questionStatus: 'open',
      relatedSceneIds: sourceId ? [sourceId] : [],
      relatedFragmentIds: [],
      relatedOmittedIds: [],
      relatedCodexIds: [],
      relatedNotebookIds: [],
      answer: '',
      notes: '',
    });
    setQuestionsSaved((prev) => new Set(prev).add(idx));
  }

  return (
    <div className="flex flex-col gap-3">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Summary</p>
        <p className="text-xs text-gray-200 leading-relaxed">{output.summary}</p>
        {sourceId && (
          <button
            onClick={handleSaveSynopsis}
            disabled={synopsisSaved}
            className={`mt-2 px-2 py-0.5 rounded text-[11px] transition-colors ${
              synopsisSaved
                ? 'bg-green-900/40 text-green-400 cursor-default'
                : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white'
            }`}
          >
            {synopsisSaved ? '✓ Saved as Synopsis' : 'Save as Synopsis'}
          </button>
        )}
      </div>

      {output.bulletPoints.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Key Points</p>
          <ul className="flex flex-col gap-0.5">
            {output.bulletPoints.map((pt, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-1">
                <span className="text-purple-500 shrink-0">·</span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(output.characters.length > 0 || output.places.length > 0) && (
        <div className="flex gap-3 flex-wrap">
          {output.characters.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Characters</p>
              <p className="text-xs text-gray-300">{output.characters.join(', ')}</p>
            </div>
          )}
          {output.places.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Places</p>
              <p className="text-xs text-gray-300">{output.places.join(', ')}</p>
            </div>
          )}
        </div>
      )}

      {output.suggestedTags.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Suggested Tags</p>
          <div className="flex flex-wrap gap-1">
            {output.suggestedTags.map((t) => (
              <span key={t} className="text-[10px] bg-purple-900/20 text-purple-300 rounded px-1.5 py-0.5">
                #{t}
              </span>
            ))}
          </div>
        </div>
      )}

      {output.unansweredQuestions.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">
            Open Questions Raised
          </p>
          {output.unansweredQuestions.map((q, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1">
              <p className="text-xs text-gray-300 flex-1">{q}</p>
              <button
                onClick={() => handleSaveQuestion(q, i)}
                disabled={questionsSaved.has(i)}
                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  questionsSaved.has(i)
                    ? 'bg-green-900/30 text-green-400 cursor-default'
                    : 'bg-[#2d3748] text-gray-400 hover:text-white'
                }`}
              >
                {questionsSaved.has(i) ? '✓' : '+ Q'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const METADATA_DISPLAY_FIELDS: { key: keyof AIMetadataOutput; label: string; format?: 'list' | 'number' }[] = [
  { key: 'synopsis', label: 'Synopsis' },
  { key: 'povCharacter', label: 'POV Character' },
  { key: 'charactersPresent', label: 'Characters Present', format: 'list' },
  { key: 'location', label: 'Location' },
  { key: 'timelineDateClue', label: 'Timeline Clue' },
  { key: 'emotionalTemperature', label: 'Emotional Temperature', format: 'number' },
  { key: 'tensionLevel', label: 'Tension Level', format: 'number' },
  { key: 'themes', label: 'Themes', format: 'list' },
  { key: 'motifs', label: 'Motifs', format: 'list' },
  { key: 'sceneFunction', label: 'Scene Function' },
  { key: 'whatChanged', label: 'What Changed' },
  { key: 'unansweredQuestions', label: 'Unanswered Questions', format: 'list' },
  { key: 'suggestedTags', label: 'Suggested Tags', format: 'list' },
];

function MetadataResult({
  output,
  sourceId,
}: {
  output: AIMetadataOutput;
  sourceId?: string;
}) {
  const { updateItem, addQuestion, binder } = useAppStore();
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState(false);

  function toggleField(key: string) {
    setAccepted((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function acceptAll() {
    const all: Record<string, boolean> = {};
    METADATA_DISPLAY_FIELDS.forEach((f) => { all[f.key] = true; });
    setAccepted(all);
  }

  function rejectAll() {
    setAccepted({});
  }

  function applyAccepted() {
    if (!sourceId) return;

    const currentScene = findItem(binder, sourceId);
    const patch: Record<string, unknown> = {};
    const metaPatch: Record<string, unknown> = { ...(currentScene?.sceneMetadata ?? {}) };
    let hasMeta = false;

    // synopsis goes on the BinderItem itself, not in sceneMetadata
    if (accepted.synopsis) {
      patch.synopsis = output.synopsis;
    }

    // All other fields merge into sceneMetadata (preserving unaffected fields)
    if (accepted.povCharacter) { metaPatch.povCharacter = output.povCharacter; hasMeta = true; }
    if (accepted.charactersPresent) { metaPatch.charactersPresent = output.charactersPresent; hasMeta = true; }
    if (accepted.location) { metaPatch.location = output.location; hasMeta = true; }
    if (accepted.timelineDateClue) { metaPatch.timelineDateStart = output.timelineDateClue; hasMeta = true; }
    if (accepted.emotionalTemperature) { metaPatch.emotionalTemperature = output.emotionalTemperature; hasMeta = true; }
    if (accepted.tensionLevel) { metaPatch.tensionLevel = output.tensionLevel; hasMeta = true; }
    if (accepted.themes) { metaPatch.themes = output.themes; hasMeta = true; }
    if (accepted.motifs) { metaPatch.motifs = output.motifs; hasMeta = true; }
    if (accepted.sceneFunction) { metaPatch.sceneFunction = output.sceneFunction; hasMeta = true; }
    if (accepted.whatChanged) { metaPatch.whatChanged = output.whatChanged; hasMeta = true; }
    if (accepted.suggestedTags) { metaPatch.tags = output.suggestedTags; hasMeta = true; }

    if (hasMeta) {
      patch.sceneMetadata = metaPatch;
    }

    if (Object.keys(patch).length > 0) {
      updateItem(sourceId, patch as Parameters<typeof updateItem>[1]);
    }

    // Save unanswered questions if accepted
    if (accepted.unansweredQuestions) {
      output.unansweredQuestions.forEach((q) => {
        addQuestion({
          text: q,
          category: 'other',
          priority: 'medium',
          questionStatus: 'open',
          relatedSceneIds: sourceId ? [sourceId] : [],
          relatedFragmentIds: [],
          relatedOmittedIds: [],
          relatedCodexIds: [],
          relatedNotebookIds: [],
          answer: '',
          notes: 'From AI metadata analysis',
        });
      });
    }

    setApplied(true);
  }

  function renderValue(field: (typeof METADATA_DISPLAY_FIELDS)[0]) {
    const val = output[field.key];
    if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
      return <span className="text-gray-600 italic">— not detected</span>;
    }
    if (field.format === 'list' && Array.isArray(val)) {
      return <span className="text-gray-200">{(val as string[]).join(', ')}</span>;
    }
    if (field.format === 'number') {
      return <span className="text-gray-200">{val as number}/10</span>;
    }
    return <span className="text-gray-200">{String(val)}</span>;
  }

  const anyAccepted = Object.values(accepted).some(Boolean);

  return (
    <div className="flex flex-col gap-2">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}
      <p className="text-[11px] text-gray-500">
        Check the fields you want to apply, then click Apply Selected.
      </p>

      <div className="flex gap-1 mb-1">
        <button onClick={acceptAll} className="text-[10px] px-2 py-0.5 rounded bg-[#2d3748] text-gray-300 hover:text-white">
          Select All
        </button>
        <button onClick={rejectAll} className="text-[10px] px-2 py-0.5 rounded bg-[#2d3748] text-gray-300 hover:text-white">
          Clear
        </button>
      </div>

      <div className="flex flex-col gap-1 max-h-[380px] overflow-y-auto pr-1">
        {METADATA_DISPLAY_FIELDS.map((f) => {
          const val = output[f.key];
          const isEmpty =
            val === undefined || val === null || val === '' ||
            (Array.isArray(val) && val.length === 0);

          return (
            <label
              key={f.key}
              className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                accepted[f.key]
                  ? 'bg-purple-900/20 border border-purple-800/40'
                  : 'border border-transparent hover:border-[#2d3748]'
              } ${isEmpty ? 'opacity-40 cursor-default' : ''}`}
            >
              <input
                type="checkbox"
                checked={!!accepted[f.key]}
                onChange={() => !isEmpty && toggleField(f.key)}
                disabled={isEmpty}
                className="accent-purple-500 mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500">{f.label}</p>
                <div className="text-xs mt-0.5 leading-relaxed break-words">{renderValue(f)}</div>
              </div>
            </label>
          );
        })}
      </div>

      {sourceId && (
        <button
          onClick={applyAccepted}
          disabled={!anyAccepted || applied}
          className={`mt-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            applied
              ? 'bg-green-900/40 text-green-400 cursor-default'
              : anyAccepted
              ? 'bg-purple-700 text-white hover:bg-purple-600'
              : 'bg-[#2d3748] text-gray-500 cursor-default'
          }`}
        >
          {applied ? '✓ Applied to Scene' : `Apply Selected (${Object.values(accepted).filter(Boolean).length})`}
        </button>
      )}
    </div>
  );
}

function TagsResult({
  output,
  sourceId,
}: {
  output: AITagsOutput;
  sourceId?: string;
}) {
  const { updateItem, getOrCreateTag, binder } = useAppStore();
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const scene = sourceId ? findItem(binder, sourceId) : null;
  const currentTags = scene?.sceneMetadata?.tags ?? [];

  function applyTag(tagName: string) {
    if (!sourceId) return;
    const trimmed = tagName.trim().toLowerCase();
    if (currentTags.includes(trimmed)) return;
    getOrCreateTag(trimmed);
    const newTags = [...currentTags, trimmed];
    updateItem(sourceId, {
      sceneMetadata: {
        ...(scene?.sceneMetadata ?? {}),
        tags: newTags,
      },
    });
    setApplied((prev) => new Set(prev).add(trimmed));
  }

  const hasAny = output.existingMatches.length > 0 || output.newSuggestions.length > 0;

  if (!hasAny) {
    return <p className="text-xs text-gray-500 italic">No tag suggestions generated.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}

      {output.existingMatches.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Existing Tags</p>
          <div className="flex flex-wrap gap-1">
            {output.existingMatches.map((tag) => {
              const isApplied = applied.has(tag) || currentTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => applyTag(tag)}
                  disabled={isApplied || !sourceId}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    isApplied
                      ? 'bg-green-900/30 text-green-400 cursor-default'
                      : 'bg-purple-900/30 text-purple-300 hover:bg-purple-800/40'
                  }`}
                >
                  {isApplied ? '✓ ' : '+ '}#{tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {output.newSuggestions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">New Tag Suggestions</p>
          <div className="flex flex-wrap gap-1">
            {output.newSuggestions.map((tag) => {
              const normalized = tag.trim().toLowerCase();
              const isApplied = applied.has(normalized);
              return (
                <button
                  key={tag}
                  onClick={() => applyTag(normalized)}
                  disabled={isApplied || !sourceId}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    isApplied
                      ? 'bg-green-900/30 text-green-400 cursor-default'
                      : 'bg-[#2d3748] text-gray-300 hover:text-white hover:bg-[#3d4a5f]'
                  }`}
                >
                  {isApplied ? '✓ ' : '+ '}#{normalized}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!sourceId && (
        <p className="text-[11px] text-gray-500 italic">
          No scene selected — tags cannot be applied automatically.
        </p>
      )}
    </div>
  );
}

// ── Main AI Panel ─────────────────────────────────────────────────────────────

export function AIPanel() {
  const {
    aiSettings,
    setAISettings,
    aiPanelOpen,
    setAIPanelOpen,
    selectedId,
    binder,
    projectTags,
  } = useAppStore();

  const [aiStatus, setAIStatus] = useState<AIStatusInfo | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [action, setAction] = useState<AIActionType>('questions');
  const [category, setCategory] = useState('any');
  const [runState, setRunState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<AIOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const selectedItem = selectedId ? findItem(binder, selectedId) : null;
  const isDocument = selectedItem?.type === 'document';

  const actions = availableActions(aiSettings.mode);

  // Ensure current action is valid for current mode
  useEffect(() => {
    if (actions.length > 0 && !actions.find((a) => a.value === action)) {
      setAction(actions[0].value);
    }
  }, [aiSettings.mode, action, actions]);

  // Reset result when action or selected scene changes
  useEffect(() => {
    setResult(null);
    setError(null);
    setRunState('idle');
  }, [action, selectedId]);

  const checkAIStatus = useCallback(() => {
    setStatusLoading(true);
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((d: AIStatusInfo) => {
        setAIStatus(d);
        setStatusLoading(false);
      })
      .catch(() => {
        setAIStatus({ configured: false });
        setStatusLoading(false);
      });
  }, []);

  useEffect(() => {
    if (aiPanelOpen) checkAIStatus();
  }, [aiPanelOpen, checkAIStatus]);

  async function handleRun() {
    if (!selectedItem || !aiStatus?.configured || aiSettings.mode === 'disabled') return;

    const content = selectedItem.content;
    const wc = wordCount(content);

    if (wc < 5) {
      setError('This scene has too little content to analyse. Add some text first.');
      setRunState('error');
      return;
    }

    setRunState('loading');
    setError(null);
    setResult(null);

    try {
      const endpoint = `/api/ai/${action}`;
      const body: Record<string, unknown> = {
        title: selectedItem.title,
        content,
        synopsis: selectedItem.synopsis || undefined,
        mode: aiSettings.mode,
        allowDrafting: aiSettings.allowDrafting,
      };

      if (action === 'questions' && category !== 'any') {
        body.category = category;
      }

      if (action === 'summarize') {
        body.objectType = 'scene';
      }

      if (action === 'tags') {
        body.objectType = 'scene';
        body.allProjectTags = projectTags.map((t) => t.name);
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        throw new Error((data.error as string) || `Server returned ${res.status}`);
      }

      // Tag the output with its type
      const output = { ...data, type: action } as AIOutput;
      setResult(output);
      setRunState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunState('error');
    }
  }

  if (!aiPanelOpen) return null;

  const canRun =
    aiStatus?.configured &&
    aiSettings.mode !== 'disabled' &&
    isDocument &&
    runState !== 'loading' &&
    privacyAcknowledged;

  return (
    <div className="w-80 shrink-0 flex flex-col bg-[#16213e] border-l border-[#0f3460] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#0f3460] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">AI Assistant</span>
          {statusLoading ? (
            <span className="text-[10px] text-gray-500">checking…</span>
          ) : aiStatus?.configured ? (
            <span className="text-[10px] text-green-400 bg-green-900/20 rounded px-1.5 py-0.5">
              {aiStatus.provider} / {aiStatus.model?.replace('claude-', '').replace('-20251001', '')}
            </span>
          ) : (
            <span className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-1.5 py-0.5">
              not configured
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="AI Settings"
            className="text-gray-500 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-[#2d3748] transition-colors"
          >
            ⚙
          </button>
          <button
            onClick={() => setAIPanelOpen(false)}
            className="text-gray-500 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-[#2d3748] transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-3">

          {/* Inline AI mode settings */}
          {showSettings && (
            <div className="bg-[#1a1a3e] border border-[#0f3460] rounded p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400 font-semibold">AI Mode</p>
                <button onClick={() => setShowSettings(false)} className="text-gray-600 hover:text-gray-300 text-xs">✕</button>
              </div>
              {[
                { value: 'disabled', label: 'Disabled' },
                { value: 'questions_only', label: 'Questions Only' },
                { value: 'analysis_only', label: 'Analysis Only' },
                { value: 'metadata_assistance', label: 'Metadata Assistance' },
                { value: 'summarization', label: 'Summarization' },
                { value: 'full', label: 'Full' },
              ].map((m) => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ai-mode-panel"
                    value={m.value}
                    checked={aiSettings.mode === m.value}
                    onChange={() => setAISettings({ mode: m.value as typeof aiSettings.mode })}
                    className="accent-purple-500"
                  />
                  <span className="text-xs text-gray-300">{m.label}</span>
                </label>
              ))}
              {aiSettings.mode === 'full' && (
                <label className="flex items-center gap-2 mt-1 cursor-pointer border border-amber-700/40 rounded p-1.5 bg-amber-900/10">
                  <input
                    type="checkbox"
                    checked={aiSettings.allowDrafting}
                    onChange={(e) => setAISettings({ allowDrafting: e.target.checked })}
                    className="accent-purple-500"
                  />
                  <span className="text-xs text-amber-300">Allow prose drafting</span>
                </label>
              )}
            </div>
          )}

          {/* Not configured notice */}
          {!statusLoading && !aiStatus?.configured && (
            <div className="border border-amber-700/40 rounded p-3 bg-amber-900/10">
              <p className="text-xs text-amber-300 font-semibold mb-1">AI not configured</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Add an <code className="text-amber-400">ANTHROPIC_API_KEY</code> (or{' '}
                <code className="text-amber-400">OPENAI_API_KEY</code>) to your server environment,
                then restart the server.
              </p>
              <button
                onClick={checkAIStatus}
                className="mt-2 text-[11px] text-gray-400 hover:text-white underline"
              >
                Re-check status
              </button>
            </div>
          )}

          {/* AI disabled in settings */}
          {aiStatus?.configured && aiSettings.mode === 'disabled' && (
            <div className="border border-[#2d3748] rounded p-3 bg-[#1a1a2e]">
              <p className="text-xs text-gray-400">
                AI is disabled in project settings.{' '}
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  Enable it above.
                </button>
              </p>
            </div>
          )}

          {/* No scene selected */}
          {aiStatus?.configured && aiSettings.mode !== 'disabled' && !isDocument && (
            <div className="border border-[#2d3748] rounded p-3 bg-[#1a1a2e]">
              <p className="text-xs text-gray-400">
                Select a scene in the binder to use AI assistance.
              </p>
            </div>
          )}

          {/* Main controls */}
          {aiStatus?.configured && aiSettings.mode !== 'disabled' && isDocument && (
            <>
              {/* Current scene scope */}
              <div className="border border-[#2d3748] rounded p-2 bg-[#1a1a2e]">
                <p className="text-[10px] text-gray-500 mb-0.5">Analysing</p>
                <p className="text-xs text-gray-200 font-medium truncate">{selectedItem.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {wordCount(selectedItem.content).toLocaleString()} words · scene
                </p>
              </div>

              {/* Privacy notice */}
              {!privacyAcknowledged && (
                <div className="border border-blue-800/40 rounded p-2 bg-blue-900/10">
                  <p className="text-[11px] text-gray-300 leading-relaxed mb-2">
                    This action will send the selected scene text to{' '}
                    <strong className="text-white">{aiStatus.provider}</strong> for analysis.
                    Text is not stored by the app after the request.
                  </p>
                  <button
                    onClick={() => setPrivacyAcknowledged(true)}
                    className="text-[11px] px-3 py-1 rounded bg-blue-900/40 text-blue-300 hover:bg-blue-800/40 hover:text-white transition-colors"
                  >
                    I understand — continue
                  </button>
                </div>
              )}

              {privacyAcknowledged && (
                <>
                  {/* Action picker */}
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Action</p>
                    <div className="flex flex-col gap-1">
                      {actions.map((a) => (
                        <label key={a.value} className="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name="ai-action"
                            value={a.value}
                            checked={action === a.value}
                            onChange={() => setAction(a.value)}
                            className="accent-purple-500 mt-0.5 shrink-0"
                          />
                          <div>
                            <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                              {a.label}
                            </span>
                            <p className="text-[10px] text-gray-500">{a.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Category picker for questions */}
                  {action === 'questions' && (
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">
                        Question Focus
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] transition-colors"
                      >
                        {QUESTION_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* No-drafting indicator */}
                  {aiSettings.mode !== 'full' && (
                    <p className="text-[10px] text-gray-600">
                      ⊘ Prose drafting disabled — AI outputs analytical content only
                    </p>
                  )}

                  {/* Run button */}
                  <button
                    onClick={handleRun}
                    disabled={!canRun}
                    className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                      canRun
                        ? 'bg-purple-700 text-white hover:bg-purple-600'
                        : 'bg-[#2d3748] text-gray-500 cursor-default'
                    }`}
                  >
                    {runState === 'loading' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin text-base">⟳</span> Running…
                      </span>
                    ) : (
                      <>Run: {actions.find((a) => a.value === action)?.label ?? action}</>
                    )}
                  </button>
                </>
              )}
            </>
          )}

          {/* Error state */}
          {runState === 'error' && error && (
            <div className="border border-red-800/40 rounded p-3 bg-red-900/10">
              <p className="text-xs text-red-400 font-semibold mb-1">Error</p>
              <p className="text-[11px] text-gray-300 leading-relaxed">{error}</p>
              <button
                onClick={() => { setRunState('idle'); setError(null); }}
                className="mt-2 text-[11px] text-gray-400 hover:text-white underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Results */}
          {runState === 'done' && result && (
            <div className="border-t border-[#0f3460] pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                  Results
                </p>
                <button
                  onClick={() => { setResult(null); setRunState('idle'); }}
                  className="text-[10px] text-gray-500 hover:text-gray-300"
                >
                  Clear
                </button>
              </div>

              {result.type === 'questions' && (
                <QuestionsResult
                  output={result as AIQuestionsOutput}
                  sourceId={selectedId ?? undefined}
                  sourceTitle={selectedItem?.title ?? 'Scene'}
                />
              )}
              {result.type === 'summarize' && (
                <SummarizeResult
                  output={result as AISummarizeOutput}
                  sourceId={selectedId ?? undefined}
                />
              )}
              {result.type === 'metadata' && (
                <MetadataResult
                  output={result as AIMetadataOutput}
                  sourceId={selectedId ?? undefined}
                />
              )}
              {result.type === 'tags' && (
                <TagsResult
                  output={result as AITagsOutput}
                  sourceId={selectedId ?? undefined}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
