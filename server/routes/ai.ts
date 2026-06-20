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

  const { title, content, synopsis, category, mode = 'questions_only', allowDrafting = false } = req.body as {
    title?: string;
    content?: string;
    synopsis?: string;
    category?: string;
    mode?: string;
    allowDrafting?: boolean;
  };

  if (!content && !synopsis) {
    res.status(400).json({ error: 'No content provided. Select a scene with text to analyze.' });
    return;
  }

  const plainText = stripHTML(content ?? '');
  const { text: truncatedText, truncated } = truncate(plainText);

  const preamble = modePreamble(mode, allowDrafting);
  const categoryHint = category && category !== 'any'
    ? `Focus your questions on the category: ${category}.`
    : 'Cover a range of craft categories.';

  const systemPrompt = [
    'You are a writing coach helping a novelist think more deeply about their work.',
    preamble,
    'Your task: generate 5–8 insightful craft questions about the scene or text provided.',
    'Rules:',
    '- Ask questions only. Never draft prose, dialogue, or scene content.',
    '- Make questions specific to the provided text, not generic.',
    '- Questions should provoke thought, not suggest answers.',
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
    `Scene title: ${title ?? 'Untitled'}`,
    synopsis ? `Synopsis: ${synopsis}` : '',
    '',
    'Scene text:',
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
