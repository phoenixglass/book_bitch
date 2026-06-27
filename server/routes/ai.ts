import { Router, Request, Response } from 'express';
import { getAIConfig, callAI, extractJSON } from '../lib/ai.js';
import { stripHTML, truncate, modePreamble } from '../lib/context.js';
import {
  metadataSystemPrompt,
  metadataUserPrompt,
  CODEX_EXTRACT_SYSTEM,
  chunkCodexItems,
  codexUserPrompt,
  mergeCodexEntries,
  type RawCodexEntry,
} from '../lib/aiPrompts.js';

export const aiRouter = Router();

function storyContextBlock(ctx?: string): string {
  if (!ctx?.trim()) return '';
  return `\n--- STORY BRIEF ---\n${ctx.trim()}\n--- END STORY BRIEF ---\n`;
}

// ── GET /api/ai/status ───────────────────────────────────────────────────────

aiRouter.get('/status', (_req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.json({ configured: false });
    return;
  }
  res.json({ configured: true, provider: config.provider, model: config.model });
});

// ── POST /api/ai/questions ───────────────────────────────────────────────────

aiRouter.post('/questions', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const {
    title,
    content,
    synopsis,
    category,
    objectType = 'scene',
    extractFromNote = false,
    mode = 'questions_only',
    allowDrafting = false,
    storyContext,
  } = req.body as {
    title?: string;
    content?: string;
    synopsis?: string;
    category?: string;
    objectType?: string;
    extractFromNote?: boolean;
    mode?: string;
    allowDrafting?: boolean;
    storyContext?: string;
  };

  if (!content && !synopsis) {
    res.status(400).json({ error: 'No content provided. Select an item with text to analyze.' });
    return;
  }

  const plainText = stripHTML(content ?? '');
  const { text: truncatedText, truncated } = truncate(plainText, 48000);

  const preamble = modePreamble(mode, allowDrafting);
  const categoryHint = category && category !== 'any'
    ? `Focus your questions on the category: ${category}.`
    : 'Cover a range of craft categories.';

  const objectLabel = ({
    scene: 'scene',
    fragment: 'fragment',
    omitted_material: 'omitted material item',
    notebook_entry: 'notebook entry',
    codex_entry: 'codex entry',
    question: 'project question',
    moodboard_item: 'moodboard item',
  } as Record<string, string>)[objectType] ?? objectType;

  const taskDesc = extractFromNote
    ? `Your task: extract 4–8 open questions that are explicitly or implicitly present in the provided ${objectLabel}. These are questions the author raises, implies, or leaves unresolved.`
    : `Your task: generate 5–8 insightful craft questions about the ${objectLabel} provided.`;

  const systemPrompt = [
    `You are a writing coach helping a novelist think more deeply about their work.`,
    preamble,
    taskDesc,
    storyContext ? 'CRITICAL: A Story Brief is included at the top of the user message. Read it first. Use character names, plot threads, and story context from the Brief to make your questions specific to this actual story — never refer to characters with vague labels when the Brief names them.' : '',
    'Rules:',
    '- Ask questions only. Never draft prose, dialogue, or scene content.',
    '- Make questions specific to the provided text, not generic.',
    '- Questions should provoke thought, not suggest answers.',
    '- Flag any culturally significant dates or events (e.g., 9/11, anniversaries of tragedies, major holidays) whose tone or context might be problematic.',
    categoryHint,
    '',
    'Return ONLY valid JSON in this exact structure, no other text:',
    JSON.stringify({
      questions: [
        {
          text: 'The question text',
          category: 'plot|character|timeline|research|structure|theme|continuity|worldbuilding|emotional_logic|other',
          priority: 'low|medium|high',
          reason: 'One sentence explaining why this matters for this text',
        },
      ],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    storyContextBlock(storyContext),
    `${objectLabel.charAt(0).toUpperCase() + objectLabel.slice(1)} title: ${title ?? 'Untitled'}`,
    synopsis ? `Synopsis: ${synopsis}` : '',
    '',
    `${objectLabel.charAt(0).toUpperCase() + objectLabel.slice(1)} text:`,
    truncatedText,
    truncated ? '\n[Note: content was truncated]' : '',
  ]
    .filter(s => s !== undefined)
    .join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { questions: unknown[] };
    if (!parsed || !Array.isArray(parsed.questions)) {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ questions: parsed.questions, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/summarize ───────────────────────────────────────────────────

aiRouter.post('/summarize', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const { title, content, objectType = 'scene', mode = 'analysis_only', allowDrafting = false, storyContext } = req.body as {
    title?: string;
    content?: string;
    objectType?: string;
    mode?: string;
    allowDrafting?: boolean;
    storyContext?: string;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 48000);
  const preamble = modePreamble(mode, allowDrafting);

  const systemPrompt = [
    `You are a writing assistant helping a novelist organize their manuscript (${objectType}).`,
    preamble,
    'Your task: produce a concise, analytical summary of the provided text.',
    storyContext ? 'CRITICAL: A Story Brief is included at the top of the user message. Read it first. Use the character names, locations, and plot context from the Brief when describing what happens in this text — never refer to characters as "an unidentified woman", "a man", or vague descriptors when the Brief tells you who they are.' : '',
    'Rules:',
    '- Summarize only. Do not draft new prose or suggest rewrites.',
    '- Be specific to the provided text.',
    '- The summary should describe what happens using the actual names from the Story Brief, not evaluate it.',
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      summary: '2–4 sentence narrative summary of what happens',
      bulletPoints: ['Key event or detail 1', 'Key event or detail 2'],
      characters: ['Character names mentioned or implied'],
      places: ['Locations mentioned or implied'],
      motifs: ['Recurring themes or symbolic elements detected'],
      suggestedTags: ['tag1', 'tag2'],
      unansweredQuestions: ['Question raised but not resolved in this text'],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    storyContextBlock(storyContext),
    `Title: ${title ?? 'Untitled'}`,
    `Type: ${objectType}`,
    '',
    'Content:',
    truncatedText,
  ].join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as {
      summary: string;
      bulletPoints: string[];
      characters: string[];
      places: string[];
      motifs: string[];
      suggestedTags: string[];
      unansweredQuestions: string[];
    };
    if (!parsed || typeof parsed.summary !== 'string') {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/metadata ────────────────────────────────────────────────────

aiRouter.post('/metadata', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const {
    title, content, mode = 'metadata_assistance', allowDrafting = false,
    storyContext, existingMetadata = {}, relevantCodex = [], projectStructure,
  } = req.body as {
    title?: string;
    content?: string;
    mode?: string;
    allowDrafting?: boolean;
    storyContext?: string;
    existingMetadata?: Record<string, unknown>;
    relevantCodex?: string[];
    projectStructure?: string;
  };

  if (!content) {
    res.status(400).json({ error: 'No scene content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 48000);
  const preamble = modePreamble(mode, allowDrafting);
  const briefIncluded = !!storyContext?.trim();

  const systemPrompt = metadataSystemPrompt(preamble, briefIncluded);
  const userPrompt = metadataUserPrompt({ title, storyContext, existingMetadata, relevantCodex, projectStructure, chapterText: truncatedText });

  try {
    const raw = await callAI(config, systemPrompt, userPrompt, 3072);
    const parsed = extractJSON(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.synopsis !== 'string') {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, briefIncluded, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/codex-extract ───────────────────────────────────────────────

aiRouter.post('/codex-extract', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const { scenes } = req.body as {
    scenes: Array<{ id: string; title: string; text: string }>;
  };

  if (!scenes || scenes.length === 0) {
    res.status(400).json({ error: 'No scenes provided. Add some manuscript content first.' });
    return;
  }

  const prepared = scenes
    .map((s) => ({ id: s.id, title: s.title || 'Untitled', text: stripHTML(s.text ?? '') }))
    .filter((s) => s.text.length > 0);
  if (prepared.length === 0) {
    res.status(400).json({ error: 'Selected items contain no text to analyze.' });
    return;
  }

  const totalWordCount = prepared.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const chunks = chunkCodexItems(prepared);

  try {
    const chunkResults = await Promise.all(
      chunks.map((chunk, i) => {
        const userPrompt = codexUserPrompt(chunk, i, chunks.length);
        return callAI(config, CODEX_EXTRACT_SYSTEM, userPrompt, 8192).then((raw) => {
          try {
            const parsed = extractJSON(raw) as { entries?: RawCodexEntry[] };
            return Array.isArray(parsed?.entries) ? parsed.entries : [];
          } catch (e) {
            console.error(`[codex-extract] chunk ${i + 1}/${chunks.length} parse error:`, e instanceof Error ? e.message : e);
            return [] as RawCodexEntry[];
          }
        });
      }),
    );

    const merged = mergeCodexEntries(chunkResults.flat());
    const itemsWithEntities = new Set<string>();
    for (const e of merged) for (const a of e.sourceAppearances ?? []) if (a.itemId) itemsWithEntities.add(a.itemId);

    res.json({
      entries: merged,
      coverage: {
        itemsAnalyzed: prepared.length,
        itemsWithEntities: itemsWithEntities.size,
        chunkCount: chunks.length,
        totalWordCount,
      },
      truncated: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/placement ───────────────────────────────────────────────────

aiRouter.post('/placement', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const { title, content, objectType = 'fragment', mode = 'analysis_only', allowDrafting = false, storyContext } = req.body as {
    title?: string;
    content?: string;
    objectType?: string;
    mode?: string;
    allowDrafting?: boolean;
    storyContext?: string;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 48000);
  const preamble = modePreamble(mode, allowDrafting);

  const isOmitted = objectType === 'omitted_material';

  const systemPrompt = [
    `You are a writing assistant helping a novelist evaluate ${isOmitted ? 'omitted material' : 'a fragment'} for potential use or restoration.`,
    preamble,
    isOmitted
      ? 'Your task: analyse the structural and thematic significance of this cut material, and suggest whether and how it might be restored or repurposed.'
      : 'Your task: suggest where and how this fragment might be placed or used within the manuscript.',
    'Rules:',
    '- Do not draft new prose. Analyse only.',
    '- Be specific to the content provided.',
    '- Consider structural, thematic, and narrative reasons.',
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      rationale: '2–3 sentence analysis of the material\'s strengths and potential narrative role',
      suggestions: ['Specific placement or use suggestion 1', 'Suggestion 2'],
      possibleScenes: ['Description of scene type or moment this might fit'],
    }),
  ].filter(Boolean).join('\n');

  const userPrompt = [
    storyContextBlock(storyContext),
    `Title: ${title ?? 'Untitled'}`,
    `Type: ${objectType}`,
    '',
    'Content:',
    truncatedText,
  ].join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { rationale: string; suggestions: string[]; possibleScenes: string[] };
    if (!parsed || typeof parsed.rationale !== 'string') {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/codex-suggest ───────────────────────────────────────────────

aiRouter.post('/codex-suggest', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const {
    title,
    content,
    codexType = 'custom',
    existingNotes = '',
    existingFields = {},
    mode = 'analysis_only',
    allowDrafting = false,
  } = req.body as {
    title?: string;
    content?: string;
    codexType?: string;
    existingNotes?: string;
    existingFields?: Record<string, unknown>;
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content && !existingNotes) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainDesc = stripHTML(content ?? '');
  const { text: truncatedDesc, truncated } = truncate([plainDesc, existingNotes].filter(Boolean).join('\n\n'));
  const preamble = modePreamble(mode, allowDrafting);

  const existingSummary = Object.entries(existingFields)
    .filter(([, v]) => v && typeof v === 'string' && (v as string).trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const systemPrompt = [
    `You are a writing assistant helping a novelist enrich their world-bible codex entry for a ${codexType}.`,
    preamble,
    'Your task: identify missing or incomplete information and suggest what might be worth developing.',
    'Rules:',
    '- Base suggestions ONLY on gaps evident from the existing entry.',
    '- Do NOT invent facts not implied by the text.',
    '- Identify contradictions or unresolved questions if present.',
    '- Field suggestions should be specific to the codex entry type.',
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      fieldSuggestions: [
        { field: 'field name', value: 'suggested content based on existing text', reason: 'why this matters' },
      ],
      contradictions: ['Any apparent contradiction or inconsistency in the entry'],
      openQuestions: ['An unresolved question raised by this entry'],
    }),
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `Codex entry: ${title ?? 'Untitled'}`,
    `Type: ${codexType}`,
    existingSummary ? `\nExisting fields:\n${existingSummary}` : '',
    '',
    'Description and notes:',
    truncatedDesc,
  ].filter(Boolean).join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as {
      fieldSuggestions: Array<{ field: string; value: string; reason: string }>;
      contradictions: string[];
      openQuestions: string[];
    };
    if (!parsed || !Array.isArray(parsed.fieldSuggestions)) {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/refine-question ─────────────────────────────────────────────

aiRouter.post('/refine-question', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const {
    title,
    content,
    questionText,
    currentCategory = '',
    currentPriority = '',
    notes = '',
    answer = '',
    mode = 'analysis_only',
    allowDrafting = false,
  } = req.body as {
    title?: string;
    content?: string;
    questionText?: string;
    currentCategory?: string;
    currentPriority?: string;
    notes?: string;
    answer?: string;
    mode?: string;
    allowDrafting?: boolean;
  };

  const qText = questionText ?? title ?? content ?? '';
  if (!qText.trim()) {
    res.status(400).json({ error: 'No question text provided.' });
    return;
  }

  const preamble = modePreamble(mode, allowDrafting);
  const context = [
    notes ? `Author notes: ${notes}` : '',
    answer ? `Partial answer: ${answer}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = [
    'You are a writing coach helping a novelist clarify and sharpen their craft questions.',
    preamble,
    'Your task: refine the provided question to make it more focused, specific, and generative.',
    'Rules:',
    '- Do not answer the question. Improve its phrasing only.',
    '- A good question is specific, non-rhetorical, and opens up rather than closes down thinking.',
    '- Suggest the most appropriate category and priority.',
    '- Suggest 1–3 related questions the author might also want to explore.',
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      refined: 'The refined, sharpened version of the question',
      suggestedCategory: 'plot|character|timeline|research|structure|theme|continuity|worldbuilding|emotional_logic|other',
      suggestedPriority: 'low|medium|high',
      rationale: 'One sentence explaining what was sharpened and why',
      relatedQuestions: ['A related question worth exploring'],
    }),
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `Original question: ${qText}`,
    currentCategory ? `Current category: ${currentCategory}` : '',
    currentPriority ? `Current priority: ${currentPriority}` : '',
    context,
  ].filter(Boolean).join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as {
      refined: string;
      suggestedCategory: string;
      suggestedPriority: string;
      rationale: string;
      relatedQuestions: string[];
    };
    if (!parsed || typeof parsed.refined !== 'string') {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, truncated: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/plotline ────────────────────────────────────────────────────

aiRouter.post('/plotline', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const {
    title,
    content,
    notes = '',
    sceneMetadata = {},
    allProjectPlotlines = [],
    mode = 'metadata_assistance',
    allowDrafting = false,
    storyContext,
  } = req.body as {
    title?: string;
    content?: string;
    notes?: string;
    sceneMetadata?: Record<string, unknown>;
    allProjectPlotlines?: string[];
    mode?: string;
    allowDrafting?: boolean;
    storyContext?: string;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 48000);
  const preamble = modePreamble(mode, allowDrafting);

  const existingList = allProjectPlotlines.length > 0
    ? `Existing plotlines in this project: ${allProjectPlotlines.join(', ')}`
    : 'No existing plotlines defined in this project yet.';

  const canonicalPlotlines = [
    'The Marriage Plot. Phoenix and her husband, spanning 2016 to the present. A relationship marked by a real history of harm — his drinking, the 2017 nursery incident, years of surveillance and control flowing in both directions — moving through partial repair that\'s neither resolved nor undone by the time she\'s taken. This is the thread that explains who Phoenix is before any of this happens, and it rhymes, uncomfortably, with the relationship she builds in Russia.',
    'The Obsession Plot. The years-long development of Phoenix\'s fixation on Putin, tracked through the blog — from the 2017 John Oliver parody, through the 2023 marriage-crisis entry where the real origin surfaces, through the Pinterest boards and the biographies and the painted dicks, into something that has become inseparable from her identity as a writer by the time she\'s approached in Florence.',
    'The Abduction and Vetting Plot. How she ends up in Russia — the surveillance memo, the false pretenses at the workshop, the drugging, the quarantine, the medical processing — establishing the mechanics of capture and the apparatus\'s logic for why she, specifically, was useful to them.',
    'The Ghostwriting Plot. The actual assignment. The dictation sessions, the autobiography taking shape, Phoenix\'s growing understanding that the document is structurally incapable of holding the truth, and her own craft anxiety about ventriloquizing a man she\'s never written before. This thread carries the book\'s thesis about writing itself.',
    'The Two-Notebook Plot. The official notebook versus the stolen one, and the blog as a third document running alongside both. This is the structural spine — the record of what\'s allowed to exist versus what isn\'t, and which one survives.',
    'The Relationship Plot. The escalation between Phoenix and Putin specifically — the mug, the keyholes, the bunker and Cheremushkin, the birthday, the belly, Sochi. The thread that asks what it costs to be truly seen by someone, and what it costs to truly see someone back.',
    'The Apparatus Plot. The world around them — the FSO, the paranoia escalating through 2026, the coup fears, the tightening circle, Ksenia\'s disappearance, the dimpled guard, Galina. This thread provides the political ground the personal story stands on and is what eventually produces both her unusual safety (no network, no threat) and the conditions for the book\'s destruction.',
    'The Witness Plot. What Phoenix actually sees and understands about who he is — the rat story, the Kursk exchange, the mirror quote, the SPIEF realization about her own lack of purpose — building toward full clarity about both his humanity and his danger, arriving at "there\'s a little Putin in all of us" without ever softening the moral record.',
    'The Reveal-and-Destruction Plot. Still mostly unwritten — the apparatus or Putin himself discovering the true content of what she\'s produced, the consequences that follow, and the eventual destruction of the manuscript. This is the plot that needs the most work and carries the book\'s tragic engine.',
    'The Homecoming Plot. Also mostly unwritten — Phoenix\'s return to Connecticut, the blog continuing in a changed register, the final entry on his birthday, what\'s left of the marriage, what she carries home that nobody can take from her.',
  ];

  const systemPrompt = [
    'You are a writing assistant helping a novelist identify which narrative thread or plotline a scene belongs to.',
    preamble,
    'Your task: suggest 2–3 plotline or narrative thread names for the provided scene.',
    storyContext ? 'A Story Brief with full manuscript context is included in the user message — use it to ground your suggestions in the actual story arcs and characters.' : '',
    '',
    'This project has the following canonical plotlines. Prefer these names and definitions when they match the scene:',
    canonicalPlotlines.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    '',
    'Rules:',
    '- Match the scene to one or more canonical plotlines above when the fit is genuine.',
    '- A scene may belong to multiple plotlines — suggest all that genuinely apply (up to 3).',
    '- Create a new plotline name only if the scene\'s thread is clearly not covered by any canonical plotline.',
    '- New plotline names should be concise (2–5 words) and describe the narrative arc, not just a character name.',
    '- Each suggestion must include a brief reason grounded in the scene text.',
    '- Do not invent details not present in the text or metadata.',
    '- Always use provided metadata (location, characters, POV) — do not override it with assumptions.',
    existingList,
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      suggestions: [
        { name: 'First plotline or thread name', reason: 'One sentence grounding this in the scene text' },
        { name: 'Second plotline or thread name', reason: 'One sentence grounding this in the scene text' },
        { name: 'Third plotline or thread name (optional)', reason: 'One sentence grounding this in the scene text' },
      ],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const metaLines: string[] = [];
  if (sceneMetadata.location) metaLines.push(`Location: ${sceneMetadata.location}`);
  if (sceneMetadata.povCharacter) metaLines.push(`POV character: ${sceneMetadata.povCharacter}`);
  if (Array.isArray(sceneMetadata.charactersPresent) && (sceneMetadata.charactersPresent as string[]).length > 0) {
    metaLines.push(`Characters present: ${(sceneMetadata.charactersPresent as string[]).join(', ')}`);
  }
  if (Array.isArray(sceneMetadata.themes) && (sceneMetadata.themes as string[]).length > 0) {
    metaLines.push(`Themes: ${(sceneMetadata.themes as string[]).join(', ')}`);
  }
  if (sceneMetadata.synopsis) metaLines.push(`Synopsis: ${sceneMetadata.synopsis}`);

  const userPrompt = [
    storyContextBlock(storyContext),
    `Scene title: ${title ?? 'Untitled'}`,
    metaLines.length > 0 ? `\nScene metadata:\n${metaLines.join('\n')}` : '',
    notes ? `\nAuthor notes:\n${stripHTML(notes)}` : '',
    '',
    'Scene text:',
    truncatedText,
  ].filter(s => s !== undefined).join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { suggestions: Array<{ name: string; reason: string }> };
    if (!parsed || !Array.isArray(parsed.suggestions)) {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ suggestions: parsed.suggestions, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/tags ────────────────────────────────────────────────────────

aiRouter.post('/tags', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const {
    title,
    content,
    objectType = 'scene',
    allProjectTags = [],
    mode = 'metadata_assistance',
    allowDrafting = false,
    storyContext,
  } = req.body as {
    title?: string;
    content?: string;
    objectType?: string;
    allProjectTags?: string[];
    mode?: string;
    allowDrafting?: boolean;
    storyContext?: string;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 12000);
  const preamble = modePreamble(mode, allowDrafting);

  const existingTagList = allProjectTags.length > 0
    ? `Existing project tags: ${allProjectTags.join(', ')}`
    : 'No existing tags in the project yet.';

  const systemPrompt = [
    `You are a writing assistant helping a novelist tag their ${objectType} for organization.`,
    preamble,
    'Your task: suggest relevant tags for the provided text.',
    storyContext ? 'A Story Brief with full manuscript context is included in the user message — use it to suggest tags that are relevant to this story\'s specific themes, characters, and locations.' : '',
    'Rules:',
    '- Prefer existing project tags where relevant (exact name matches).',
    '- New tag suggestions should be short (1–3 words), lowercase.',
    '- Do not suggest tags already applied.',
    '- Aim for 3–6 total suggestions.',
    existingTagList,
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      existingMatches: ['exact name of existing tag that applies'],
      newSuggestions: ['new tag name'],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    storyContextBlock(storyContext),
    `Title: ${title ?? 'Untitled'}`,
    `Type: ${objectType}`,
    '',
    'Content:',
    truncatedText,
  ].join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { existingMatches: string[]; newSuggestions: string[] };
    if (!parsed || !Array.isArray(parsed.existingMatches) || !Array.isArray(parsed.newSuggestions)) {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/generate-brief ──────────────────────────────────────────────

const BRIEF_MAX_CHARS = 600_000;

aiRouter.post('/generate-brief', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) {
    res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' });
    return;
  }

  const { scenes } = req.body as {
    scenes: Array<{ id: string; title: string; text: string }>;
  };

  if (!scenes || scenes.length === 0) {
    res.status(400).json({ error: 'No manuscript content found. Add some scenes first.' });
    return;
  }

  let manuscriptText = scenes
    .map((s) => `=== ${s.title} ===\n${s.text}`)
    .join('\n\n');

  let truncated = false;
  if (manuscriptText.length > BRIEF_MAX_CHARS) {
    manuscriptText = manuscriptText.slice(0, BRIEF_MAX_CHARS);
    truncated = true;
  }

  const systemPrompt = [
    'You are a literary assistant helping a novelist understand their work in progress.',
    'DO NOT DRAFT PROSE: Your output is analytical only.',
    'Your task: read the provided manuscript scenes and produce a comprehensive Story Brief.',
    'This Brief will be injected as background context into all future AI writing-assistance sessions, so it must be accurate, specific, and genuinely useful to an AI analysing individual scenes.',
    '',
    'Write the Brief as clear prose under these exact headings:',
    '',
    '## PREMISE & OVERVIEW',
    'What is this story about? (2–4 sentences covering the core situation, stakes, and world.)',
    '',
    '## CHARACTERS',
    'All named characters: who they are, their role in the story, key relationships, and where they currently stand — emotionally, physically, and narratively — based on the scenes provided.',
    '',
    '## PLOT AS WRITTEN',
    'What has actually been written — the key events in narrative terms. What has happened. What has changed. What has been set in motion. (Not what might happen — only what is on the page.)',
    '',
    '## ACTIVE THREADS',
    'Plotlines, conflicts, tensions, and questions that are currently unresolved or building in the text.',
    '',
    '## TONE & VOICE',
    'The emotional register, style, and feel of the prose. What kind of story is this? What is its atmosphere and sensibility?',
    '',
    '## TIMELINE & SETTING',
    'Key dates, time references, locations, and world-building details established in the text.',
    '',
    '## GAPS & OPEN QUESTIONS',
    'What appears to be missing, unwritten, or unresolved? What is implied but not yet on the page?',
    '',
    'Be specific: name characters, reference actual events and scenes. Never be vague or generic.',
    'Return the brief as plain text only — no JSON, no code fences, no preamble.',
  ].join('\n');

  const userPrompt = [
    `Manuscript (${scenes.length} scene${scenes.length !== 1 ? 's' : ''}):`,
    '',
    manuscriptText,
    truncated ? '\n\n[Note: manuscript was truncated due to length — analysis covers the first portion only]' : '',
  ].join('\n');

  try {
    const brief = (await callAI(config, systemPrompt, userPrompt, 8192)).trim();
    if (!brief) {
      res.status(502).json({ error: 'AI returned an empty response. Try again.' });
      return;
    }
    res.json({ brief, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});
