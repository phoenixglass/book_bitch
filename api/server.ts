import Anthropic from '@anthropic-ai/sdk';
import express, { type Request, type Response } from 'express';
import {
  metadataSystemPrompt,
  metadataUserPrompt,
  CODEX_EXTRACT_SYSTEM,
  chunkCodexItems,
  codexUserPrompt,
  mergeCodexEntries,
  type RawCodexEntry,
} from '../server/lib/aiPrompts.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxChars = 8000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + '\n\n[Content truncated — too long for a single AI call]',
    truncated: true,
  };
}

function modePreamble(mode: string, allowDrafting: boolean): string {
  const lines: string[] = [];
  if (mode === 'questions_only') {
    lines.push(
      'STRICT MODE — QUESTIONS ONLY: You must ONLY ask questions.',
      'Never write prose, dialogue, scene content, or narrative summaries.',
      'If asked for a summary, produce bullet points only — no flowing prose.',
    );
  } else if (!allowDrafting) {
    lines.push(
      'DO NOT DRAFT PROSE: Do not write new manuscript content, dialogue, scene continuations, or narrative text.',
      'Your output is analytical only.',
    );
  }
  return lines.join('\n');
}

function extractJSON(rawText: string): unknown {
  const text = rawText.trim();
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* fall through */ } }
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(text.slice(objStart, objEnd + 1)); } catch { /* fall through */ }
  }
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch { /* fall through */ }
  }
  throw new Error('Could not extract valid JSON from AI response');
}

// ── AI Config ──────────────────────────────────────────────────────────────

interface AIConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey: string;
  baseUrl?: string;
}

function getAIConfig(): AIConfig | null {
  // Auto-detect provider from whichever key is present
  const explicitProvider = process.env.AI_PROVIDER?.trim();

  if (explicitProvider === 'openai' || (!explicitProvider && process.env.OPENAI_API_KEY?.trim())) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      provider: 'openai',
      model: process.env.AI_MODEL?.trim() || 'gpt-4o-mini',
      apiKey,
      baseUrl: process.env.AI_BASE_URL?.trim(),
    };
  }

  if (!explicitProvider || explicitProvider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      provider: 'anthropic',
      model: process.env.AI_MODEL?.trim() || 'claude-haiku-4-5-20251001',
      apiKey,
    };
  }

  return null;
}

async function callAI(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048,
): Promise<string> {
  if (config.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: config.apiKey });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text response from Anthropic');
    return block.text;
  }

  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

// ── Express app ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '50mb' }));

// GET /api/ai/status
app.get('/api/ai/status', (_req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.json({ configured: false }); return; }
  res.json({ configured: true, provider: config.provider, model: config.model });
});

