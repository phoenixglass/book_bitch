import { useState, useEffect, useCallback } from 'react';
import { useAppStore, findItem, totalWordCount } from '../store/appStore';
import type {
  AIActionType,
  AIObjectType,
  AIQuestionsOutput,
  AISummarizeOutput,
  AIMetadataOutput,
  AITagsOutput,
  AIPlacementOutput,
  AICodexSuggestOutput,
  AIExtractQuestionsOutput,
  AIRefineQuestionOutput,
  AIPlotlineOutput,
  AIOutput,
  QuestionCategory,
  SelectedAIContext,
  BinderItem,
} from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripHTML(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ')
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

function collectManuscriptScenes(items: BinderItem[]): Array<{ id: string; title: string; text: string }> {
  const result: Array<{ id: string; title: string; text: string }> = [];
  for (const item of items) {
    if (item.id === 'trash') continue;
    if (item.type === 'document' && item.content) {
      const text = stripHTML(item.content);
      if (text.trim()) result.push({ id: item.id, title: item.title, text });
    }
    if (item.children?.length) result.push(...collectManuscriptScenes(item.children));
  }
  return result;
}

// ── Object type labels ────────────────────────────────────────────────────────

const OBJECT_TYPE_LABELS: Record<AIObjectType, string> = {
  scene: 'Scene',
  fragment: 'Fragment',
  omitted_material: 'Omitted Material',
  notebook_entry: 'Notebook Entry',
  codex_entry: 'Codex Entry',
  question: 'Project Question',
  moodboard_item: 'Moodboard Item',
  research_item: 'Research Entry',
};

// ── Action definitions per object type ───────────────────────────────────────

type ActionDef = { value: AIActionType; label: string; desc: string };

const ACTIONS_BY_TYPE: Record<AIObjectType, ActionDef[]> = {
  scene: [
    { value: 'questions', label: 'Ask Me Questions', desc: 'Generate craft questions about this scene' },
    { value: 'summarize', label: 'Summarize Scene', desc: 'Produce a concise summary with key details' },
    { value: 'metadata', label: 'Generate Metadata', desc: 'Suggest synopsis, POV, location, tone, tags' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
    { value: 'plotline', label: 'Suggest Plotline', desc: 'Suggest which plotline or thread this scene belongs to' },
  ],
  fragment: [
    { value: 'questions', label: 'Ask Me Questions', desc: 'Generate craft questions about this fragment' },
    { value: 'summarize', label: 'Summarize Fragment', desc: 'Produce a concise summary of this fragment' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
    { value: 'placement', label: 'Find Possible Use', desc: 'Suggest where this fragment might fit in the manuscript' },
  ],
  omitted_material: [
    { value: 'questions', label: 'Ask Me Questions', desc: 'Generate craft questions about this omitted material' },
    { value: 'summarize', label: 'Summarize', desc: 'Produce a concise summary of this omitted material' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
    { value: 'placement', label: 'Restoration Analysis', desc: 'Analyse why this material may matter structurally' },
  ],
  notebook_entry: [
    { value: 'summarize', label: 'Summarize Note', desc: 'Produce a concise summary of this notebook entry' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
    { value: 'extract-questions', label: 'Extract Questions', desc: 'Pull out open questions from this note' },
  ],
  codex_entry: [
    { value: 'questions', label: 'Ask Me Questions', desc: 'Generate craft questions about this codex entry' },
    { value: 'summarize', label: 'Summarize Entry', desc: 'Produce a concise summary of this codex entry' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
    { value: 'codex-suggest', label: 'Suggest Missing Fields', desc: 'Identify missing or incomplete information in this entry' },
  ],
  question: [
    { value: 'refine-question', label: 'Refine Question', desc: 'Sharpen the wording and suggest category/priority' },
    { value: 'summarize', label: 'Summarize Notes', desc: 'Produce a concise summary of this question\'s notes and answer' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
  ],
  moodboard_item: [
    { value: 'summarize', label: 'Summarize Description', desc: 'Produce a concise summary of this item\'s description and notes' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
  ],
  research_item: [
    { value: 'summarize', label: 'Summarize Research', desc: 'Produce a concise summary of this research entry' },
    { value: 'tags', label: 'Suggest Tags', desc: 'Recommend tags for organisation' },
    { value: 'questions', label: 'Generate Research Questions', desc: 'Generate questions connecting this research to your specific story' },
  ],
};

function availableActionsForType(objectType: AIObjectType, mode: string): ActionDef[] {
  if (mode === 'disabled') return [];
  const all = ACTIONS_BY_TYPE[objectType] ?? [];
  if (mode === 'questions_only') return all.filter((a) => a.value === 'questions' || a.value === 'refine-question' || a.value === 'extract-questions');
  if (mode === 'analysis_only' || mode === 'summarization') return all.filter((a) => ['questions', 'summarize', 'refine-question', 'extract-questions'].includes(a.value));
  // metadata_assistance, continuity_checking, full
  return all;
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

// ── Context builder ───────────────────────────────────────────────────────────

function useAIContext(): SelectedAIContext | null {
  const {
    area,
    selectedId,
    binder,
    aiContextObject,
    fragments,
    omittedMaterial,
    notebookEntries,
    codexEntries,
    questions,
    moodboardItems,
    researchEntries,
  } = useAppStore();

  if (area === 'manuscript' && selectedId) {
    const item = findItem(binder, selectedId);
    if (item?.type === 'document') {
      return {
        objectType: 'scene',
        objectId: item.id,
        title: item.title,
        content: item.content,
        notes: item.notes,
        tags: item.sceneMetadata?.tags,
        metadata: item.sceneMetadata as Record<string, unknown>,
        area,
      };
    }
    return null;
  }

  if (!aiContextObject) return null;

  const { type, id } = aiContextObject;

  if (type === 'fragment') {
    const f = fragments.find((x) => x.id === id);
    if (!f) return null;
    return {
      objectType: 'fragment',
      objectId: f.id,
      title: f.title,
      content: f.content,
      notes: f.notes,
      tags: f.tags,
      metadata: {
        fragmentType: f.fragmentType,
        status: f.status,
        possiblePlacement: f.possiblePlacement,
        relatedCharacters: f.relatedCharacters,
        relatedPlaces: f.relatedPlaces,
        relatedThemes: f.relatedThemes,
      },
      area,
    };
  }

  if (type === 'omitted_material') {
    const o = omittedMaterial.find((x) => x.id === id);
    if (!o) return null;
    return {
      objectType: 'omitted_material',
      objectId: o.id,
      title: o.title,
      content: o.content,
      notes: o.notes,
      tags: o.tags,
      metadata: {
        omissionStatus: o.omissionStatus,
        reason: o.reason,
        sourceSceneTitle: o.sourceSceneTitle,
        relatedCharacters: o.relatedCharacters,
        relatedThemes: o.relatedThemes,
      },
      area,
    };
  }

  if (type === 'notebook_entry') {
    const n = notebookEntries.find((x) => x.id === id);
    if (!n) return null;
    return {
      objectType: 'notebook_entry',
      objectId: n.id,
      title: n.title,
      content: n.content,
      tags: n.tags,
      area,
    };
  }

  if (type === 'codex_entry') {
    const c = codexEntries.find((x) => x.id === id);
    if (!c) return null;
    return {
      objectType: 'codex_entry',
      objectId: c.id,
      title: c.name,
      content: c.description,
      notes: c.notes,
      tags: c.tags,
      metadata: {
        codexType: c.codexType,
        aliases: c.aliases,
        role: c.role,
        age: c.age,
        pronouns: c.pronouns,
        relationships: c.relationships,
        physicalDetails: c.physicalDetails,
        voiceNotes: c.voiceNotes,
        arcNotes: c.arcNotes,
        secrets: c.secrets,
        contradictions: c.contradictions,
        atmosphere: c.atmosphere,
        meaning: c.meaning,
        appearances: c.appearances,
        evolution: c.evolution,
        customFields: c.customFields,
      },
      area,
    };
  }

  if (type === 'question') {
    const q = questions.find((x) => x.id === id);
    if (!q) return null;
    const combined = [q.text, q.notes, q.answer].filter(Boolean).join('\n\n');
    return {
      objectType: 'question',
      objectId: q.id,
      title: q.text.slice(0, 80) + (q.text.length > 80 ? '…' : ''),
      content: combined,
      notes: q.notes,
      tags: [],
      metadata: {
        category: q.category,
        priority: q.priority,
        questionStatus: q.questionStatus,
        answer: q.answer,
      },
      area,
    };
  }

  if (type === 'moodboard_item') {
    const m = moodboardItems.find((x) => x.id === id);
    if (!m) return null;
    const combined = [m.description, m.notes].filter(Boolean).join('\n\n');
    return {
      objectType: 'moodboard_item',
      objectId: m.id,
      title: m.title,
      content: combined,
      notes: m.notes,
      tags: m.tags,
      area,
    };
  }

  if (type === 'research_item') {
    const r = researchEntries.find((x) => x.id === id);
    if (!r) return null;
    return {
      objectType: 'research_item',
      objectId: r.id,
      title: r.title,
      content: r.content,
      notes: r.notes,
      tags: r.tags,
      metadata: {
        researchType: r.researchType,
        source: r.source,
      },
      area,
    };
  }

  return null;
}

// ── Result components ─────────────────────────────────────────────────────────

function QuestionsResult({
  output,
  ctx,
}: {
  output: AIQuestionsOutput;
  ctx: SelectedAIContext;
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
      relatedSceneIds: ctx.objectType === 'scene' ? [ctx.objectId] : [],
      relatedFragmentIds: ctx.objectType === 'fragment' ? [ctx.objectId] : [],
      relatedOmittedIds: ctx.objectType === 'omitted_material' ? [ctx.objectId] : [],
      relatedCodexIds: ctx.objectType === 'codex_entry' ? [ctx.objectId] : [],
      relatedNotebookIds: ctx.objectType === 'notebook_entry' ? [ctx.objectId] : [],
      answer: '',
      notes: q.reason ? `AI reason: ${q.reason}` : '',
    });
    setSaved((prev) => new Set(prev).add(idx));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        {output.questions.length} question{output.questions.length !== 1 ? 's' : ''} about "{ctx.title}"
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
  ctx,
}: {
  output: AISummarizeOutput;
  ctx: SelectedAIContext;
}) {
  const { updateItem, updateFragment, updateOmittedMaterial, updateCodexEntry, updateQuestion, updateMoodboardItem, updateResearchEntry, addNotebookEntry, addQuestion } = useAppStore();
  const [summarySaved, setSummarySaved] = useState(false);
  const [questionsSaved, setQuestionsSaved] = useState<Set<number>>(new Set());

  function handleSaveSummary() {
    const summary = output.summary;
    switch (ctx.objectType) {
      case 'scene':
        updateItem(ctx.objectId, { synopsis: summary });
        break;
      case 'fragment':
        updateFragment(ctx.objectId, { notes: summary });
        break;
      case 'omitted_material':
        updateOmittedMaterial(ctx.objectId, { notes: summary });
        break;
      case 'notebook_entry':
        addNotebookEntry({ title: `Summary: ${ctx.title}`, content: summary, tags: [] });
        break;
      case 'codex_entry':
        updateCodexEntry(ctx.objectId, { notes: summary });
        break;
      case 'question':
        updateQuestion(ctx.objectId, { notes: summary });
        break;
      case 'moodboard_item':
        updateMoodboardItem(ctx.objectId, { notes: summary });
        break;
      case 'research_item':
        updateResearchEntry(ctx.objectId, { notes: summary });
        break;
    }
    setSummarySaved(true);
  }

  const saveLabel = ctx.objectType === 'scene'
    ? 'Save as Synopsis'
    : ctx.objectType === 'notebook_entry'
    ? 'Save as New Notebook Entry'
    : ctx.objectType === 'question'
    ? 'Save to Question Notes'
    : 'Save to Notes';

  const savedLabel = ctx.objectType === 'scene'
    ? '✓ Saved as Synopsis'
    : ctx.objectType === 'notebook_entry'
    ? '✓ Saved as New Entry'
    : '✓ Saved to Notes';

  function handleSaveQuestion(text: string, idx: number) {
    addQuestion({
      text,
      category: 'plot',
      priority: 'medium',
      questionStatus: 'open',
      relatedSceneIds: ctx.objectType === 'scene' ? [ctx.objectId] : [],
      relatedFragmentIds: ctx.objectType === 'fragment' ? [ctx.objectId] : [],
      relatedOmittedIds: ctx.objectType === 'omitted_material' ? [ctx.objectId] : [],
      relatedCodexIds: ctx.objectType === 'codex_entry' ? [ctx.objectId] : [],
      relatedNotebookIds: ctx.objectType === 'notebook_entry' ? [ctx.objectId] : [],
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
        <button
          onClick={handleSaveSummary}
          disabled={summarySaved}
          className={`mt-2 px-2 py-0.5 rounded text-[11px] transition-colors ${
            summarySaved
              ? 'bg-green-900/40 text-green-400 cursor-default'
              : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white'
          }`}
        >
          {summarySaved ? savedLabel : saveLabel}
        </button>
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
  { key: 'location', label: 'Location (specific)' },
  { key: 'timelineDateClue', label: 'Timeline Clue' },
  { key: 'timelineSpecificDate', label: 'Specific Date' },
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
  ctx,
}: {
  output: AIMetadataOutput;
  ctx: SelectedAIContext;
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
    const currentScene = findItem(binder, ctx.objectId);
    const patch: Record<string, unknown> = {};
    const metaPatch: Record<string, unknown> = { ...(currentScene?.sceneMetadata ?? {}) };
    let hasMeta = false;

    if (accepted.synopsis) patch.synopsis = output.synopsis;
    if (accepted.povCharacter) { metaPatch.povCharacter = output.povCharacter; hasMeta = true; }
    if (accepted.charactersPresent) { metaPatch.charactersPresent = output.charactersPresent; hasMeta = true; }
    if (accepted.location) { metaPatch.location = output.location; hasMeta = true; }
    if (accepted.timelineDateClue) { metaPatch.timelineDateStart = output.timelineDateClue; hasMeta = true; }
    if (accepted.timelineSpecificDate) { metaPatch.timelineSpecificDate = output.timelineSpecificDate; hasMeta = true; }
    if (accepted.emotionalTemperature) { metaPatch.emotionalTemperature = output.emotionalTemperature; hasMeta = true; }
    if (accepted.tensionLevel) { metaPatch.tensionLevel = output.tensionLevel; hasMeta = true; }
    if (accepted.themes) { metaPatch.themes = output.themes; hasMeta = true; }
    if (accepted.motifs) { metaPatch.motifs = output.motifs; hasMeta = true; }
    if (accepted.sceneFunction) { metaPatch.sceneFunction = output.sceneFunction; hasMeta = true; }
    if (accepted.whatChanged) { metaPatch.whatChanged = output.whatChanged; hasMeta = true; }
    if (accepted.suggestedTags) { metaPatch.tags = output.suggestedTags; hasMeta = true; }
    if (hasMeta) patch.sceneMetadata = metaPatch;

    if (Object.keys(patch).length > 0) {
      updateItem(ctx.objectId, patch as Parameters<typeof updateItem>[1]);
    }

    if (accepted.unansweredQuestions) {
      output.unansweredQuestions.forEach((q) => {
        addQuestion({
          text: q,
          category: 'other',
          priority: 'medium',
          questionStatus: 'open',
          relatedSceneIds: [ctx.objectId],
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
    </div>
  );
}

function TagsResult({
  output,
  ctx,
}: {
  output: AITagsOutput;
  ctx: SelectedAIContext;
}) {
  const { updateItem, updateFragment, updateOmittedMaterial, updateNotebookEntry, updateCodexEntry, updateMoodboardItem, updateResearchEntry, getOrCreateTag, binder, fragments, omittedMaterial, notebookEntries, codexEntries, moodboardItems, researchEntries } = useAppStore();
  const [applied, setApplied] = useState<Set<string>>(new Set());

  function getCurrentTags(): string[] {
    switch (ctx.objectType) {
      case 'scene': return findItem(binder, ctx.objectId)?.sceneMetadata?.tags ?? [];
      case 'fragment': return fragments.find(f => f.id === ctx.objectId)?.tags ?? [];
      case 'omitted_material': return omittedMaterial.find(o => o.id === ctx.objectId)?.tags ?? [];
      case 'notebook_entry': return notebookEntries.find(n => n.id === ctx.objectId)?.tags ?? [];
      case 'codex_entry': return codexEntries.find(c => c.id === ctx.objectId)?.tags ?? [];
      case 'moodboard_item': return moodboardItems.find(m => m.id === ctx.objectId)?.tags ?? [];
      case 'research_item': return researchEntries.find(r => r.id === ctx.objectId)?.tags ?? [];
      default: return [];
    }
  }

  function applyTag(tagName: string) {
    const trimmed = tagName.trim().toLowerCase();
    const currentTags = getCurrentTags();
    if (currentTags.includes(trimmed)) return;
    getOrCreateTag(trimmed);
    const newTags = [...currentTags, trimmed];

    switch (ctx.objectType) {
      case 'scene': {
        const scene = findItem(binder, ctx.objectId);
        updateItem(ctx.objectId, { sceneMetadata: { ...(scene?.sceneMetadata ?? {}), tags: newTags } });
        break;
      }
      case 'fragment': updateFragment(ctx.objectId, { tags: newTags }); break;
      case 'omitted_material': updateOmittedMaterial(ctx.objectId, { tags: newTags }); break;
      case 'notebook_entry': updateNotebookEntry(ctx.objectId, { tags: newTags }); break;
      case 'codex_entry': updateCodexEntry(ctx.objectId, { tags: newTags }); break;
      case 'moodboard_item': updateMoodboardItem(ctx.objectId, { tags: newTags }); break;
      case 'research_item': updateResearchEntry(ctx.objectId, { tags: newTags }); break;
    }

    setApplied((prev) => new Set(prev).add(trimmed));
  }

  const hasAny = output.existingMatches.length > 0 || output.newSuggestions.length > 0;
  const currentTags = getCurrentTags();

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
                  disabled={isApplied}
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
                  disabled={isApplied}
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
    </div>
  );
}

function PlacementResult({
  output,
  ctx,
}: {
  output: AIPlacementOutput;
  ctx: SelectedAIContext;
}) {
  const { updateFragment, updateOmittedMaterial } = useAppStore();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const notes = [
      output.rationale,
      output.suggestions.length > 0 ? 'Placement suggestions:\n' + output.suggestions.map(s => `• ${s}`).join('\n') : '',
      output.possibleScenes.length > 0 ? 'Possible scenes: ' + output.possibleScenes.join(', ') : '',
    ].filter(Boolean).join('\n\n');

    if (ctx.objectType === 'fragment') {
      updateFragment(ctx.objectId, { possiblePlacement: notes });
    } else if (ctx.objectType === 'omitted_material') {
      updateOmittedMaterial(ctx.objectId, { notes });
    }
    setSaved(true);
  }

  const saveLabel = ctx.objectType === 'fragment' ? 'Save to Possible Placement' : 'Save to Notes';

  return (
    <div className="flex flex-col gap-3">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}

      {output.rationale && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Analysis</p>
          <p className="text-xs text-gray-200 leading-relaxed">{output.rationale}</p>
        </div>
      )}

      {output.suggestions.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">
            {ctx.objectType === 'omitted_material' ? 'Restoration Possibilities' : 'Placement Suggestions'}
          </p>
          <ul className="flex flex-col gap-1">
            {output.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-1">
                <span className="text-purple-500 shrink-0">·</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {output.possibleScenes.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Possible scene connections</p>
          <p className="text-xs text-gray-300">{output.possibleScenes.join(', ')}</p>
        </div>
      )}

      {(ctx.objectType === 'fragment' || ctx.objectType === 'omitted_material') && (
        <button
          onClick={handleSave}
          disabled={saved}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
            saved
              ? 'bg-green-900/40 text-green-400 cursor-default'
              : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white'
          }`}
        >
          {saved ? '✓ Saved' : saveLabel}
        </button>
      )}
    </div>
  );
}

// Maps normalized (lowercase, no separators) field names to CodexEntry property keys.
const CODEX_FIELD_MAP: Record<string, string> = {
  role: 'role',
  age: 'age',
  pronouns: 'pronouns',
  relationships: 'relationships',
  physicaldetails: 'physicalDetails',
  voicenotes: 'voiceNotes',
  arcnotes: 'arcNotes',
  secrets: 'secrets',
  contradictions: 'contradictions',
  atmosphere: 'atmosphere',
  meaning: 'meaning',
  appearances: 'appearances',
  evolution: 'evolution',
  description: 'description',
};

const CODEX_FIELD_LABELS: Record<string, string> = {
  role: 'Role',
  age: 'Age / DOB',
  pronouns: 'Pronouns',
  relationships: 'Relationships',
  physicalDetails: 'Physical Details',
  voiceNotes: 'Voice Notes',
  arcNotes: 'Arc Notes',
  secrets: 'Secrets',
  contradictions: 'Contradictions / Tensions',
  atmosphere: 'Atmosphere',
  meaning: 'Meaning / Function',
  appearances: 'Appearances',
  evolution: 'Evolution',
  description: 'Description',
};

function normalizeFieldKey(field: string): string {
  return field.toLowerCase().replace(/[\s_\-/]+/g, '');
}

function CodexSuggestResult({
  output,
  ctx,
}: {
  output: AICodexSuggestOutput;
  ctx: SelectedAIContext;
}) {
  const { updateCodexEntry, addQuestion } = useAppStore();
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState(false);
  const [questionsSaved, setQuestionsSaved] = useState<Set<number>>(new Set());

  function toggleAccept(i: number) {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleApply() {
    const selectedSuggestions = output.fieldSuggestions.filter((_, i) => accepted.has(i));
    if (selectedSuggestions.length === 0) return;

    const directPatch: Record<string, string> = {};
    const newCustomFields: Record<string, string> = {};

    selectedSuggestions.forEach(s => {
      const canonicalKey = CODEX_FIELD_MAP[normalizeFieldKey(s.field)];
      if (canonicalKey) {
        directPatch[canonicalKey] = s.value;
      } else {
        newCustomFields[s.field] = s.value;
      }
    });

    const existingCustomFields = (ctx.metadata?.customFields as Record<string, string>) ?? {};
    updateCodexEntry(ctx.objectId, {
      ...directPatch,
      ...(Object.keys(newCustomFields).length > 0
        ? { customFields: { ...existingCustomFields, ...newCustomFields } }
        : {}),
    });
    setApplied(true);
  }

  function handleSaveQuestion(text: string, idx: number) {
    addQuestion({
      text,
      category: 'other',
      priority: 'medium',
      questionStatus: 'open',
      relatedSceneIds: [],
      relatedFragmentIds: [],
      relatedOmittedIds: [],
      relatedCodexIds: [ctx.objectId],
      relatedNotebookIds: [],
      answer: '',
      notes: '',
    });
    setQuestionsSaved(prev => new Set(prev).add(idx));
  }

  return (
    <div className="flex flex-col gap-3">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}

      {output.fieldSuggestions.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">
            Suggested Fields
          </p>
          <p className="text-[11px] text-gray-500 mb-2">Check fields to accept, then click Apply.</p>
          <div className="flex flex-col gap-1.5">
            {output.fieldSuggestions.map((s, i) => (
              <label
                key={i}
                className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                  accepted.has(i)
                    ? 'bg-purple-900/20 border border-purple-800/40'
                    : 'border border-transparent hover:border-[#2d3748]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={accepted.has(i)}
                  onChange={() => toggleAccept(i)}
                  className="accent-purple-500 mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-[10px] text-purple-400">
                    {CODEX_FIELD_LABELS[CODEX_FIELD_MAP[normalizeFieldKey(s.field)] ?? ''] ?? s.field}
                  </p>
                  <p className="text-xs text-gray-200">{s.value}</p>
                  {s.reason && <p className="text-[10px] text-gray-500 italic">{s.reason}</p>}
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={handleApply}
            disabled={accepted.size === 0 || applied}
            className={`mt-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              applied
                ? 'bg-green-900/40 text-green-400 cursor-default'
                : accepted.size > 0
                ? 'bg-purple-700 text-white hover:bg-purple-600'
                : 'bg-[#2d3748] text-gray-500 cursor-default'
            }`}
          >
            {applied ? '✓ Applied to Codex Entry' : `Apply Selected (${accepted.size})`}
          </button>
        </div>
      )}

      {output.contradictions.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">
            Potential Contradictions
          </p>
          {output.contradictions.map((c, i) => (
            <p key={i} className="text-xs text-amber-300 leading-relaxed mb-1">⚠ {c}</p>
          ))}
        </div>
      )}

      {output.openQuestions.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">
            Open Questions
          </p>
          {output.openQuestions.map((q, i) => (
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

function ExtractQuestionsResult({
  output,
  ctx,
}: {
  output: AIExtractQuestionsOutput;
  ctx: SelectedAIContext;
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
      relatedSceneIds: [],
      relatedFragmentIds: [],
      relatedOmittedIds: [],
      relatedCodexIds: [],
      relatedNotebookIds: [ctx.objectId],
      answer: '',
      notes: q.reason ? `Extracted from notebook: ${q.reason}` : 'Extracted from notebook entry',
    });
    setSaved(prev => new Set(prev).add(idx));
  }

  if (output.questions.length === 0) {
    return <p className="text-xs text-gray-500 italic">No distinct questions found in this note.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        {output.questions.length} question{output.questions.length !== 1 ? 's' : ''} extracted
        {output.truncated && <span className="ml-1 text-amber-500">(content was truncated)</span>}
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
          {q.reason && <p className="text-[10px] text-gray-500 italic">{q.reason}</p>}
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

function RefineQuestionResult({
  output,
  ctx,
}: {
  output: AIRefineQuestionOutput;
  ctx: SelectedAIContext;
}) {
  const { updateQuestion } = useAppStore();
  const [applied, setApplied] = useState(false);

  function handleApply() {
    updateQuestion(ctx.objectId, {
      text: output.refined,
      category: output.suggestedCategory,
      priority: output.suggestedPriority,
    });
    setApplied(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Refined Question</p>
        <p className="text-xs text-gray-200 leading-relaxed border border-[#2d3748] rounded p-2 bg-[#1a1a2e]">
          {output.refined}
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div>
          <p className="text-[10px] text-gray-500">Category</p>
          <span className="text-[11px] text-purple-400 bg-purple-900/20 rounded px-1.5 py-0.5">
            {output.suggestedCategory.replace('_', ' ')}
          </span>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Priority</p>
          <span className={`text-[11px] rounded px-1.5 py-0.5 ${
            output.suggestedPriority === 'high' ? 'text-red-400 bg-red-900/20' :
            output.suggestedPriority === 'medium' ? 'text-amber-400 bg-amber-900/20' :
            'text-gray-400 bg-gray-800'
          }`}>
            {output.suggestedPriority}
          </span>
        </div>
      </div>

      {output.rationale && (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Rationale</p>
          <p className="text-xs text-gray-400 italic">{output.rationale}</p>
        </div>
      )}

      {output.relatedQuestions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Related Questions to Explore</p>
          <ul className="flex flex-col gap-0.5">
            {output.relatedQuestions.map((q, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-1">
                <span className="text-purple-500 shrink-0">·</span>{q}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={handleApply}
        disabled={applied}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
          applied
            ? 'bg-green-900/40 text-green-400 cursor-default'
            : 'bg-purple-700 text-white hover:bg-purple-600'
        }`}
      >
        {applied ? '✓ Applied to Question' : 'Apply Refined Question'}
      </button>
    </div>
  );
}

// ── Plotline Result ───────────────────────────────────────────────────────────

function PlotlineResult({
  output,
  ctx,
}: {
  output: AIPlotlineOutput;
  ctx: SelectedAIContext;
}) {
  const { updateItem, binder } = useAppStore();
  const [applied, setApplied] = useState<string | null>(null);

  function applyPlotline(name: string) {
    const scene = findItem(binder, ctx.objectId);
    updateItem(ctx.objectId, { sceneMetadata: { ...(scene?.sceneMetadata ?? {}), plotline: name } });
    setApplied(name);
  }

  if (!output.suggestions || output.suggestions.length === 0) {
    return <p className="text-xs text-gray-500 italic">No plotline suggestions generated.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {output.truncated && (
        <p className="text-[11px] text-amber-500">Content was truncated before analysis.</p>
      )}
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Plotline Suggestions</p>
      {output.suggestions.map((s) => {
        const isApplied = applied === s.name;
        return (
          <div key={s.name} className="flex flex-col gap-1 bg-[#1a1a3e] border border-[#0f3460] rounded p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-purple-300 font-medium">{s.name}</span>
              <button
                onClick={() => applyPlotline(s.name)}
                disabled={isApplied}
                className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  isApplied
                    ? 'bg-green-900/30 text-green-400 cursor-default'
                    : 'bg-purple-700 text-white hover:bg-purple-600'
                }`}
              >
                {isApplied ? '✓ Applied' : 'Use This'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">{s.reason}</p>
          </div>
        );
      })}
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
    projectTags,
    binder,
    storyBrief,
    setStoryBrief,
  } = useAppStore();

  const ctx = useAIContext();

  const [aiStatus, setAIStatus] = useState<AIStatusInfo | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [action, setAction] = useState<AIActionType>('questions');
  const [category, setCategory] = useState('any');
  const [runState, setRunState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<AIOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [showBriefContent, setShowBriefContent] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState('');
  const [enteringBriefManually, setEnteringBriefManually] = useState(false);

  const actions = ctx ? availableActionsForType(ctx.objectType, aiSettings.mode) : [];

  useEffect(() => {
    if (actions.length > 0 && !actions.find((a) => a.value === action)) {
      setAction(actions[0].value);
    }
  }, [ctx?.objectType, aiSettings.mode, action, actions]);

  useEffect(() => {
    setResult(null);
    setError(null);
    setRunState('idle');
  }, [action, ctx?.objectId]);

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

  async function handleGenerateBrief() {
    setBriefLoading(true);
    setBriefError(null);
    try {
      const allScenes = collectManuscriptScenes(binder);
      if (allScenes.length === 0) {
        setBriefError('No manuscript content found. Add some scenes first.');
        return;
      }
      // Cap total payload to match server-side BRIEF_MAX_CHARS so large
      // manuscripts don't exceed proxy body-size limits.
      const CLIENT_BRIEF_MAX = 600_000;
      let charCount = 0;
      const scenes = allScenes.filter((s) => {
        if (charCount >= CLIENT_BRIEF_MAX) return false;
        charCount += s.text.length;
        return true;
      });
      const res = await fetch('/api/ai/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `Server returned ${res.status}`;
        try {
          const errData = JSON.parse(text) as { error?: string };
          if (errData.error) message = errData.error;
        } catch { /* not JSON */ }
        throw new Error(message);
      }
      const data = await res.json() as { brief?: string; error?: string; truncated?: boolean };
      if (!data.brief) {
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }
      const currentWc = totalWordCount(binder);
      setStoryBrief({ content: data.brief, generatedAt: Date.now(), wordCountAtGeneration: currentWc });
      setShowBriefContent(false);
      setEditingBrief(false);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : String(err));
    } finally {
      setBriefLoading(false);
    }
  }

  async function handleRun() {
    if (!ctx || !aiStatus?.configured || aiSettings.mode === 'disabled') return;

    const content = ctx.content;
    const wc = wordCount(content);

    if (wc < 5) {
      setError(`This ${OBJECT_TYPE_LABELS[ctx.objectType].toLowerCase()} has too little content to analyse. Add some text first.`);
      setRunState('error');
      return;
    }

    setRunState('loading');
    setError(null);
    setResult(null);

    try {
      const endpoint = action === 'extract-questions' ? 'questions' : action;
      // Trim before sending — the server truncates anyway, but keeping
      // the payload small avoids proxy/ingress body-size limits.
      const contentForSend = content.length > 200_000 ? content.slice(0, 200_000) : content;
      const storyContextForSend = storyBrief?.content && storyBrief.content.length > 50_000
        ? storyBrief.content.slice(0, 50_000)
        : storyBrief?.content;

      const body: Record<string, unknown> = {
        title: ctx.title,
        content: contentForSend,
        objectType: ctx.objectType,
        mode: aiSettings.mode,
        allowDrafting: aiSettings.allowDrafting,
      };

      if (action === 'questions' || action === 'extract-questions') {
        if (category !== 'any') body.category = category;
        body.extractFromNote = action === 'extract-questions';
      }

      if (action === 'tags') {
        body.allProjectTags = projectTags.map((t) => t.name);
      }

      if (action === 'plotline') {
        const plotlines = new Set<string>();
        const scanBinder = (items: typeof binder) => {
          for (const item of items) {
            if (item.sceneMetadata?.plotline?.trim()) plotlines.add(item.sceneMetadata.plotline.trim());
            if (item.children) scanBinder(item.children);
          }
        };
        scanBinder(binder);
        body.allProjectPlotlines = [...plotlines];
        body.notes = ctx.notes ?? '';
        body.sceneMetadata = ctx.metadata ?? {};
      }

      if (action === 'codex-suggest') {
        body.codexType = (ctx.metadata?.codexType as string) ?? '';
        body.existingNotes = ctx.notes ?? '';
        body.existingFields = ctx.metadata ?? {};
      }

      if (action === 'refine-question') {
        body.questionText = ctx.title;
        body.currentCategory = (ctx.metadata?.category as string) ?? '';
        body.currentPriority = (ctx.metadata?.priority as string) ?? '';
        body.notes = ctx.notes ?? '';
        body.answer = (ctx.metadata?.answer as string) ?? '';
      }

      if (storyContextForSend) {
        body.storyContext = storyContextForSend;
      }

      const res = await fetch(`/api/ai/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Server returned ${res.status}`;
        try {
          const errData = JSON.parse(text) as { error?: string };
          if (errData.error) message = errData.error;
        } catch { /* not JSON */ }
        throw new Error(message);
      }

      const data = await res.json() as Record<string, unknown>;

      const outputType = action;
      const output = { ...data, type: outputType } as AIOutput;
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
    !!ctx &&
    actions.length > 0 &&
    runState !== 'loading' &&
    privacyAcknowledged;

  const objectLabel = ctx ? OBJECT_TYPE_LABELS[ctx.objectType] : null;

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

          {/* Story Brief */}
          {!statusLoading && aiStatus?.configured && (() => {
            const currentWc = totalWordCount(binder);
            const drift = storyBrief ? Math.abs(currentWc - storyBrief.wordCountAtGeneration) : 0;
            const isStale = drift > 500;
            return (
              <div className="border border-[#0f3460] rounded bg-[#1a1a3e]">
                <div className="flex items-center justify-between px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Story Brief</span>
                    {storyBrief && (
                      <span className="text-[10px] text-green-400 bg-green-900/20 rounded px-1 py-0.5">active</span>
                    )}
                    {storyBrief && isStale && (
                      <span className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-1 py-0.5">stale</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {storyBrief && (
                      <button
                        onClick={() => {
                          setShowBriefContent(v => !v);
                          if (!showBriefContent) {
                            setBriefDraft(storyBrief.content);
                            setEditingBrief(false);
                          }
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                      >
                        {showBriefContent ? 'hide' : 'view'}
                      </button>
                    )}
                    {!storyBrief && !enteringBriefManually && (
                      <button
                        onClick={() => { setEnteringBriefManually(true); setBriefDraft(''); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-[#1e3a5f]/60 text-blue-300 hover:bg-[#1e3a5f] hover:text-white transition-colors"
                      >
                        Paste
                      </button>
                    )}
                    <button
                      onClick={handleGenerateBrief}
                      disabled={briefLoading}
                      className="text-[10px] px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 hover:bg-purple-800/40 hover:text-white disabled:opacity-50 disabled:cursor-default transition-colors"
                    >
                      {briefLoading ? '⟳ Generating…' : storyBrief ? '↺ Regen' : 'Generate'}
                    </button>
                    {storyBrief && (
                      <button
                        onClick={() => { setStoryBrief(null); setShowBriefContent(false); }}
                        className="text-[10px] text-gray-600 hover:text-red-400 px-1"
                        title="Clear brief"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {!storyBrief && !briefLoading && !enteringBriefManually && (
                  <p className="px-2.5 pb-2 text-[10px] text-gray-600 leading-relaxed">
                    Generate a brief so the AI knows your full story — characters, plot, tone, gaps. Or paste one you've already written.
                  </p>
                )}

                {!storyBrief && enteringBriefManually && (
                  <div className="px-2.5 pb-2 flex flex-col gap-1.5">
                    <textarea
                      value={briefDraft}
                      onChange={e => setBriefDraft(e.target.value)}
                      rows={12}
                      placeholder="Paste your project brief here — characters, premise, plot, tone, active threads…"
                      className="w-full bg-[#0f1022] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-gray-300 font-mono leading-relaxed resize-y outline-none focus:border-purple-700 placeholder-gray-700"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          if (briefDraft.trim()) {
                            setStoryBrief({ content: briefDraft.trim(), generatedAt: Date.now(), wordCountAtGeneration: totalWordCount(binder) });
                            setEnteringBriefManually(false);
                            setBriefDraft('');
                          }
                        }}
                        disabled={!briefDraft.trim()}
                        className="text-[10px] px-2 py-0.5 rounded bg-purple-700 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-default"
                      >
                        Save Brief
                      </button>
                      <button
                        onClick={() => { setEnteringBriefManually(false); setBriefDraft(''); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-[#2d3748] text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {storyBrief && !showBriefContent && (
                  <div className="px-2.5 pb-2 flex flex-col gap-0.5">
                    <p className="text-[10px] text-gray-600">
                      {new Date(storyBrief.generatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{storyBrief.wordCountAtGeneration.toLocaleString()} words at generation
                    </p>
                    {isStale && (
                      <p className="text-[10px] text-amber-500">
                        ⚠ Manuscript has changed by ~{drift.toLocaleString()} words — consider regenerating.
                      </p>
                    )}
                  </div>
                )}

                {storyBrief && showBriefContent && (
                  <div className="px-2.5 pb-2 flex flex-col gap-1.5">
                    {isStale && (
                      <p className="text-[10px] text-amber-500">
                        ⚠ Manuscript has changed by ~{drift.toLocaleString()} words.
                      </p>
                    )}
                    {editingBrief ? (
                      <>
                        <textarea
                          value={briefDraft}
                          onChange={e => setBriefDraft(e.target.value)}
                          rows={12}
                          className="w-full bg-[#0f1022] border border-[#2d3748] rounded px-2 py-1.5 text-[11px] text-gray-300 font-mono leading-relaxed resize-y outline-none focus:border-purple-700"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setStoryBrief({ ...storyBrief, content: briefDraft });
                              setEditingBrief(false);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-purple-700 text-white hover:bg-purple-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingBrief(false); setBriefDraft(storyBrief.content); }}
                            className="text-[10px] px-2 py-0.5 rounded bg-[#2d3748] text-gray-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="max-h-48 overflow-y-auto">
                          <p className="text-[10px] text-gray-400 leading-relaxed whitespace-pre-wrap">{storyBrief.content}</p>
                        </div>
                        <button
                          onClick={() => { setEditingBrief(true); setBriefDraft(storyBrief.content); }}
                          className="self-start text-[10px] text-gray-500 hover:text-gray-300 underline"
                        >
                          Edit brief
                        </button>
                      </>
                    )}
                  </div>
                )}

                {briefError && (
                  <p className="px-2.5 pb-2 text-[10px] text-red-400">{briefError}</p>
                )}
              </div>
            );
          })()}

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

          {/* No object selected */}
          {aiStatus?.configured && aiSettings.mode !== 'disabled' && !ctx && (
            <div className="border border-[#2d3748] rounded p-3 bg-[#1a1a2e]">
              <p className="text-xs text-gray-400 mb-1">No item selected.</p>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Select a scene, fragment, notebook entry, codex entry, or project question to use AI assistance.
              </p>
            </div>
          )}

          {/* Main controls */}
          {aiStatus?.configured && aiSettings.mode !== 'disabled' && ctx && (
            <>
              {/* Selected object scope */}
              <div className="border border-[#2d3748] rounded p-2 bg-[#1a1a2e]">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] text-purple-400 bg-purple-900/20 rounded px-1.5 py-0.5">
                    {objectLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-200 font-medium truncate">{ctx.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {wordCount(ctx.content).toLocaleString()} words
                  {ctx.tags && ctx.tags.length > 0 && ` · ${ctx.tags.length} tag${ctx.tags.length !== 1 ? 's' : ''}`}
                </p>
              </div>

              {/* Privacy notice */}
              {!privacyAcknowledged && (
                <div className="border border-blue-800/40 rounded p-2 bg-blue-900/10">
                  <p className="text-[11px] text-gray-300 leading-relaxed mb-2">
                    This action will send the selected {objectLabel?.toLowerCase()} text to{' '}
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
                  {actions.length > 0 ? (
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Available Actions</p>
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
                  ) : (
                    <div className="border border-[#2d3748] rounded p-2 bg-[#1a1a2e]">
                      <p className="text-xs text-gray-500">
                        No AI actions are available for this object type in the current mode.{' '}
                        <button onClick={() => setShowSettings(true)} className="text-purple-400 underline">
                          Change mode.
                        </button>
                      </p>
                    </div>
                  )}

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

                  {/* Scene-only action note */}
                  {ctx.objectType !== 'scene' && (
                    <p className="text-[10px] text-gray-600">
                      ⓘ Generate Metadata is a scene-only action and is not shown here.
                    </p>
                  )}

                  {/* No-drafting indicator */}
                  {aiSettings.mode !== 'full' && (
                    <p className="text-[10px] text-gray-600">
                      ⊘ Prose drafting disabled — AI outputs analytical content only
                    </p>
                  )}

                  {/* Run button */}
                  {actions.length > 0 && (
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
                  )}
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
          {runState === 'done' && result && ctx && (
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
                <QuestionsResult output={result as AIQuestionsOutput} ctx={ctx} />
              )}
              {result.type === 'summarize' && (
                <SummarizeResult output={result as AISummarizeOutput} ctx={ctx} />
              )}
              {result.type === 'metadata' && (
                <MetadataResult output={result as AIMetadataOutput} ctx={ctx} />
              )}
              {result.type === 'tags' && (
                <TagsResult output={result as AITagsOutput} ctx={ctx} />
              )}
              {result.type === 'placement' && (
                <PlacementResult output={result as AIPlacementOutput} ctx={ctx} />
              )}
              {result.type === 'codex-suggest' && (
                <CodexSuggestResult output={result as AICodexSuggestOutput} ctx={ctx} />
              )}
              {result.type === 'extract-questions' && (
                <ExtractQuestionsResult output={result as AIExtractQuestionsOutput} ctx={ctx} />
              )}
              {result.type === 'refine-question' && (
                <RefineQuestionResult output={result as AIRefineQuestionOutput} ctx={ctx} />
              )}
              {result.type === 'plotline' && (
                <PlotlineResult output={result as AIPlotlineOutput} ctx={ctx} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
