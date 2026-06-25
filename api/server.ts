import Anthropic from '@anthropic-ai/sdk';
import express, { type Request, type Response } from 'express';

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
  const { title, content, mode = 'metadata_assistance', allowDrafting = false } = req.body as { title?: string; content?: string; mode?: string; allowDrafting?: boolean };
  if (!content) { res.status(400).json({ error: 'No scene content provided.' }); return; }
  const { text: truncatedText, truncated } = truncate(stripHTML(content));
  const systemPrompt = ['You are a writing assistant helping a novelist organize scene metadata.', modePreamble(mode ?? 'metadata_assistance', allowDrafting ?? false), 'Your task: suggest metadata values based ONLY on evidence in the provided scene text.', 'Rules:', '- Only suggest values supported by the text.', '- emotionalTemperature and tensionLevel are integers 1–10.', '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ synopsis: '2–3 sentence synopsis', povCharacter: 'Name or empty string', charactersPresent: ['names'], location: 'Primary location or empty string', timelineDateClue: 'Date/time references or empty string', emotionalTemperature: 5, tensionLevel: 5, themes: ['theme'], motifs: ['motif'], sceneFunction: 'What this scene accomplishes (1 sentence)', whatChanged: 'What shifted by the end (1 sentence)', unansweredQuestions: ['Question raised'], suggestedTags: ['tag'] })].filter(Boolean).join('\n');
  const userPrompt = [`Scene title: ${title ?? 'Untitled'}`, '', 'Scene text:', truncatedText].join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt);
    const parsed = extractJSON(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.synopsis !== 'string') { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ ...parsed, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// POST /api/ai/codex-extract
app.post('/api/ai/codex-extract', async (req: Request, res: Response) => {
  const config = getAIConfig();
  if (!config) { res.status(503).json({ error: 'AI is not configured.' }); return; }
  const { scenes } = req.body as { scenes: Array<{ id: string; title: string; text: string }> };
  if (!scenes || scenes.length === 0) { res.status(400).json({ error: 'No scenes provided.' }); return; }
  const combinedText = scenes.map((s) => `=== ${s.title} ===\n${s.text}`).join('\n\n');
  const { text: truncatedText, truncated } = truncate(combinedText, 20000);
  const systemPrompt = ['You are a writing assistant helping a novelist build a world-bible (Codex) from their manuscript.', 'DO NOT DRAFT PROSE: Your output is analytical only.', 'Your task: extract and identify all significant named entities from the provided manuscript scenes.', 'Rules:', '- Extract only entities that are clearly named and appear meaningfully in the text.', '- Do NOT invent details not stated in the text.', '- Deduplicate: if the same entity appears in multiple scenes, create ONE entry.', '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ entries: [{ name: 'Entity name', codexType: 'character', description: '2-4 sentence description', aliases: ['alternative names'], role: 'protagonist|antagonist|supporting|minor', relationships: 'Key relationships', physicalDetails: 'Physical description', atmosphere: 'Mood and sensory details', meaning: 'Symbolic meaning', appearances: 'Where and how it appears' }] })].join('\n');
  const userPrompt = [`Manuscript: ${scenes.length} scene(s). Extract all significant named entities.`, '', truncatedText, truncated ? '\n[Content truncated]' : ''].join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt, 4096);
    const parsed = extractJSON(raw) as { entries: unknown[] };
    if (!parsed || !Array.isArray(parsed.entries)) { res.status(502).json({ error: 'AI returned an unexpected format.' }); return; }
    res.json({ entries: parsed.entries, truncated });
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
  const { title, content, allProjectPlotlines = [], mode = 'metadata_assistance', allowDrafting = false } = req.body as { title?: string; content?: string; allProjectPlotlines?: string[]; mode?: string; allowDrafting?: boolean };
  if (!content) { res.status(400).json({ error: 'No content provided.' }); return; }
  const { text: truncatedText, truncated } = truncate(stripHTML(content), 4000);
  const existingList = allProjectPlotlines.length > 0 ? `Existing plotlines in this project: ${allProjectPlotlines.join(', ')}` : 'No existing plotlines defined in this project yet.';
  const systemPrompt = ['You are a writing assistant helping a novelist identify which narrative thread or plotline a scene belongs to.', modePreamble(mode ?? 'metadata_assistance', allowDrafting ?? false), 'Your task: suggest 1–3 plotline or narrative thread names for the provided scene.', 'Rules:', '- Prefer existing project plotlines where relevant (exact name matches).', '- If no existing plotline fits, suggest a concise new name (2–5 words).', '- Each suggestion must include a brief reason grounded in the scene text.', '- Do not invent details not in the text.', existingList, '', 'Return ONLY valid JSON in this exact structure:', JSON.stringify({ suggestions: [{ name: 'Plotline or thread name', reason: 'One sentence grounding this in the scene text' }] })].filter(Boolean).join('\n');
  const userPrompt = [`Scene title: ${title ?? 'Untitled'}`, '', 'Scene text:', truncatedText].join('\n');
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
    'Return ONLY valid JSON: { "brief": "the full story brief text" }',
  ].join('\n');
  const userPrompt = [
    `Manuscript (${scenes.length} scene${scenes.length !== 1 ? 's' : ''}):`,
    '',
    manuscriptText,
    truncated ? '\n\n[Note: manuscript was truncated due to length — analysis covers the first portion only]' : '',
  ].join('\n');
  try {
    const raw = await callAI(config, systemPrompt, userPrompt, 4096);
    const parsed = extractJSON(raw) as { brief: string };
    if (!parsed || typeof parsed.brief !== 'string') { res.status(502).json({ error: 'AI returned an unexpected format. Try again.' }); return; }
    res.json({ brief: parsed.brief, truncated });
  } catch (err) {
    res.status(502).json({ error: `AI call failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.get('/api/health', (_req, res) => { res.json({ ok: true, ts: Date.now() }); });

export default app;