// POST /api/ai/questions
app.post('/api/ai/questions', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }

  const {
    title, content, synopsis, category,
    objectType = 'scene', extractFromNote = false,
    mode = 'questions_only', allowDrafting = false,
  } = req.body as Record<string, unknown> & { title?: string; content?: string; synopsis?: string; category?: string; objectType?: string; extractFromNote?: boolean; mode?: string; allowDrafting?: boolean };

  if (!content && !synopsis) { res.status(400).json({ error: 'No content provided.' }); return; }

  const plainText = stripHTML(content ?? '');
  const { text: truncatedText, truncated } = truncate(plainText);
  const preamble = modePreamble(mode ?? 'questions_only', allowDrafting ?? false);
  const categoryHint = category && category !== 'any'
    ? `Focus your questions on the category: ${category}.`
    : 'Cover a range of craft categories.';
  const objectLabel = ({ scene: 'scene', fragment: 'fragment', omitted_material: 'omitted material item', notebook_entry: 'notebook entry', codex_entry: 'codex entry', question: 'project question', moodboard_item: 'moodboard item' } as Record<string, string>)[objectType ?? 'scene'] ?? objectType;
  const taskDesc = extractFromNote
    ? `Your task: extract 4–8 open questions that are explicitly or implicitly present in the provided ${objectLabel}.`
    : `Your task: generate 5–8 insightful craft questions about the ${objectLabel} provided.`;

  const systemPrompt = [`You are a writing coach helping a novelist think more deeply about their work.`, preamble, taskDesc, 'Rules:', '- Ask questions only. Never draft prose, dialogue, or scene content.', '- Make questions specific to the provided text, not generic.', '- Questions should provoke thought, not suggest answers.', categoryHint, '', 'Return ONLY valid JSON in this exact structure, no other text:', JSON.stringify({ questions: [{ text: 'The question text', category: 'plot|character|timeline|research|structure|theme|continuity|worldbuilding|emotional_logic|other', priority: 'low|medium|high', reason: 'One sentence explaining why this matters for this text' }] })].filter(Boolean).join('\n');
  const userPrompt = [`${(objectLabel ?? 'scene').charAt(0).toUpperCase() + (objectLabel ?? 'scene').slice(1)} title: ${title ?? 'Untitled'}`, synopsis ? `Synopsis: ${synopsis}` : '', '', `${(objectLabel ?? 'scene').charAt(0).toUpperCase() + (objectLabel ?? 'scene').slice(1)} text:`, truncatedText, truncated ? '\n[Note: content was truncated]' : ''].filter(s => s !== undefined).join('\n');

  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { questions: unknown[] };
    if (!parsed || !Array.isArray(parsed.questions)) { res.status(502).json({ error: 'AI returned an unexpected format. Try again.' }); return; }
    res.json({ questions: parsed.questions, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/summarize
app.post('/api/ai/summarize', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { title, content, objectType = 'scene', mode = 'analysis_only', allowDrafting = false } = req.body as { title?: string; content?: string; objectType?: string; mode?: string; allowDrafting?: boolean };
  if (!content) { res.status(400).json({ error: 'No content provided.' }); return; }
  const { text: truncatedText, truncated } = truncate(stripHTML(content));
  const systemPrompt = [`You are a writing assistant helping a novelist organize their manuscript (${objectType}).`, modePreamble(mode ?? 'analysis_only', allowDrafting ?? false), 'Your task: produce a concise, analytical summary of the provided text.', 'Rules:', '- Summarize only. Do not draft new prose or suggest rewrites.', '- Be specific to the provided text.', '- The summary should describe what happens, not evaluate it.', '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ summary: '2–4 sentence narrative summary', bulletPoints: ['Key event or detail'], characters: ['Character names'], places: ['Locations'], motifs: ['Recurring themes'], suggestedTags: ['tag'], unansweredQuestions: ['Question raised but not resolved'] })].filter(Boolean).join('\n');
  const userPrompt = [`Title: ${title ?? 'Untitled'}`, `Type: ${objectType}`, '', 'Content:', truncatedText].join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { summary: string };
    if (!parsed || typeof parsed.summary !== 'string') { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/metadata
app.post('/api/ai/metadata', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const {
    title, content, mode = 'metadata_assistance', allowDrafting = false,
    storyContext, existingMetadata = {}, relevantCodex = [], projectStructure,
  } = req.body as {
    title?: string; content?: string; mode?: string; allowDrafting?: boolean;
    storyContext?: string; existingMetadata?: Record<string, unknown>;
    relevantCodex?: string[]; projectStructure?: string;
  };
  if (!content) { res.status(400).json({ error: 'No scene content provided.' }); return; }
  const { text: truncatedText, truncated } = truncate(stripHTML(content), 40000);
  const briefIncluded = !!storyContext?.trim();
  const systemPrompt = metadataSystemPrompt(modePreamble(mode ?? 'metadata_assistance', allowDrafting ?? false), briefIncluded);
  const userPrompt = metadataUserPrompt({ title, storyContext, existingMetadata, relevantCodex, projectStructure, chapterText: truncatedText });
  try {
    const raw = await callAI(config, systemPrompt, userPrompt, 3072);
    const parsed = extractJSON(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.synopsis !== 'string') { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, briefIncluded, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/codex-extract
app.post('/api/ai/codex-extract', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { scenes } = req.body as { scenes: Array<{ id: string; title: string; text: string }> };
  if (!scenes || scenes.length === 0) { res.status(400).json({ error: 'No scenes provided. Select content to analyze.' }); return; }

  // Strip HTML once, drop empties, then chunk by item boundary so EVERY item is
  // analyzed — never silently truncated to the first few chapters.
  const prepared = scenes
    .map((s) => ({ id: s.id, title: s.title || 'Untitled', text: stripHTML(s.text ?? '') }))
    .filter((s) => s.text.length > 0);
  if (prepared.length === 0) { res.status(400).json({ error: 'Selected items contain no text to analyze.' }); return; }

  const totalWordCount = prepared.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const chunks = chunkCodexItems(prepared);

  try {
    const chunkResults = await Promise.all(
      chunks.map((chunk, i) => {
        const userPrompt = codexUserPrompt(chunk, i, chunks.length);
        return callAI(config, CODEX_EXTRACT_SYSTEM, userPrompt, 8192)
          .then((raw) => {
            try {
              const parsed = extractJSON(raw);
              if (Array.isArray(parsed)) return parsed as RawCodexEntry[];
              const obj = parsed as { entries?: RawCodexEntry[] };
              return Array.isArray(obj?.entries) ? obj.entries : [];
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
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/placement
app.post('/api/ai/placement', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { title, content, objectType = 'fragment', mode = 'analysis_only', allowDrafting = false } = req.body as { title?: string; content?: string; objectType?: string; mode?: string; allowDrafting?: boolean };
  if (!content) { res.status(400).json({ error: 'No content provided.' }); return; }
  const { text: truncatedText, truncated } = truncate(stripHTML(content));
  const isOmitted = objectType === 'omitted_material';
  const systemPrompt = [`You are a writing assistant helping a novelist evaluate ${isOmitted ? 'omitted material' : 'a fragment'} for potential use or restoration.`, modePreamble(mode ?? 'analysis_only', allowDrafting ?? false), isOmitted ? 'Your task: analyse the structural and thematic significance of this cut material, and suggest whether and how it might be restored or repurposed.' : 'Your task: suggest where and how this fragment might be placed or used within the manuscript.', 'Rules:', '- Do not draft new prose. Analyse only.', '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ rationale: '2–3 sentence analysis', suggestions: ['Specific suggestion'], possibleScenes: ['Description of scene type'] })].filter(Boolean).join('\n');
  const userPrompt = [`Title: ${title ?? 'Untitled'}`, `Type: ${objectType}`, '', 'Content:', truncatedText].join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { rationale: string };
    if (!parsed || typeof parsed.rationale !== 'string') { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/codex-suggest
app.post('/api/ai/codex-suggest', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { title, content, codexType = 'custom', existingNotes = '', existingFields = {}, mode = 'analysis_only', allowDrafting = false } = req.body as { title?: string; content?: string; codexType?: string; existingNotes?: string; existingFields?: Record<string, unknown>; mode?: string; allowDrafting?: boolean };
  if (!content && !existingNotes) { res.status(400).json({ error: 'No content provided.' }); return; }
  const { text: truncatedDesc, truncated } = truncate([stripHTML(content ?? ''), existingNotes].filter(Boolean).join('\n\n'));
  const existingSummary = Object.entries(existingFields).filter(([, v]) => v && typeof v === 'string' && (v as string).trim()).map(([k, v]) => `${k}: ${v}`).join('\n');
  const systemPrompt = [`You are a writing assistant helping a novelist enrich their world-bible codex entry for a ${codexType}.`, modePreamble(mode ?? 'analysis_only', allowDrafting ?? false), 'Your task: identify missing or incomplete information and suggest what might be worth developing.', '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ fieldSuggestions: [{ field: 'field name', value: 'suggested content', reason: 'why this matters' }], contradictions: ['Any apparent contradiction'], openQuestions: ['An unresolved question'] })].filter(Boolean).join('\n');
  const userPrompt = [`Codex entry: ${title ?? 'Untitled'}`, `Type: ${codexType}`, existingSummary ? `\nExisting fields:\n${existingSummary}` : '', '', 'Description and notes:', truncatedDesc].filter(Boolean).join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { fieldSuggestions: unknown[] };
    if (!parsed || !Array.isArray(parsed.fieldSuggestions)) { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/refine-question
app.post('/api/ai/refine-question', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { title, content, questionText, currentCategory = '', currentPriority = '', notes = '', answer = '', mode = 'analysis_only', allowDrafting = false } = req.body as { title?: string; content?: string; questionText?: string; currentCategory?: string; currentPriority?: string; notes?: string; answer?: string; mode?: string; allowDrafting?: boolean };
  const qText = questionText ?? title ?? content ?? '';
  if (!qText.trim()) { res.status(400).json({ error: 'No question text provided.' }); return; }
  const context = [notes ? `Author notes: ${notes}` : '', answer ? `Partial answer: ${answer}` : ''].filter(Boolean).join('\n');
  const systemPrompt = ['You are a writing coach helping a novelist clarify and sharpen their craft questions.', modePreamble(mode ?? 'analysis_only', allowDrafting ?? false), 'Your task: refine the provided question to make it more focused, specific, and generative.', 'Rules:', '- Do not answer the question. Improve its phrasing only.', '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ refined: 'The refined question', suggestedCategory: 'plot|character|timeline|research|structure|theme|continuity|worldbuilding|emotional_logic|other', suggestedPriority: 'low|medium|high', rationale: 'One sentence explaining what was sharpened', relatedQuestions: ['A related question'] })].filter(Boolean).join('\n');
  const userPrompt = [`Original question: ${qText}`, currentCategory ? `Current category: ${currentCategory}` : '', currentPriority ? `Current priority: ${currentPriority}` : '', context].filter(Boolean).join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { refined: string };
    if (!parsed || typeof parsed.refined !== 'string') { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, truncated: false });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/tags
app.post('/api/ai/tags', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { title, content, objectType = 'scene', allProjectTags = [], mode = 'metadata_assistance', allowDrafting = false } = req.body as { title?: string; content?: string; objectType?: string; allProjectTags?: string[]; mode?: string; allowDrafting?: boolean };
  if (!content) { res.status(400).json({ error: 'No content provided.' }); return; }
  const { text: truncatedText, truncated } = truncate(stripHTML(content), 4000);
  const existingTagList = allProjectTags.length > 0 ? `Existing project tags: ${allProjectTags.join(', ')}` : 'No existing tags in the project yet.';
  const systemPrompt = [`You are a writing assistant helping a novelist tag their ${objectType} for organization.`, modePreamble(mode ?? 'metadata_assistance', allowDrafting ?? false), 'Your task: suggest relevant tags for the provided text.', 'Rules:', '- Prefer existing project tags where relevant.', '- New tag suggestions should be short (1–3 words), lowercase.', '- Aim for 3–6 total suggestions.', existingTagList, '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ existingMatches: ['exact name of existing tag'], newSuggestions: ['new tag name'] })].filter(Boolean).join('\n');
  const userPrompt = [`Title: ${title ?? 'Untitled'}`, `Type: ${objectType}`, '', 'Content:', truncatedText].join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as { existingMatches: string[]; newSuggestions: string[] };
    if (!parsed || !Array.isArray(parsed.existingMatches) || !Array.isArray(parsed.newSuggestions)) { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/plotline
app.post('/api/ai/plotline', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { title, content, notes = '', sceneMetadata = {}, allProjectPlotlines = [], mode = 'metadata_assistance', allowDrafting = false, storyContext } = req.body as { title?: string; content?: string; notes?: string; sceneMetadata?: Record<string, unknown>; allProjectPlotlines?: string[]; mode?: string; allowDrafting?: boolean; storyContext?: string };
  if (!content) { res.status(400).json({ error: 'No content provided.' }); return; }
  const plainText = stripHTML(content);
  const { text: truncatedText, truncated } = truncate(plainText, 48000);
  const preamble = modePreamble(mode ?? 'metadata_assistance', allowDrafting ?? false);
  const existingList = allProjectPlotlines.length > 0 ? `Existing plotlines in this project: ${allProjectPlotlines.join(', ')}` : 'No existing plotlines defined in this project yet.';

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
    JSON.stringify({ suggestions: [{ name: 'First plotline or thread name', reason: 'One sentence grounding this in the scene text' }, { name: 'Second plotline or thread name', reason: 'One sentence grounding this in the scene text' }, { name: 'Third plotline or thread name (optional)', reason: 'One sentence grounding this in the scene text' }] }),
  ].filter(Boolean).join('\n');

  const metaLines: string[] = [];
  if ((sceneMetadata as Record<string, unknown>).location) metaLines.push(`Location: ${(sceneMetadata as Record<string, unknown>).location}`);
  if ((sceneMetadata as Record<string, unknown>).povCharacter) metaLines.push(`POV character: ${(sceneMetadata as Record<string, unknown>).povCharacter}`);
  if (Array.isArray((sceneMetadata as Record<string, unknown>).charactersPresent) && ((sceneMetadata as Record<string, unknown>).charactersPresent as string[]).length > 0) {
    metaLines.push(`Characters present: ${((sceneMetadata as Record<string, unknown>).charactersPresent as string[]).join(', ')}`);
  }
  if (Array.isArray((sceneMetadata as Record<string, unknown>).themes) && ((sceneMetadata as Record<string, unknown>).themes as string[]).length > 0) {
    metaLines.push(`Themes: ${((sceneMetadata as Record<string, unknown>).themes as string[]).join(', ')}`);
  }
  if ((sceneMetadata as Record<string, unknown>).synopsis) metaLines.push(`Synopsis: ${(sceneMetadata as Record<string, unknown>).synopsis}`);

  const userPrompt = [
    storyContext ? `[Story Brief]\n${storyContext}\n[End Story Brief]` : '',
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
    if (!parsed || !Array.isArray(parsed.suggestions)) { res.status(502).json({ error: 'AI returned an unexpected format. Try again.' }); return; }
    res.json({ suggestions: parsed.suggestions, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/generate-brief
const BRIEF_MAX_CHARS = 600_000;
app.post('/api/ai/generate-brief', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured. Add an API key in environment settings.' }); return; }
  const { scenes } = req.body as { scenes: Array<{ id: string; title: string; text: string }> };
  if (!scenes || scenes.length === 0) { res.status(400).json({ error: 'No manuscript content found. Add some scenes first.' }); return; }
  let manuscriptText = scenes.map((s) => `=== ${s.title} ===\n${s.text}`).join('\n\n');
  let truncated = false;
  if (manuscriptText.length > BRIEF_MAX_CHARS) { manuscriptText = manuscriptText.slice(0, BRIEF_MAX_CHARS); truncated = true; }
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
    const brief = (await callAI(config, systemPrompt, userPrompt, 4096)).trim();
    if (!brief) { res.status(502).json({ error: 'AI returned an empty response. Try again.' }); return; }
    res.json({ brief, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.get('/api/health', (_req, res) => { res.json({ ok: true, ts: Date.now() }); });

export default app;
