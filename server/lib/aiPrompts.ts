// Shared AI prompt + parsing logic for Codex extraction and chapter metadata.
// Imported by both the local dev server (server/routes/ai.ts) and the deployed
// serverless entry (api/server.ts) so the two never drift.

// ── Chapter metadata (Story Brief is PRIMARY context) ────────────────────────

export function metadataSystemPrompt(preamble: string, briefIncluded: boolean): string {
  return [
    'You are a writing assistant helping a novelist build chapter-level metadata for their manuscript.',
    preamble,
    briefIncluded
      ? 'PRIMARY CONTEXT: A saved Story Brief is provided FIRST in the user message. Read it before anything else. It tells you what the whole book is about — premise, central dynamics, characters, tone, structure. Understand THIS chapter in relation to the whole project. Use the Brief to resolve character names and roles: never write "an unidentified woman", "a man", or vague labels when the Brief names them.'
      : 'NOTE: No saved Story Brief was provided. Generate metadata from the chapter content alone and keep confidence modest, since you lack project-level context.',
    'Your task: generate chapter metadata informed FIRST by the Story Brief, then by the chapter content.',
    'Classification rules — do NOT lump everyone together:',
    '- activeCharacters: people who actually function in THIS chapter (act, speak, are present, drive the scene). Not every name mentioned.',
    '- minorReferences: public figures / real-world people / one-off mentions that do NOT act in the chapter. Keep these SEPARATE from activeCharacters.',
    '- institutionsPublications: organizations, government bodies, newspapers, media outlets, publications mentioned. Keep SEPARATE from people.',
    '- emotionalTemperature and tensionLevel are integers 1–10.',
    '- form: classify the item as manuscript | blog_entry | notes | fragment | research | other based on its style.',
    '- Do not invent details not grounded in the chapter or the Brief.',
    '',
    'Return ONLY valid JSON in this exact structure:',
    JSON.stringify({
      synopsis: '2–3 sentence synopsis of what happens in this chapter',
      chapterFunction: 'What this chapter does in the larger story (1–2 sentences, grounded in the Brief)',
      form: 'manuscript | blog_entry | notes | fragment | research | other',
      povCharacter: 'Name of the POV character, or empty string',
      charactersPresent: ['All characters present (kept for backward compatibility)'],
      activeCharacters: ['Characters actively functioning in this chapter'],
      minorReferences: ['Public figures / one-off real-world mentions, NOT story characters'],
      institutionsPublications: ['Institutions, media outlets, publications mentioned'],
      location: 'Primary setting/location, or empty string',
      timelineDateClue: 'Relative/contextual date-time references in the text, or empty string',
      timelineSpecificDate: 'An explicit calendar date if stated, or empty string',
      emotionalTemperature: 5,
      tensionLevel: 5,
      emotionalStakes: 'What is emotionally at stake (1 sentence)',
      centralTension: 'The central tension of the chapter (1 sentence)',
      themes: ['theme present in the chapter'],
      motifs: ['recurring symbol or motif'],
      motifsThemes: ['key motifs/themes (combined)'],
      sceneFunction: 'What this chapter accomplishes narratively (1 sentence)',
      whatChanged: 'What shifts by the end of the chapter (1 sentence)',
      unansweredQuestions: ['Question this chapter raises but does not answer'],
      continuityNotes: ['Continuity note worth tracking'],
      relationshipDynamics: ['Relationship dynamic active in this chapter'],
      suggestedTags: ['tag1', 'tag2'],
      confidence: 0.0,
      reasoning: 'Brief reasoning grounded in the Story Brief + chapter content',
    }),
  ].filter(Boolean).join('\n');
}

export function metadataUserPrompt(opts: {
  title?: string;
  storyContext?: string;
  existingMetadata?: Record<string, unknown>;
  relevantCodex?: string[];
  projectStructure?: string;
  chapterText: string;
}): string {
  const { title, storyContext, existingMetadata = {}, relevantCodex = [], projectStructure, chapterText } = opts;
  const existingLines = Object.entries(existingMetadata)
    .filter(([, v]) => v && (typeof v === 'string' ? v.trim() : (Array.isArray(v) ? v.length : true)))
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  return [
    storyContext?.trim() ? `--- STORY BRIEF (PRIMARY CONTEXT — read first) ---\n${storyContext.trim()}\n--- END STORY BRIEF ---\n` : '',
    relevantCodex.length > 0 ? `Existing Codex entries relevant to this chapter: ${relevantCodex.join(', ')}\n` : '',
    projectStructure?.trim() ? `Project structure / timeline:\n${projectStructure.trim()}\n` : '',
    existingLines.length > 0 ? `Existing metadata on this chapter:\n${existingLines.join('\n')}\n` : '',
    `Chapter title: ${title ?? 'Untitled'}`,
    '',
    'Chapter content (analyze AFTER the Story Brief):',
    chapterText,
  ].filter(Boolean).join('\n');
}

