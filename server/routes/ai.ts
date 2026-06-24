import { Router, Request, Response } from 'express';
import { getAIConfig, callAI, extractJSON } from '../lib/ai.js';
import { stripHTML, truncate, modePreamble } from '../lib/context.js';

export const aiRouter = Router();

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
  } = req.body as {
    title?: string;
    content?: string;
    synopsis?: string;
    category?: string;
    objectType?: string;
    extractFromNote?: boolean;
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content && !synopsis) {
    res.status(400).json({ error: 'No content provided. Select an item with text to analyze.' });
    return;
  }

  const plainText = stripHTML(content ?? '');
  const { text: truncatedText, truncated } = truncate(plainText);

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

  const { title, content, objectType = 'scene', mode = 'analysis_only', allowDrafting = false } = req.body as {
    title?: string;
    content?: string;
    objectType?: string;
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText);
  const preamble = modePreamble(mode, allowDrafting);

  const systemPrompt = [
    `You are a writing assistant helping a novelist organize their manuscript (${objectType}).`,
    preamble,
    'Your task: produce a concise, analytical summary of the provided text.',
    'Rules:',
    '- Summarize only. Do not draft new prose or suggest rewrites.',
    '- Be specific to the provided text.',
    '- The summary should describe what happens, not evaluate it.',
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

  const { title, content, mode = 'metadata_assistance', allowDrafting = false } = req.body as {
    title?: string;
    content?: string;
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content) {
    res.status(400).json({ error: 'No scene content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText);
  const preamble = modePreamble(mode, allowDrafting);

  const systemPrompt = [
    'You are a writing assistant helping a novelist organize scene metadata.',
    preamble,
    'Your task: suggest metadata values based ONLY on evidence in the provided scene text.',
    'Rules:',
    '- Only suggest values supported by the text. Leave fields as empty string or 0 if not evident.',
    '- Do not invent details not present in the text.',
    '- emotionalTemperature and tensionLevel are integers 1–10.',
    '- suggestedTags should be short (1–3 words), useful for manuscript organization.',
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      synopsis: '2–3 sentence synopsis of what happens in the scene',
      povCharacter: 'Name of the POV character, or empty string',
      charactersPresent: ['Character names physically present in the scene'],
      location: 'Primary location, or empty string',
      timelineDateClue: 'Any date/time references found in the text, or empty string',
      emotionalTemperature: 5,
      tensionLevel: 5,
      themes: ['theme or motif present in the scene'],
      motifs: ['recurring symbol or motif'],
      sceneFunction: 'What this scene accomplishes narratively (1 sentence)',
      whatChanged: 'What shifted by the end of the scene (1 sentence)',
      unansweredQuestions: ['Question this scene raises but does not answer'],
      suggestedTags: ['tag1', 'tag2'],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    `Scene title: ${title ?? 'Untitled'}`,
    '',
    'Scene text:',
    truncatedText,
  ].join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.synopsis !== 'string') {
      res.status(502).json({ error: 'AI returned an unexpected format. Try again.' });
      return;
    }
    res.json({ ...parsed, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI call failed: ${msg}` });
  }
});

// ── POST /api/ai/codex-extract ───────────────────────────────────────────────

const CODEX_EXTRACT_SYSTEM = [
  'You are a writing assistant helping a novelist build a world-bible (Codex) from their manuscript.',
  'DO NOT DRAFT PROSE: Your output is analytical only.',
  'Your task: extract and identify all significant named entities from the provided manuscript scenes.',
  'Rules:',
  '- Extract only entities that are clearly named and appear meaningfully in the text.',
  '- Do NOT invent details not stated in the text.',
  '- Deduplicate: if the same entity appears in multiple scenes, create ONE entry.',
  '- Descriptions should be factual, present-tense, 2–4 sentences.',
  '- Only include type-specific fields when there is actual evidence in the text.',
  '- CRITICAL: Carefully classify each entity by its type—do NOT default to "character" for everything.',
  '',
  'Entity types with classification rules:',
  '- character: A named person or being with agency (can act, speak, make decisions). Examples: "Sarah," "King Arthur," "the captain," "Aunt Rose"',
  '- place: A named location, setting, building, or region. Examples: "Manhattan," "the library," "The Purple Rose café," "Wales," "the kitchen," "Room 412"',
  '- object: A named physical object with narrative significance. Examples: "the dagger," "Tesla\'s journal," "the red car," "the portrait"',
  '- motif: A recurring symbol, image, or pattern that repeats across the text. Examples: "the broken clock," "water imagery," "the maze," "the letter"',
  '- institution: A named organization, company, group, government, or system. Examples: "The Academy," "MIT," "the Mafia," "the Church," "Parliament"',
  '- event: A named past, current, or future event referenced in the text. Examples: "the War," "the Coup," "the Reunion," "the Festival"',
  '- theme: A broad thematic concern strongly present in the text. Examples: "loss," "identity," "corruption," "redemption"',
  '',
  'CLASSIFICATION GUIDANCE:',
  '- If it\'s a location/place where things happen → place, NOT character',
  '- If it\'s a person/being → character',
  '- If it\'s a thing/item that can be held → object',
  '- If it\'s an organization/institution → institution',
  '',
  'Return ONLY valid JSON in this exact structure:',
  JSON.stringify({
    entries: [
      {
        name: 'Entity name',
        codexType: 'character',
        description: '2-4 sentence description grounded in the text',
        aliases: ['alternative names found in text'],
        role: 'protagonist|antagonist|supporting|minor (character only)',
        pronouns: 'Pronouns used for this character in the text, e.g. she/her (character only)',
        relationships: 'Key relationships mentioned (character only)',
        physicalDetails: 'Physical description from text (character only)',
        atmosphere: 'Mood and sensory details as described (place only)',
        meaning: 'Symbolic meaning or narrative function (motif/object only)',
        appearances: 'Where and how it appears in the text (motif/object only)',
      },
    ],
  }),
].join('\n');

const CHUNK_SIZE = 20000;

function chunkScenes(scenes: Array<{ id: string; title: string; text: string }>): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const scene of scenes) {
    const block = `=== ${scene.title} ===\n${scene.text}`;
    if (current.length > 0 && current.length + block.length + 2 > CHUNK_SIZE) {
      chunks.push(current);
      current = block;
    } else {
      current = current.length > 0 ? current + '\n\n' + block : block;
    }
    // If a single scene exceeds the chunk size, hard-truncate it
    if (current.length > CHUNK_SIZE) {
      current = current.slice(0, CHUNK_SIZE);
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

interface RawEntry {
  name?: string;
  codexType?: string;
  [key: string]: unknown;
}

function mergeEntries(allEntries: RawEntry[]): RawEntry[] {
  const seen = new Map<string, RawEntry>();
  for (const entry of allEntries) {
    if (!entry.name || !entry.codexType) continue;
    const key = `${entry.codexType}::${String(entry.name).toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.set(key, entry);
    } else {
      // Merge: keep existing but fill in any missing fields from the later chunk
      const existing = seen.get(key)!;
      for (const [k, v] of Object.entries(entry)) {
        if (v && !existing[k]) existing[k] = v;
      }
    }
  }
  return Array.from(seen.values());
}

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

  const chunks = chunkScenes(scenes);

  try {
    const chunkResults = await Promise.all(
      chunks.map((chunkText, i) => {
        const userPrompt = [
          `Manuscript chunk ${i + 1} of ${chunks.length}. Extract all significant named entities.`,
          '',
          chunkText,
        ].join('\n');
        return callAI(config, CODEX_EXTRACT_SYSTEM, userPrompt, 4096).then((raw) => {
          const parsed = extractJSON(raw) as { entries: RawEntry[] };
          return Array.isArray(parsed?.entries) ? parsed.entries : [];
        });
      }),
    );

    const merged = mergeEntries(chunkResults.flat());
    res.json({ entries: merged, truncated: false });
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

  const { title, content, objectType = 'fragment', mode = 'analysis_only', allowDrafting = false } = req.body as {
    title?: string;
    content?: string;
    objectType?: string;
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText);
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
    allProjectPlotlines = [],
    mode = 'metadata_assistance',
    allowDrafting = false,
  } = req.body as {
    title?: string;
    content?: string;
    allProjectPlotlines?: string[];
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 4000);
  const preamble = modePreamble(mode, allowDrafting);

  const existingList = allProjectPlotlines.length > 0
    ? `Existing plotlines in this project: ${allProjectPlotlines.join(', ')}`
    : 'No existing plotlines defined in this project yet.';

  const systemPrompt = [
    'You are a writing assistant helping a novelist identify which narrative thread or plotline a scene belongs to.',
    preamble,
    'Your task: suggest 1–3 plotline or narrative thread names for the provided scene.',
    'Rules:',
    '- Prefer existing project plotlines where relevant (exact name matches).',
    '- If no existing plotline fits, suggest a concise new name (2–5 words).',
    '- Each suggestion must include a brief reason grounded in the scene text.',
    '- Do not invent details not in the text.',
    existingList,
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      suggestions: [
        { name: 'Plotline or thread name', reason: 'One sentence grounding this in the scene text' },
      ],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [`Scene title: ${title ?? 'Untitled'}`, '', 'Scene text:', truncatedText].join('\n');

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
  } = req.body as {
    title?: string;
    content?: string;
    objectType?: string;
    allProjectTags?: string[];
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content) {
    res.status(400).json({ error: 'No content provided.' });
    return;
  }

  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 4000);
  const preamble = modePreamble(mode, allowDrafting);

  const existingTagList = allProjectTags.length > 0
    ? `Existing project tags: ${allProjectTags.join(', ')}`
    : 'No existing tags in the project yet.';

  const systemPrompt = [
    `You are a writing assistant helping a novelist tag their ${objectType} for organization.`,
    preamble,
    'Your task: suggest relevant tags for the provided text.',
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

  const userPrompt = [`Title: ${title ?? 'Untitled'}`, `Type: ${objectType}`, '', 'Content:', truncatedText].join('\n');

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