// ── Codex extraction (full-binder chunking + classification + merge) ─────────

export const CODEX_EXTRACT_SYSTEM = [
  'You are a story-bible (Codex) builder for a novelist. You read manuscript excerpts and extract significant entities, classifying each by NARRATIVE FUNCTION — never by capitalization or surface named-entity type alone.',
  'DO NOT DRAFT PROSE. Analytical output only.',
  'ABSOLUTE RULE: Do NOT invent, infer, or hallucinate any entity. Every entity you output MUST be explicitly present in the text provided. You are an extractor, not a predictor — do not add characters, places, or details that "seem like" they might exist in a novel like this. If it is not written in the text, it does not exist.',
  '',
  'CRITICAL TASK — distinguish ACTUAL STORY ENTITIES from PASSING REAL-WORLD REFERENCES:',
  '- An actual story character ACTS in the narrative: speaks, decides, participates in scenes / memory / dialogue / conflict / desire / pressure / relationship dynamics; connects to the protagonist or the central narrative movement; often recurs across chapters. Set isActualStoryCharacter=true.',
  '- A real-world person REFERENCE is merely mentioned — a public figure, political/cultural/media reference, article subject, historical name — and does NOT act inside the story world. Classify as codexType "reference", isActualStoryCharacter=false, isPassingReference=true. NEVER promote these into characters.',
  '- A newspaper, magazine, TV programme, or media outlet is "publication". A government body, agency, company, or organization is "institution". Keep these out of the character list.',
  '- Do not rely on a name being capitalized. A protagonist and the central figure she interacts with are characters; a politician, comedian, or media personality merely named in passing is a "reference"; an outlet like a newspaper is a "publication".',
  '- SELF-CHECK RULE: Before writing each entry, ask: "Does this person speak, act, or appear in a scene with the narrator/protagonist? Or are they only talked about, watched on TV, read about, or invoked as context?" If only the latter → codexType must be "reference", never "character". A real-world figure who prompted the narrator to think or write about something is NOT thereby a character — they remain a reference.',
  '',
  'ENTITY TYPES (choose the single best fit per entity):',
  '- character    : a person/being who acts in the story world',
  '- reference    : a real-world person / cultural / political mention that does NOT act in the story',
  '- place        : a location, setting, region, or building',
  '- object       : a physical object with narrative significance',
  '- motif        : a recurring image, symbol, or pattern',
  '- institution  : an organization, government body, agency, company, or group',
  '- publication  : a newspaper, magazine, TV show, media outlet, blog, or book/article as a source',
  '- event        : a named past, current, or future event',
  '- document     : a specific document/text/source within the story',
  '- theme        : a thematic concern strongly present in the text',
  '- relationship : a named relationship / dynamic between two entities',
  '- custom       : something that genuinely fits none of the above',
  '',
  'CHARACTER TIER (only when codexType is "character") — set characterTier to one of:',
  '- major     : recurs and drives the central tension / primary relationship / arc / emotional logic',
  '- secondary : has clear narrative function; appears more than once or significantly in one section',
  '- minor     : functions as a person in the story world but appears briefly / in limited context',
  '',
  'STRICT GROUNDING RULE: ONLY extract entities that are EXPLICITLY named or described in the text provided. Do NOT infer, assume, or invent entities based on what a story like this might plausibly contain. If you cannot find a verbatim phrase from the text to use as evidence, the entity does not exist in this excerpt — omit it.',
  'For EVERY entity, the evidence field in sourceAppearances MUST be a short verbatim quote (copy-pasted words, max 10–15 words) from the text showing the entity appears. If you cannot produce such a quote, do not include the entity.',
  'Deduplicate within this excerpt: one entry per entity, listing aliases.',
  'Extract every entity that is explicitly named or described in the text — characters who appear by name, real-world figures who are named, locations, institutions, publications, themes. Skip only truly generic unnamed background details.',
  '',
  'CHARACTER BASICS — when codexType is "character", also populate these fields whenever the text explicitly states them (omit the key entirely if it is not stated — never guess, infer, or invent a value):',
  '- role: the character\'s narrative role or relation to the protagonist as described in the text (e.g. "narrator\'s husband", "antagonist", "protagonist\'s therapist").',
  '- physicalDetails: physical appearance, build, or distinguishing features explicitly described in the text.',
  '- relationships: how this character explicitly relates to other named characters, grounded in the text (e.g. "married to Maya", "narrator\'s older brother").',
  '- pronouns: pronouns explicitly used for the character in the text.',
  '- age: age, birth year, or approximate age/generation explicitly stated in the text.',
  'These five fields are supplementary evidence-only extractions, not required — most characters will have some empty. Do not fabricate them to fill gaps.',
  '',
  'OUTPUT FORMAT — NDJSON: output each entity as one complete JSON object on its own line. No outer array, no wrapper object, no markdown fences. If you run out of space, stop after the last complete line — partial objects are useless.',
  'Each line must be a complete, valid JSON object. Two examples showing the character vs reference distinction, including the optional character-basics fields when the text supports them:',
  '{"name":"Maya","codexType":"character","characterTier":"major","confidence":0.95,"description":"Maya is the narrator\'s best friend who appears throughout the story, offering advice and comic relief.","isActualStoryCharacter":true,"isPassingReference":false,"aliases":["May"],"role":"narrator\'s best friend","pronouns":"she/her","physicalDetails":"tall, red-haired, always in motion","sourceAppearances":[{"itemId":"ch1","itemTitle":"Chapter 1","evidence":"Maya laughed and poured another glass"}],"suggestedTags":["friend","recurring"]}',
  '{"name":"Barack Obama","codexType":"reference","characterTier":null,"confidence":0.8,"description":"The 44th US President, invoked by the narrator as a benchmark of political normalcy lost after the 2016 election.","isActualStoryCharacter":false,"isPassingReference":true,"aliases":["Obama"],"sourceAppearances":[{"itemId":"ch2","itemTitle":"Election Night","evidence":"Obama would never have let this happen"}],"suggestedTags":["politics","reference"]}',
].join('\n');

const CODEX_CHUNK_CHARS = 18000;

export interface CodexPreparedItem { id: string; title: string; text: string }

export function chunkCodexItems(items: CodexPreparedItem[]): CodexPreparedItem[][] {
  const chunks: CodexPreparedItem[][] = [];
  let current: CodexPreparedItem[] = [];
  let size = 0;
  for (const item of items) {
    if (item.text.length > CODEX_CHUNK_CHARS) {
      if (current.length) { chunks.push(current); current = []; size = 0; }
      for (let off = 0; off < item.text.length; off += CODEX_CHUNK_CHARS) {
        chunks.push([{ id: item.id, title: item.title, text: item.text.slice(off, off + CODEX_CHUNK_CHARS) }]);
      }
      continue;
    }
    if (size + item.text.length > CODEX_CHUNK_CHARS && current.length) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function codexUserPrompt(chunk: CodexPreparedItem[], index: number, total: number): string {
  const body = chunk
    .map((it) => `[ITEM id="${it.id}" title="${it.title.replace(/"/g, "'")}"]\n${it.text}`)
    .join('\n\n');
  return [
    `Manuscript excerpt — chunk ${index + 1} of ${total}.`,
    'Extract and classify ALL significant entities below. Cite each entity\'s source item id and title in sourceAppearances.',
    '',
    body,
  ].join('\n');
}

export interface RawCodexAppearance { itemId?: string; itemTitle?: string; evidence?: string; context?: string; occurrenceCount?: number }
export interface RawCodexEntry {
  name?: string;
  codexType?: string;
  characterTier?: string | null;
  confidence?: number;
  description?: string;
  narrativeFunction?: string;
  isActualStoryCharacter?: boolean;
  isPassingReference?: boolean;
  aliases?: string[];
  role?: string;
  age?: string;
  pronouns?: string;
  relationships?: string;
  physicalDetails?: string;
  sourceAppearances?: RawCodexAppearance[];
  suggestedTags?: string[];
  [key: string]: unknown;
}

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
const NAME_PUNCT_RE = new RegExp('[.,\\u2019\'"`]', 'g');
function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(DIACRITICS_RE, '')
    .replace(NAME_PUNCT_RE, '').replace(/\s+/g, ' ').trim();
}

const VALID_CODEX_TYPES = new Set(['character', 'reference', 'place', 'object', 'motif', 'institution', 'publication', 'event', 'document', 'theme', 'relationship', 'custom']);

export function mergeCodexEntries(raw: RawCodexEntry[]): RawCodexEntry[] {
  const merged: RawCodexEntry[] = [];
  const nameIndex = new Map<string, number>();

  for (const entry of raw) {
    if (!entry || !entry.name || !entry.codexType) continue;
    let codexType = String(entry.codexType).toLowerCase();
    if (!VALID_CODEX_TYPES.has(codexType)) codexType = 'custom';

    const norm = normalizeName(String(entry.name));
    const aliasNorms = (entry.aliases ?? []).map((a) => normalizeName(String(a))).filter(Boolean);

    let targetIdx = -1;
    for (const key of [norm, ...aliasNorms]) {
      const idx = nameIndex.get(`${codexType}::${key}`);
      if (idx !== undefined) { targetIdx = idx; break; }
    }

    if (targetIdx === -1) {
      const clean: RawCodexEntry = {
        ...entry,
        codexType,
        aliases: Array.from(new Set((entry.aliases ?? []).map((a) => String(a)).filter(Boolean))),
        sourceAppearances: Array.isArray(entry.sourceAppearances) ? entry.sourceAppearances : [],
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.5,
        isActualStoryCharacter: !!entry.isActualStoryCharacter,
        isPassingReference: !!entry.isPassingReference,
      };
      const pos = merged.length;
      merged.push(clean);
      nameIndex.set(`${codexType}::${norm}`, pos);
      for (const a of aliasNorms) nameIndex.set(`${codexType}::${a}`, pos);
    } else {
      const ex = merged[targetIdx];
      const aliasSet = new Set([...(ex.aliases ?? []), ...(entry.aliases ?? [])].map((a) => String(a)).filter(Boolean));
      ex.aliases = Array.from(aliasSet);
      ex.sourceAppearances = [...(ex.sourceAppearances ?? []), ...(Array.isArray(entry.sourceAppearances) ? entry.sourceAppearances : [])];
      if ((entry.description?.length ?? 0) > (ex.description?.length ?? 0)) ex.description = entry.description;
      if ((entry.confidence ?? 0) > (ex.confidence ?? 0)) ex.confidence = entry.confidence;
      ex.isActualStoryCharacter = ex.isActualStoryCharacter || !!entry.isActualStoryCharacter;
      ex.isPassingReference = ex.isPassingReference && !!entry.isPassingReference;
      for (const k of ['characterTier', 'narrativeFunction', 'role', 'age', 'pronouns', 'relationships', 'physicalDetails', 'atmosphere', 'meaning', 'appearances']) {
        if (!ex[k] && entry[k]) ex[k] = entry[k];
      }
      for (const a of aliasNorms) if (!nameIndex.has(`${codexType}::${a}`)) nameIndex.set(`${codexType}::${a}`, targetIdx);
    }
  }

  for (const e of merged) {
    const seen = new Map<string, RawCodexAppearance>();
    for (const a of e.sourceAppearances ?? []) {
      if (!a || !a.itemId) continue;
      const key = `${a.itemId}::${(a.evidence ?? '').slice(0, 40)}`;
      if (seen.has(key)) {
        const prev = seen.get(key)!;
        prev.occurrenceCount = (prev.occurrenceCount ?? 1) + (a.occurrenceCount ?? 1);
      } else {
        seen.set(key, { ...a, occurrenceCount: a.occurrenceCount ?? 1 });
      }
    }
    e.sourceAppearances = Array.from(seen.values());
  }

  const tierRank: Record<string, number> = { major: 0, secondary: 1, minor: 2 };
  merged.sort((a, b) => {
    const ac = a.codexType === 'character' ? 0 : 1;
    const bc = b.codexType === 'character' ? 0 : 1;
    if (ac !== bc) return ac - bc;
    const at = tierRank[String(a.characterTier)] ?? 3;
    const bt = tierRank[String(b.characterTier)] ?? 3;
    if (at !== bt) return at - bt;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  return merged;
}
